const EmailJob = require('../models/EmailJob');
const Sender = require('../models/Sender');
const { withSqliteWriteLock } = require('../config/db');
const { decrKey } = require('./kvStoreService');
const { checkAndIncrementRate, computeNextHourStagger } = require('./rateLimitService');
const { notifySlackRateLimit } = require('./slackService');
const { sendEmailWithSender } = require('./mailerService');
const { updateEmailDoc } = require('./elasticService');
require('dotenv').config();

const inFlightJobIds = new Set();
const MAX_STANDALONE_RETRIES = 2; // 3 total attempts matching BullMQ attempts: 3

/**
 * Core processing pipeline shared by both the BullMQ Worker and Standalone Dispatcher.
 * Guarantees idempotency, distributed hourly rate limiting, overflow stagger, and Slack deduping.
 */
async function processEmailJob({ emailJobId, hourlyLimit, onRateLimited }) {
  if (inFlightJobIds.has(emailJobId)) {
    return { skipped: true, reason: 'in_flight' };
  }
  inFlightJobIds.add(emailJobId);

  try {
    const record = await EmailJob.findByPk(emailJobId);

    // 1. Dual Idempotency Guard: never re-send a job already marked SENT
    if (!record || record.status === 'SENT') {
      return { skipped: true, reason: 'already_sent_or_missing' };
    }

    const sender = await Sender.findByPk(record.sender_id);
    if (!sender) {
      throw new Error(`Sender with ID ${record.sender_id} not found.`);
    }

    const effectiveLimit =
      Number(hourlyLimit) ||
      Number(record.hourly_limit) ||
      Number(sender.hourly_limit) ||
      Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) ||
      200;

    // 2. Atomic Distributed Hourly Rate Limiting
    const { isExceeded, hourKey } = await checkAndIncrementRate(record.sender_id, effectiveLimit);
    const rateKey = `ratelimit:${record.sender_id}:${hourKey}`;

    // 3. Overflow Handling (Hourly Cap Hit -> Defer cleanly without dropping)
    if (isExceeded) {
      await notifySlackRateLimit({
        userId: record.user_id,
        senderId: record.sender_id,
        limit: effectiveLimit,
        hourKey,
      });

      const minDelay = Number(process.env.MIN_DELAY_BETWEEN_EMAILS_MS) || 2000;
      const { nextRunMs, nextHourDate } = await computeNextHourStagger(record.sender_id, minDelay);

      console.warn(
        `[Worker] Rate limit (${effectiveLimit}/hr) hit for sender ${sender.email}. Deferring job ${record.id} to ${nextHourDate.toISOString()}`
      );

      await withSqliteWriteLock(() =>
        record.update({
          status: 'DELAYED_RATE_LIMIT',
          scheduled_at: nextHourDate,
        })
      );
      await updateEmailDoc(record);

      if (typeof onRateLimited === 'function') {
        await onRateLimited(nextRunMs);
      }

      return { deferred: true, nextRunAt: nextHourDate };
    }

    // 4. Deliver via configured SMTP transport (Ethereal or Gmail/custom SMTP)
    try {
      const info = await sendEmailWithSender(record);
      await withSqliteWriteLock(() =>
        record.update({
          status: 'SENT',
          sent_at: new Date(),
          ethereal_preview_url: info.previewUrl,
          message_id: info.messageId || null,
          error_message: null,
        })
      );
      await updateEmailDoc(record);

      console.log(
        `[Worker] Email ${record.id} sent via ${info.provider} to ${record.recipient_email}` +
          (info.previewUrl ? ` | Preview: ${info.previewUrl}` : ` | Message-ID: ${info.messageId}`)
      );

      return { success: true, previewUrl: info.previewUrl, messageId: info.messageId };
    } catch (err) {
      // Refund hourly rate counter since email was not actually dispatched
      await decrKey(rateKey).catch(() => {});

      const currentRetries = Number(record.retry_count) || 0;
      const isBullMqCaller = typeof onRateLimited === 'function';

      // In standalone fallback mode, retry transient SMTP failures with exponential backoff
      if (!isBullMqCaller && currentRetries < MAX_STANDALONE_RETRIES) {
        const nextRetry = currentRetries + 1;
        const backoffMs = 5000 * Math.pow(2, currentRetries);
        const retryAt = new Date(Date.now() + backoffMs);
        console.warn(
          `[Worker] Delivery attempt ${nextRetry} failed for ${record.id} (${err.message}). Retrying at ${retryAt.toISOString()}`
        );
        await withSqliteWriteLock(() =>
          record.update({
            status: 'SCHEDULED',
            retry_count: nextRetry,
            scheduled_at: retryAt,
            error_message: err.message,
          })
        );
        await updateEmailDoc(record);
        return { retrying: true, nextRetry, retryAt };
      }

      console.error(`[Worker] Delivery failed permanently for email ${record.id}: ${err.message}`);
      await withSqliteWriteLock(() =>
        record.update({
          status: 'FAILED',
          error_message: err.message,
        })
      );
      await updateEmailDoc(record);
      throw err;
    }
  } finally {
    inFlightJobIds.delete(emailJobId);
  }
}

module.exports = {
  processEmailJob,
};
