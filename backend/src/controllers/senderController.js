const Sender = require('../models/Sender');
const { createEtherealAccount, createCustomSmtpSender } = require('../services/mailerService');

// Get all senders for user, auto-creating a default test sender if none exists
async function getSenders(req, res) {
  try {
    let senders = await Sender.findAll({
      where: { user_id: req.user.id },
      order: [['created_at', 'DESC']],
    });

    // Auto-provision a default Ethereal sender on first access if none
    if (senders.length === 0) {
      const defaultSender = await createEtherealAccount(
        req.user.id,
        `${req.user.name} (Ethereal)`,
        200
      );
      senders = [defaultSender];
    }

    // Never expose raw SMTP passwords to the frontend
    const safeSenders = senders.map((s) => ({
      id: s.id,
      user_id: s.user_id,
      email: s.email,
      display_name: s.display_name,
      smtp_host: s.smtp_host,
      smtp_port: s.smtp_port,
      hourly_limit: s.hourly_limit,
      provider: s.provider || 'ethereal',
      created_at: s.created_at,
    }));

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

    res.status(201).json({
      id: sender.id,
      user_id: sender.user_id,
      email: sender.email,
      display_name: sender.display_name,
      smtp_host: sender.smtp_host,
      smtp_port: sender.smtp_port,
      hourly_limit: sender.hourly_limit,
      provider: sender.provider,
    });
  } catch (err) {
    console.error('[Senders] Error creating sender:', err);
    res.status(500).json({ error: err.message });
  }
}

// Connect a real Gmail (App Password) or custom SMTP sender with live verification
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
      hourlyLimit,
      provider = 'gmail',
      skipVerify = false,
    } = req.body;

    const effectivePass = appPassword || smtpPass;
    if (!email || !effectivePass) {
      return res.status(400).json({
        error: 'Email address and Gmail App Password (or SMTP password) are required.',
      });
    }

    const sender = await createCustomSmtpSender({
      userId: req.user.id,
      email,
      displayName,
      smtpHost: smtpHost || 'smtp.gmail.com',
      smtpPort: smtpPort || 465,
      smtpUser: smtpUser || email,
      smtpPass: effectivePass,
      hourlyLimit: Number(hourlyLimit) || 200,
      provider,
      skipVerify: Boolean(skipVerify),
    });

    res.status(201).json({
      id: sender.id,
      user_id: sender.user_id,
      email: sender.email,
      display_name: sender.display_name,
      smtp_host: sender.smtp_host,
      smtp_port: sender.smtp_port,
      hourly_limit: sender.hourly_limit,
      provider: sender.provider,
      message: `Verified and connected ${sender.email} (${sender.smtp_host})`,
    });
  } catch (err) {
    console.error('[Senders] SMTP verification/creation failed:', err.message);
    res.status(400).json({
      error: `SMTP authentication failed: ${err.message}. For Gmail, ensure 2-Step Verification is enabled and use a 16-character Google App Password.`,
    });
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
  deleteSender,
};
