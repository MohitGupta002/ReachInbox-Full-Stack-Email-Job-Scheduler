const express = require('express');
const router = express.Router();
const senderController = require('../controllers/senderController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Get list of user's senders with live hourly quota usage
router.get('/', senderController.getSenders);

// Create a new Ethereal test sender account
router.post('/ethereal', senderController.createSender);

// Connect a real Gmail SMTP, custom SMTP, or Resend HTTPS sender
router.post('/smtp', senderController.createSmtpSender);

// Reset current-hour rate limit counter (testing helper)
router.post('/:id/reset-limit', senderController.resetRateLimit);

// Delete a sender
router.delete('/:id', senderController.deleteSender);

module.exports = router;
