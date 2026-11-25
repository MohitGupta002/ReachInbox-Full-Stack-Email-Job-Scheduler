const https = require('https');
const querystring = require('querystring');
const jwt = require('jsonwebtoken');
const SlackIntegration = require('../models/SlackIntegration');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_reachinbox_key_2026';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID;
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET;
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI || 'http://localhost:5000/api/slack/callback';

// Start Slack OAuth v2 flow
async function connect(req, res) {
  if (!SLACK_CLIENT_ID || SLACK_CLIENT_ID === 'your_slack_client_id') {
    return res.redirect(`${FRONTEND_URL}/?slack_modal=manual`);
  }

  const state = jwt.sign({ userId: req.user.id }, JWT_SECRET, { expiresIn: '15m' });
  const slackAuthUrl = `https://slack.com/oauth/v2/authorize?client_id=${SLACK_CLIENT_ID}&scope=incoming-webhook&redirect_uri=${encodeURIComponent(
    SLACK_REDIRECT_URI
  )}&state=${state}`;

  res.redirect(slackAuthUrl);
}

// Slack OAuth v2 callback
async function callback(req, res) {
  const { code, state, error } = req.query;

  if (error) {
    return res.redirect(`${FRONTEND_URL}/?slack=denied`);
  }

  if (!code || !state) {
    return res.redirect(`${FRONTEND_URL}/?slack=missing_params`);
  }

  try {
    const decoded = jwt.verify(state, JWT_SECRET);
    const userId = decoded.userId;

    // Exchange code with Slack
    const postData = querystring.stringify({
      code,
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      redirect_uri: SLACK_REDIRECT_URI,
    });

    const tokenResponse = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'slack.com',
        path: '/api/oauth.v2.access',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const request = https.request(options, (response) => {
        let body = '';
        response.on('data', (d) => { body += d; });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      });

      request.on('error', (err) => reject(err));
      request.write(postData);
      request.end();
    });

    if (!tokenResponse.ok) {
      console.error('[Slack] OAuth access failed:', tokenResponse.error);
      return res.redirect(`${FRONTEND_URL}/?slack=failed`);
    }

    const incomingWebhook = tokenResponse.incoming_webhook;

    await SlackIntegration.upsert({
      user_id: userId,
      team_id: tokenResponse.team ? tokenResponse.team.id : null,
      team_name: tokenResponse.team ? tokenResponse.team.name : null,
      channel_id: incomingWebhook ? incomingWebhook.channel_id : null,
      channel_name: incomingWebhook ? incomingWebhook.channel : null,
      webhook_url: incomingWebhook ? incomingWebhook.url : null,
      access_token: tokenResponse.access_token,
      is_active: true,
    });

    res.redirect(`${FRONTEND_URL}/?slack=connected`);
  } catch (err) {
    console.error('[Slack] Callback error:', err);
    res.redirect(`${FRONTEND_URL}/?slack=error`);
  }
}

// Get Slack connection status for current user
async function getStatus(req, res) {
  try {
    const integration = await SlackIntegration.findOne({
      where: { user_id: req.user.id },
    });

    if (!integration || !integration.is_active) {
      return res.json({ connected: false });
    }

    res.json({
      connected: true,
      teamName: integration.team_name,
      channelName: integration.channel_name,
      webhookUrl: integration.webhook_url ? `${integration.webhook_url.slice(0, 30)}...` : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Disconnect Slack
async function disconnect(req, res) {
  try {
    const integration = await SlackIntegration.findOne({
      where: { user_id: req.user.id },
    });

    if (integration) {
      await integration.update({ is_active: false });
    }

    res.json({ message: 'Slack integration disconnected successfully', connected: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Connect manual webhook directly
async function connectManualWebhook(req, res) {
  try {
    const { webhookUrl, channelName, teamName } = req.body;
    const isTestLocalWebhook =
      process.env.NODE_ENV === 'test' &&
      /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(String(webhookUrl || ''));

    if (
      !webhookUrl ||
      (!webhookUrl.startsWith('https://hooks.slack.com/') && !isTestLocalWebhook)
    ) {
      return res.status(400).json({ error: 'Valid Slack webhook URL starting with https://hooks.slack.com/ is required' });
    }

    await SlackIntegration.upsert({
      user_id: req.user.id,
      webhook_url: webhookUrl,
      channel_name: channelName || '#email-alerts',
      team_name: teamName || 'Workspace',
      is_active: true,
    });

    res.json({ message: 'Slack webhook connected successfully', connected: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  connect,
  callback,
  getStatus,
  disconnect,
  connectManualWebhook,
};
