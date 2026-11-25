const { Op } = require('sequelize');
const EmailJob = require('../models/EmailJob');
const Sender = require('../models/Sender');
const { emailQueue } = require('../queues/emailQueue');
const { scheduleBatch } = require('../services/scheduleService');
const { searchEmails, updateEmailDoc } = require('../services/elasticService');

const SENDER_INCLUDE = [
  {
    model: Sender,
    as: 'sender',
    attributes: ['id', 'email', 'display_name', 'provider'],
  },
];

function serializeJobForList(jobRow) {
  const plain = typeof jobRow.toJSON === 'function' ? jobRow.toJSON() : { ...jobRow };
  let attachmentsMeta = [];
  if (plain.attachments_json) {
    try {
      const parsed = JSON.parse(plain.attachments_json);
      if (Array.isArray(parsed)) {
        attachmentsMeta = parsed.map((a) => ({
          filename: a.filename,
          contentType: a.contentType,
          size: a.size,
        }));
      }
    } catch (e) {
      attachmentsMeta = [];
    }
  }
  delete plain.attachments_json;
  plain.attachments = attachmentsMeta;
  return plain;
}

// Schedule batch of emails (with optional file attachments)
async function schedule(req, res) {
  try {
    const { senderId, recipients, subject, body, startTime, delayMs, hourlyLimit, attachments } = req.body;

    if (!senderId) {
      return res.status(400).json({ error: 'senderId is required' });
    }
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'recipients must be a non-empty array of email addresses' });
    }
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ error: 'subject is required' });
    }

    const sender = await Sender.findOne({
      where: { id: senderId, user_id: req.user.id },
    });
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found or does not belong to user' });
    }

    const effectiveLimit = Number(hourlyLimit) || Number(sender.hourly_limit) || 200;

    const createdJobs = await scheduleBatch({
      userId: req.user.id,
      senderId,
      recipients,
      subject: String(subject).trim(),
      body: body || '',
      startTime,
      delayMs,
      hourlyLimit: effectiveLimit,
      attachments,
    });

    res.status(201).json({
      message: `Successfully scheduled ${createdJobs.length} email(s)`,
      count: createdJobs.length,
      jobs: createdJobs.map(serializeJobForList),
    });
  } catch (err) {
    console.error('[EmailController] Error scheduling batch:', err);
    res.status(500).json({ error: err.message });
  }
}

// Get scheduled / delayed emails
async function getScheduled(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { count, rows } = await EmailJob.findAndCountAll({
      where: {
        user_id: req.user.id,
        status: {
          [Op.in]: ['SCHEDULED', 'DELAYED_RATE_LIMIT'],
        },
      },
      include: SENDER_INCLUDE,
      order: [['scheduled_at', 'ASC']],
      limit,
      offset,
    });

    res.json({
      total: count,
      page,
      totalPages: Math.max(1, Math.ceil(count / limit)),
      emails: rows.map(serializeJobForList),
    });
  } catch (err) {
    console.error('[EmailController] Error fetching scheduled:', err);
    res.status(500).json({ error: err.message });
  }
}

// Get sent / failed emails
async function getSent(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { count, rows } = await EmailJob.findAndCountAll({
      where: {
        user_id: req.user.id,
        status: {
          [Op.in]: ['SENT', 'FAILED'],
        },
      },
      include: SENDER_INCLUDE,
      order: [
        ['sent_at', 'DESC'],
        ['updated_at', 'DESC'],
      ],
      limit,
      offset,
    });

    res.json({
      total: count,
      page,
      totalPages: Math.max(1, Math.ceil(count / limit)),
      emails: rows.map(serializeJobForList),
    });
  } catch (err) {
    console.error('[EmailController] Error fetching sent:', err);
    res.status(500).json({ error: err.message });
  }
}

// Full-text search with Elasticsearch (or DB fallback)
async function search(req, res) {
  try {
    const { q, status, page = 1, limit = 50 } = req.query;
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (parsedPage - 1) * parsedLimit;

    const results = await searchEmails({
      userId: req.user.id,
      query: q || '',
      status: status || null,
      limit: parsedLimit,
      offset,
    });

    res.json({
      ...results,
      emails: (results.emails || []).map(serializeJobForList),
      page: parsedPage,
      totalPages: Math.max(1, Math.ceil((results.total || 0) / parsedLimit)),
    });
  } catch (err) {
    console.error('[EmailController] Error searching emails:', err);
    res.status(500).json({ error: err.message });
  }
}

// Aggregate stats for dashboard metrics
async function getStats(req, res) {
  try {
    const userId = req.user.id;

    const [scheduledCount, sentCount, rateLimitedCount, failedCount, sendersCount] = await Promise.all([
      EmailJob.count({ where: { user_id: userId, status: 'SCHEDULED' } }),
      EmailJob.count({ where: { user_id: userId, status: 'SENT' } }),
      EmailJob.count({ where: { user_id: userId, status: 'DELAYED_RATE_LIMIT' } }),
      EmailJob.count({ where: { user_id: userId, status: 'FAILED' } }),
      Sender.count({ where: { user_id: userId } }),
    ]);

    res.json({
      scheduled: scheduledCount,
      sent: sentCount,
      rateLimited: rateLimitedCount,
      failed: failedCount,
      totalActive: scheduledCount + rateLimitedCount,
      senders: sendersCount,
    });
  } catch (err) {
    console.error('[EmailController] Error getting stats:', err);
    res.status(500).json({ error: err.message });
  }
}

async function enqueueRetryRecord(jobRow) {
  await jobRow.update({
    status: 'SCHEDULED',
    scheduled_at: new Date(),
    retry_count: 0,
    error_message: null,
  });
  await updateEmailDoc(jobRow);

  if (emailQueue) {
    await emailQueue.add(
      'send-email',
      {
        emailJobId: jobRow.id,
        userId: jobRow.user_id,
        senderId: jobRow.sender_id,
        hourlyLimit: jobRow.hourly_limit,
      },
      {
        jobId: `email-${jobRow.id}-retry-${Date.now()}`,
        delay: 0,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }
    );
  }
}

// Retry a failed email job immediately
async function retryJob(req, res) {
  try {
    const jobRow = await EmailJob.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!jobRow) {
      return res.status(404).json({ error: 'Email job not found' });
    }
    if (jobRow.status === 'SENT') {
      return res.status(400).json({ error: 'Email has already been sent' });
    }

    await enqueueRetryRecord(jobRow);
    res.json({ message: 'Email re-queued for immediate delivery', job: serializeJobForList(jobRow) });
  } catch (err) {
    console.error('[EmailController] Retry failed:', err);
    res.status(500).json({ error: err.message });
  }
}

// Retry all failed jobs for authenticated user
async function retryAllFailed(req, res) {
  try {
    const failedJobs = await EmailJob.findAll({
      where: { user_id: req.user.id, status: 'FAILED' },
    });

    for (const jobRow of failedJobs) {
      await enqueueRetryRecord(jobRow);
    }

    res.json({ message: `Re-queued ${failedJobs.length} failed job(s)`, count: failedJobs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Delete a non-sent / failed job record
async function deleteJob(req, res) {
  try {
    const deleted = await EmailJob.destroy({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Email job not found' });
    }

    res.json({ message: 'Email job removed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  schedule,
  getScheduled,
  getSent,
  search,
  getStats,
  retryJob,
  retryAllFailed,
  deleteJob,
};
