const { Op } = require('sequelize');
const EmailJob = require('../models/EmailJob');
const Sender = require('../models/Sender');
const { scheduleBatch } = require('../services/scheduleService');
const { searchEmails } = require('../services/elasticService');

const SENDER_INCLUDE = [
  {
    model: Sender,
    as: 'sender',
    attributes: ['id', 'email', 'display_name', 'provider'],
  },
];

// Schedule batch of emails
async function schedule(req, res) {
  try {
    const { senderId, recipients, subject, body, startTime, delayMs, hourlyLimit } = req.body;

    if (!senderId) {
      return res.status(400).json({ error: 'senderId is required' });
    }
    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'recipients must be a non-empty array of email addresses' });
    }
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ error: 'subject is required' });
    }

    // Verify sender belongs to user
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
    });

    res.status(201).json({
      message: `Successfully scheduled ${createdJobs.length} email(s)`,
      count: createdJobs.length,
      jobs: createdJobs,
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
      emails: rows,
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
      emails: rows,
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

module.exports = {
  schedule,
  getScheduled,
  getSent,
  search,
  getStats,
};
