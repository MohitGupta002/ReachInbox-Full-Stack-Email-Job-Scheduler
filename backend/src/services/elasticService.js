const { elastic, isElasticAvailable } = require('../config/elastic');
const { sequelize } = require('../config/db');
const EmailJob = require('../models/EmailJob');
const Sender = require('../models/Sender');
const { Op } = require('sequelize');

async function indexEmailDoc(job) {
  if (!isElasticAvailable || !isElasticAvailable()) return;

  try {
    await elastic.index({
      index: 'emails',
      id: job.id,
      body: {
        id: job.id,
        user_id: job.user_id,
        sender_id: job.sender_id,
        recipient_email: job.recipient_email,
        subject: job.subject,
        body: job.body,
        status: job.status,
        scheduled_at: job.scheduled_at,
        sent_at: job.sent_at || null,
        ethereal_preview_url: job.ethereal_preview_url || null,
        message_id: job.message_id || null,
        error_message: job.error_message || null,
        created_at: job.createdAt || job.created_at || new Date(),
      },
    });
  } catch (err) {
    console.warn(`[Elasticsearch] Indexing fallback warning: ${err.message || err.code}`);
  }
}

async function updateEmailDoc(job) {
  if (!isElasticAvailable || !isElasticAvailable()) return;

  try {
    await elastic.update({
      index: 'emails',
      id: job.id,
      body: {
        doc: {
          status: job.status,
          scheduled_at: job.scheduled_at,
          sent_at: job.sent_at || null,
          ethereal_preview_url: job.ethereal_preview_url || null,
          message_id: job.message_id || null,
          error_message: job.error_message || null,
        },
      },
    });
  } catch (err) {
    console.warn(`[Elasticsearch] Update warning: ${err.message || err.code}`);
  }
}

async function searchEmails({ userId, query, status, limit = 50, offset = 0 }) {
  const normalizedStatus = status ? status.trim().toUpperCase() : null;

  if (isElasticAvailable && isElasticAvailable()) {
    try {
      const mustClauses = [];
      const filterClauses = [{ term: { user_id: userId } }];

      if (query && query.trim()) {
        mustClauses.push({
          multi_match: {
            query: query.trim(),
            fields: ['recipient_email', 'subject', 'body'],
            fuzziness: 'AUTO',
          },
        });
      } else {
        mustClauses.push({ match_all: {} });
      }

      if (normalizedStatus) {
        filterClauses.push({ term: { status: normalizedStatus } });
      }

      const esResult = await elastic.search({
        index: 'emails',
        from: offset,
        size: limit,
        body: {
          query: {
            bool: {
              must: mustClauses,
              filter: filterClauses,
            },
          },
          sort: [{ scheduled_at: { order: 'desc' } }],
        },
      });

      const hits = esResult.hits.hits.map((h) => ({
        ...h._source,
        id: h._id,
      }));

      return {
        total: typeof esResult.hits.total === 'number' ? esResult.hits.total : esResult.hits.total.value,
        emails: hits,
        source: 'elasticsearch',
      };
    } catch (err) {
      console.warn(`[Elasticsearch] Query fallback triggered: ${err.message || err.code}`);
    }
  }

  // Fallback cleanly to relational database search when Elasticsearch is offline
  const whereClause = { user_id: userId };
  if (normalizedStatus) {
    whereClause.status = normalizedStatus;
  }

  if (query && query.trim()) {
    const likeOp = sequelize.getDialect() === 'postgres' ? Op.iLike : Op.like;
    const pattern = `%${query.trim()}%`;
    whereClause[Op.or] = [
      { recipient_email: { [likeOp]: pattern } },
      { subject: { [likeOp]: pattern } },
      { body: { [likeOp]: pattern } },
    ];
  }

  const { count, rows } = await EmailJob.findAndCountAll({
    where: whereClause,
    include: [
      {
        model: Sender,
        as: 'sender',
        attributes: ['id', 'email', 'display_name', 'provider'],
      },
    ],
    limit,
    offset,
    order: [['scheduled_at', 'DESC']],
  });

  return {
    total: count,
    emails: rows,
    source: 'database_fallback',
  };
}

module.exports = {
  indexEmailDoc,
  updateEmailDoc,
  searchEmails,
};
