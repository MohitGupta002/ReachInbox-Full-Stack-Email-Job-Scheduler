const express = require('express');
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { emailQueue } = require('./emailQueue');
const EmailJob = require('../models/EmailJob');

let serverAdapter = null;

if (emailQueue) {
  serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [new BullMQAdapter(emailQueue)],
    serverAdapter,
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Serves live Bull Board when Redis is online, or a database-backed Queue Inspector
 * UI at /admin/queues when operating in standalone fallback mode.
 */
function getQueueInspectorRouter() {
  if (serverAdapter) {
    return serverAdapter.getRouter();
  }

  const router = express.Router();

  router.get('/api/jobs', async (req, res) => {
    try {
      const jobs = await EmailJob.findAll({
        order: [['scheduled_at', 'DESC']],
        limit: 100,
      });
      res.json({ mode: 'standalone_fallback', jobs });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/', async (req, res) => {
    try {
      const jobs = await EmailJob.findAll({
        order: [['scheduled_at', 'DESC']],
        limit: 100,
      });

      const counts = {
        SCHEDULED: jobs.filter((j) => j.status === 'SCHEDULED').length,
        DELAYED_RATE_LIMIT: jobs.filter((j) => j.status === 'DELAYED_RATE_LIMIT').length,
        SENT: jobs.filter((j) => j.status === 'SENT').length,
        FAILED: jobs.filter((j) => j.status === 'FAILED').length,
      };

      const rowsHtml = jobs
        .map(
          (job) => `
          <tr>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${escapeHtml(job.bull_job_id || job.id)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(job.recipient_email)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(job.subject)}</td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;"><strong>${escapeHtml(job.status)}</strong></td>
            <td style="padding:10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(job.scheduled_at ? new Date(job.scheduled_at).toLocaleString() : '')}</td>
          </tr>`
        )
        .join('');

      res.setHeader('Content-Type', 'text/html');
      res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>BullMQ / Queue Inspector — Gmail Scheduler</title>
  <meta http-equiv="refresh" content="5" />
</head>
<body style="font-family:system-ui,-apple-system,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <div>
        <h1 style="margin:0;font-size:22px;">email-queue Inspector</h1>
        <p style="margin:4px 0 0;color:#64748b;font-size:13px;">Standalone SQLite Persistent Queue Fallback (Redis unreachable on host; auto-refreshes every 5s)</p>
      </div>
      <a href="/" style="padding:8px 14px;background:#2563eb;color:#fff;text-decoration:none;border-radius:10px;font-size:13px;font-weight:600;">Back to Dashboard</a>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #e2e8f0;"><div style="font-size:12px;color:#64748b;">Delayed / Scheduled</div><div style="font-size:26px;font-weight:700;color:#2563eb;">${counts.SCHEDULED}</div></div>
      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #e2e8f0;"><div style="font-size:12px;color:#64748b;">Rate-Limit Deferred</div><div style="font-size:26px;font-weight:700;color:#d97706;">${counts.DELAYED_RATE_LIMIT}</div></div>
      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #e2e8f0;"><div style="font-size:12px;color:#64748b;">Completed / Sent</div><div style="font-size:26px;font-weight:700;color:#059669;">${counts.SENT}</div></div>
      <div style="background:#fff;padding:16px;border-radius:14px;border:1px solid #e2e8f0;"><div style="font-size:12px;color:#64748b;">Failed</div><div style="font-size:26px;font-weight:700;color:#e11d48;">${counts.FAILED}</div></div>
    </div>
    <div style="background:#fff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
        <thead style="background:#f1f5f9;color:#475569;font-size:11px;text-transform:uppercase;">
          <tr>
            <th style="padding:12px 10px;">Job ID</th>
            <th style="padding:12px 10px;">Recipient</th>
            <th style="padding:12px 10px;">Subject</th>
            <th style="padding:12px 10px;">State</th>
            <th style="padding:12px 10px;">Scheduled For</th>
          </tr>
        </thead>
        <tbody>${rowsHtml || '<tr><td colspan="5" style="padding:24px;text-align:center;color:#94a3b8;">No jobs queued yet.</td></tr>'}</tbody>
      </table>
    </div>
  </div>
</body>
</html>`);
    } catch (err) {
      res.status(500).send(`Queue Inspector Error: ${escapeHtml(err.message)}`);
    }
  });

  return router;
}

module.exports = { serverAdapter, getQueueInspectorRouter };
