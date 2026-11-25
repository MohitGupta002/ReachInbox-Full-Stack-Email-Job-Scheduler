const dns = require('dns').promises;
const net = require('net');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const Sender = require('../models/Sender');
require('dotenv').config();

// Cache resolved SMTP transports briefly (5 minutes) so rotating SMTP IPs stay fresh
const transportCache = new Map();
const TRANSPORT_TTL_MS = 5 * 60 * 1000;

/**
 * Resolves SMTP hostnames via OS getaddrinfo (IPv4 preferred) instead of Nodemailer's
 * internal c-ares dns.Resolver.resolve4, avoiding Windows queryA ETIMEOUT hangs.
 */
async function resolveSmtpHost(hostname) {
  const host = String(hostname || '').trim();
  if (!host || net.isIP(host)) {
    return { connectHost: host, servername: host };
  }

  try {
    const { address } = await dns.lookup(host, { family: 4 });
    return { connectHost: address, servername: host };
  } catch (ipv4Err) {
    try {
      const { address } = await dns.lookup(host);
      return { connectHost: address, servername: host };
    } catch (fallbackErr) {
      return { connectHost: host, servername: host };
    }
  }
}

async function buildTransport(senderConfig) {
  const port = Number(senderConfig.smtp_port) || 587;
  const { connectHost, servername } = await resolveSmtpHost(senderConfig.smtp_host);

  return nodemailer.createTransport({
    host: connectHost,
    port,
    secure: port === 465,
    tls: {
      servername,
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: senderConfig.smtp_user,
      pass: senderConfig.smtp_pass,
    },
  });
}

async function getOrCreateTransport(sender) {
  const cached = transportCache.get(sender.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.transport;
  }

  const transport = await buildTransport(sender);
  transportCache.set(sender.id, {
    transport,
    expiresAt: Date.now() + TRANSPORT_TTL_MS,
  });
  return transport;
}

function parseJobAttachments(emailJob) {
  if (!emailJob.attachments_json) return [];
  try {
    const parsed = JSON.parse(emailJob.attachments_json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((att) => att && att.filename && att.contentBase64)
      .map((att) => ({
        filename: String(att.filename),
        contentType: att.contentType || 'application/octet-stream',
        content: Buffer.from(att.contentBase64, 'base64'),
        contentBase64: att.contentBase64,
      }));
  } catch (err) {
    return [];
  }
}

/**
 * Sends via Google Gmail REST API over HTTPS (port 443), avoiding blocked SMTP ports on Render Free Tier.
 */
async function sendViaGmailOAuthApi(sender, mailOptions) {
  const secretSpec = String(sender.smtp_pass || '');
  let accessToken = null;

  if (secretSpec.startsWith('refresh:')) {
    const refreshToken = secretSpec.slice('refresh:'.length);
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error(
        `Google OAuth token refresh failed: ${tokenData.error_description || tokenData.error || tokenRes.status}. Reconnect Gmail OAuth in Settings.`
      );
    }
    accessToken = tokenData.access_token;
  } else if (secretSpec.startsWith('access:')) {
    accessToken = secretSpec.slice('access:'.length);
  } else {
    throw new Error('Missing Gmail OAuth token. Reconnect Gmail via Google OAuth in Settings.');
  }

  const composer = new MailComposer(mailOptions);
  const rawMimeBuffer = await composer.compile().build();
  const base64Url = rawMimeBuffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64Url }),
  });

  const sendData = await sendRes.json();
  if (!sendRes.ok) {
    const msg = sendData.error?.message || JSON.stringify(sendData);
    throw new Error(`Gmail API send failed (${sendRes.status}): ${msg}`);
  }

  return {
    messageId: sendData.id || `gmail-api-${Date.now()}`,
    previewUrl: null,
    provider: 'gmail_oauth',
  };
}

/**
 * Sends via Resend HTTPS REST API (port 443) for cloud environments where SMTP ports are blocked.
 */
