const express = require('express');
const router = express.Router();
const slackController = require('../controllers/slackController');
const authMiddleware = require('../middleware/authMiddleware');

// Slack OAuth v2 connect flow
router.get('/connect', authMiddleware, slackController.connect);

// Slack OAuth v2 callback (public endpoint for Slack redirect)
router.get('/callback', slackController.callback);

// Slack integration status
router.get('/status', authMiddleware, slackController.getStatus);

// Disconnect Slack
router.delete('/disconnect', authMiddleware, slackController.disconnect);

// Connect manual webhook
router.post('/manual', authMiddleware, slackController.connectManualWebhook);

module.exports = router;
