const express = require('express');
const router = express.Router();
const senderController = require('../controllers/senderController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Get list of user's senders (auto-creates default Ethereal sender if none)
router.get('/', senderController.getSenders);

// Create a new Ethereal test sender account
router.post('/ethereal', senderController.createSender);

// Connect a real Gmail or custom SMTP sender with live verification
router.post('/smtp', senderController.createSmtpSender);

// Delete a sender
router.delete('/:id', senderController.deleteSender);

module.exports = router;
