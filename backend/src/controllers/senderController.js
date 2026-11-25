const Sender = require('../models/Sender');
const { createEtherealAccount, createCustomSmtpSender } = require('../services/mailerService');
const { getHourKey } = require('../services/rateLimitService');
const { getIntValue, deleteKey } = require('../services/kvStoreService');

function formatSafeSender(sender, usedThisHour = 0) {
  const limit = Number(sender.hourly_limit) || 200;
  return {
    id: sender.id,
    user_id: sender.user_id,
    email: sender.email,
    display_name: sender.display_name,
    smtp_host: sender.smtp_host,
    smtp_port: sender.smtp_port,
    hourly_limit: limit,
    used_this_hour: usedThisHour,
    remaining_this_hour: Math.max(0, limit - usedThisHour),
    provider: sender.provider || 'ethereal',
    created_at: sender.created_at,
  };
}

// Get all senders for user with live hourly quota usage
async function getSenders(req, res) {
  try {
    let senders = await Sender.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
    });

    if (senders.length === 0) {
      const defaultSender = await createEtherealAccount(
        req.user.id,
        `${req.user.name} (Ethereal)`,
        200
      );
      senders = [defaultSender];
    }

    const hourKey = getHourKey();
    const safeSenders = await Promise.all(
      senders.map(async (s) => {
        const used = await getIntValue(`ratelimit:${s.id}:${hourKey}`).catch(() => 0);
        return formatSafeSender(s, used);
      })
    );

    res.json(safeSenders);
  } catch (err) {
    console.error('[Senders] Error fetching senders:', err);
    res.status(500).json({ error: err.message });
  }
}

// Explicitly create an additional Ethereal sender
async function createSender(req, res) {
  try {
    const { displayName, hourlyLimit } = req.body;
    const sender = await createEtherealAccount(
      req.user.id,
      displayName || `${req.user.name} Outreach`,
      Number(hourlyLimit) || 200
    );

    res.status(201).json(formatSafeSender(sender, 0));
  } catch (err) {
    console.error('[Senders] Error creating sender:', err);
    res.status(500).json({ error: err.message });
  }
}

// Connect a real Gmail (App Password), custom SMTP, or Resend HTTPS API sender
async function createSmtpSender(req, res) {
  try {
    const {
      email,
      displayName,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      appPassword,
      apiKey,
      hourlyLimit,
      provider = 'gmail',
      skipVerify = false,
    } = req.body;

    const effectiveSecret = apiKey || appPassword || smtpPass;
    if (!email || !effectiveSecret) {
      return res.status(400).json({
        error: 'Email address and Gmail App Password / Resend API Key / SMTP password are required.',
      });
    }

    const sender = await createCustomSmtpSender({
      userId: req.user.id,
      email,
      displayName,
      smtpHost: smtpHost || 'smtp.gmail.com',
      smtpPort: smtpPort || 465,
      smtpUser: smtpUser || email,
      smtpPass: effectiveSecret,
      hourlyLimit: Number(hourlyLimit) || 200,
      provider,
      skipVerify: Boolean(skipVerify),
    });

    res.status(201).json({
      ...formatSafeSender(sender, 0),
      message: `Verified and connected ${sender.email} (${sender.smtp_host})`,
    });
  } catch (err) {
    console.error('[Senders] SMTP verification/creation failed:', err.message);
    res.status(400).json({
      error: `Authentication failed: ${err.message}`,
    });
  }
}

// Reset current UTC hour rate-limit counter for testing
async function resetRateLimit(req, res) {
  try {
    const sender = await Sender.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!sender) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    const hourKey = getHourKey();
    await deleteKey(`ratelimit:${sender.id}:${hourKey}`);
    await deleteKey(`slack:alerted:${sender.id}:${hourKey}`);

    res.json({
      message: `Cleared hourly rate-limit counter for ${sender.email} (window ${hourKey})`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Remove a sender belonging to the authenticated user
async function deleteSender(req, res) {
  try {
    const deleted = await Sender.destroy({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Sender not found' });
    }

    res.json({ message: 'Sender deleted successfully' });
  } catch (err) {
    console.error('[Senders] Error deleting sender:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  getSenders,
  createSender,
  createSmtpSender,
  resetRateLimit,
  deleteSender,
};
