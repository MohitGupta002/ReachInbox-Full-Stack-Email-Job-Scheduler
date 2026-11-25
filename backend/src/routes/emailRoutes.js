const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Schedule batch of emails (supports optional file attachments)
router.post('/schedule', emailController.schedule);

// Get scheduled/delayed emails
router.get('/scheduled', emailController.getScheduled);

// Get sent/failed emails
router.get('/sent', emailController.getSent);

// Full-text search with Elasticsearch (fallback to DB)
router.get('/search', emailController.search);

// Retry failed emails
router.post('/retry-all-failed', emailController.retryAllFailed);
router.post('/:id/retry', emailController.retryJob);

// Delete individual job record
router.delete('/:id', emailController.deleteJob);

// Metrics & Stats
router.get('/stats', emailController.getStats);

module.exports = router;