async function sendViaResendApi(sender, mailOptions, rawAttachments) {
  const payload = {
    from: mailOptions.from,
    to: [mailOptions.to],
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html,
    ...(rawAttachments.length > 0
      ? {
          attachments: rawAttachments.map((att) => ({
            filename: att.filename,
            content: att.contentBase64,
          })),
        }
      : {}),
  };

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sender.smtp_pass}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Resend API error (${res.status}): ${data.message || JSON.stringify(data)}`);
  }

  return {
    messageId: data.id || `resend-${Date.now()}`,
    previewUrl: null,
    provider: 'resend',
  };
}

// Generate a new Ethereal fake SMTP sender account
async function createEtherealAccount(userId, displayName = 'ReachInbox Team', hourlyLimit = 200) {
  const testAccount = await nodemailer.createTestAccount();
  return Sender.create({
    user_id: userId,
    email: testAccount.user,
    display_name: displayName,
    smtp_host: testAccount.smtp.host,
    smtp_port: testAccount.smtp.port,
    smtp_user: testAccount.user,
    smtp_pass: testAccount.pass,
    hourly_limit: Number(hourlyLimit) || 200,
    provider: 'ethereal',
  });
}

/**
 * Verifies SMTP credentials via handshake before saving a real Gmail / custom SMTP / Resend sender.
 */
async function createCustomSmtpSender({
  userId,
  email,
  displayName,
  smtpHost = 'smtp.gmail.com',
  smtpPort = 465,
  smtpUser,
  smtpPass,
  hourlyLimit = 200,
  provider = 'gmail',
  skipVerify = false,
}) {
  if (provider === 'resend') {
    if (!smtpPass || !String(smtpPass).trim().startsWith('re_')) {
      throw new Error('Resend API Key must start with re_');
    }
    return Sender.create({
      user_id: userId,
      email: email.trim(),
      display_name: displayName || email.trim(),
      smtp_host: 'api.resend.com',
      smtp_port: 443,
      smtp_user: email.trim(),
      smtp_pass: String(smtpPass).trim(),
      hourly_limit: Number(hourlyLimit) || 200,
      provider: 'resend',
    });
  }

  const normalizedUser = (smtpUser || email || '').trim();
  const normalizedPass =
    provider === 'gmail' ? String(smtpPass || '').replace(/\s+/g, '') : String(smtpPass || '');

  const config = {
    smtp_host: smtpHost.trim(),
    smtp_port: Number(smtpPort) || 465,
    smtp_user: normalizedUser,
    smtp_pass: normalizedPass,
  };

  if (!skipVerify) {
    const tempTransport = await buildTransport(config);
    await tempTransport.verify();
  }

  return Sender.create({
    user_id: userId,
    email: email.trim(),
    display_name: displayName || email.trim(),
    smtp_host: config.smtp_host,
    smtp_port: config.smtp_port,
    smtp_user: config.smtp_user,
    smtp_pass: config.smtp_pass,
    hourly_limit: Number(hourlyLimit) || 200,
    provider,
  });
}

// Send email job via sender's transport (supports Ethereal, Gmail SMTP, Gmail OAuth API, and Resend API)
async function sendEmailWithSender(emailJob) {
  const sender = await Sender.findByPk(emailJob.sender_id);
  if (!sender) {
    throw new Error(`Sender with ID ${emailJob.sender_id} not found.`);
  }

  const bodyText = emailJob.body || '';
  const parsedAttachments = parseJobAttachments(emailJob);

  const mailOptions = {
    from: `"${sender.display_name || sender.email}" <${sender.email}>`,
    to: emailJob.recipient_email,
    subject: emailJob.subject,
    text: bodyText,
    html: `<div style="font-family: sans-serif; line-height: 1.6;">${bodyText.replace(/\n/g, '<br/>')}</div>`,
    ...(parsedAttachments.length > 0
      ? {
          attachments: parsedAttachments.map((att) => ({
            filename: att.filename,
            content: att.content,
            contentType: att.contentType,
          })),
        }
      : {}),
  };

  if (sender.provider === 'gmail_oauth') {
    return sendViaGmailOAuthApi(sender, mailOptions);
  }

  if (sender.provider === 'resend') {
    return sendViaResendApi(sender, mailOptions, parsedAttachments);
  }

  const transport = await getOrCreateTransport(sender);
  const info = await transport.sendMail(mailOptions);
  const previewUrl = nodemailer.getTestMessageUrl(info) || null;

  return {
    messageId: info.messageId,
    previewUrl,
    provider: sender.provider || 'ethereal',
  };
}

module.exports = {
  getOrCreateTransport,
  createEtherealAccount,
  createCustomSmtpSender,
  sendEmailWithSender,
  sendViaEthereal: sendEmailWithSender,
};
