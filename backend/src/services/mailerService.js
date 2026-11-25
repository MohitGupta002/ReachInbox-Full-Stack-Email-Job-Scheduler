const dns = require('dns').promises;
const net = require('net');
const nodemailer = require('nodemailer');
const Sender = require('../models/Sender');

// Cache resolved transports briefly (5 minutes) so rotating SMTP IPs stay fresh
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
 * Verifies SMTP credentials via handshake before saving a real Gmail / custom SMTP sender.
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

// Send email job via sender's transport (works identically for Ethereal and Gmail/custom SMTP)
async function sendEmailWithSender(emailJob) {
  const sender = await Sender.findByPk(emailJob.sender_id);
  if (!sender) {
    throw new Error(`Sender with ID ${emailJob.sender_id} not found.`);
  }

  const transport = await getOrCreateTransport(sender);
  const bodyText = emailJob.body || '';

  const info = await transport.sendMail({
    from: `"${sender.display_name || sender.email}" <${sender.email}>`,
    to: emailJob.recipient_email,
    subject: emailJob.subject,
    text: bodyText,
    html: `<div style="font-family: sans-serif; line-height: 1.6;">${bodyText.replace(/\n/g, '<br/>')}</div>`,
  });

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
