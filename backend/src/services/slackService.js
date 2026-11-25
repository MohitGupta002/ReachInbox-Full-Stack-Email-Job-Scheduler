const http = require('http');
const https = require('https');
const { URL } = require('url');
const { setNxEx } = require('./kvStoreService');
const SlackIntegration = require('../models/SlackIntegration');
const Sender = require('../models/Sender');

/**
 * Posts a JSON payload to a Slack incoming webhook URL (supports HTTPS and localhost HTTP in tests).
 */
function postToWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    try {
      const parsedUrl = new URL(webhookUrl);
      const isHttp = parsedUrl.protocol === 'http:';
      const client = isHttp ? http : https;
      const data = JSON.stringify(payload);

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttp ? 80 : 443),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 5000,
      };

      const req = client.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(body);
          } else {
            reject(new Error(`Slack webhook error HTTP ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error('Slack webhook request timed out'));
      });
      req.on('error', (err) => reject(err));
      req.write(data);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Sends at most 1 Slack rate-limit alert per sender per UTC hour window.
 */
async function notifySlackRateLimit({ userId, senderId, limit, hourKey }) {
  try {
    const integration = await SlackIntegration.findOne({
      where: { user_id: userId, is_active: true },
    });

    if (!integration || !integration.webhook_url) {
      return false;
    }

    const dedupKey = `slack:alerted:${senderId}:${hourKey}`;
    const acquired = await setNxEx(dedupKey, 3600);

    if (!acquired) {
      return false;
    }

    const sender = await Sender.findByPk(senderId);
    const senderEmail = sender ? sender.email : senderId;

    const payload = {
      text: `⚠️ *ReachInbox Rate Limit Alert* ⚠️\nSender *${senderEmail}* reached the hourly threshold of *${limit} emails/hour* for window *${hourKey}*.\nRemaining scheduled jobs have been automatically staggered into the next hour window without dropped messages.`,
      attachments: [
        {
          color: '#f59e0b',
          fields: [
            { title: 'Sender', value: senderEmail, short: true },
            { title: 'Hourly Limit', value: `${limit} emails/hr`, short: true },
            { title: 'Window', value: hourKey, short: true },
            { title: 'Status', value: 'Overflow jobs deferred cleanly', short: true },
          ],
          footer: 'ReachInbox Email Job Scheduler',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await postToWebhook(integration.webhook_url, payload);
    console.log(`[Slack] Live rate-limit alert sent for sender ${senderEmail} (Window: ${hourKey})`);
    return true;
  } catch (err) {
    console.warn(`[Slack] Failed to deliver alert: ${err.message}`);
    return false;
  }
}

module.exports = {
  postToWebhook,
  notifySlackRateLimit,
};
