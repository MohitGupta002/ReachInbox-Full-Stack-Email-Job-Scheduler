const { emailQueue } = require('../queues/emailQueue');
const EmailJob = require('../models/EmailJob');
const { indexEmailDoc } = require('./elasticService');
require('dotenv').config();

async function scheduleBatch({
  userId,
  senderId,
  recipients,
  subject,
  body,
  startTime,
  delayMs,
  hourlyLimit,
}) {
  const parsedStart = startTime ? new Date(startTime).getTime() : NaN;
  const baseMs = Number.isFinite(parsedStart) ? Math.max(Date.now(), parsedStart) : Date.now();
  const parsedDelay = Number(delayMs);
  const minDelay = Number.isFinite(parsedDelay) && parsedDelay >= 0
    ? parsedDelay
    : Number(process.env.MIN_DELAY_BETWEEN_EMAILS_MS) || 2000;

  const created = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = String(recipients[i] || '').trim();
    if (!recipient) continue;

    const targetMs = baseMs + i * minDelay;
    const idempotencyKey = `${userId}-${senderId}-${recipient}-${baseMs}-${i}`;

    // 1. Persist to PostgreSQL/SQLite (SCHEDULED)
    const jobRow = await EmailJob.create({
      user_id: userId,
      sender_id: senderId,
      recipient_email: recipient,
      subject,
      body,
      scheduled_at: new Date(targetMs),
      status: 'SCHEDULED',
      hourly_limit: hourlyLimit ? Number(hourlyLimit) : null,
      idempotency_key: idempotencyKey,
    });

    // 2. Deterministic BullMQ Job ID (No colons allowed in custom BullMQ jobId)
    const bullJobId = `email-${jobRow.id}`;
    await jobRow.update({ bull_job_id: bullJobId });

    // 3. Enqueue delayed BullMQ job when Redis/BullMQ queue is active
    if (emailQueue) {
      const delay = Math.max(0, targetMs - Date.now());
      await emailQueue.add(
        'send-email',
        {
          emailJobId: jobRow.id,
          userId,
          senderId,
          hourlyLimit: jobRow.hourly_limit,
        },
        {
          jobId: bullJobId,
          delay,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
        }
      );
    }

    // 4. Index in Elasticsearch
    await indexEmailDoc(jobRow);

    created.push(jobRow);
  }

  return created;
}

module.exports = {
  scheduleBatch,
};
