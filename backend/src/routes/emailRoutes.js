const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Schedule batch of emails
router.post('/schedule', emailController.schedule);

// Get scheduled/delayed emails
router.get('/scheduled', emailController.getScheduled);

// Get sent/failed emails
router.get('/sent', emailController.getSent);

// Full-text search with Elasticsearch (fallback to DB)
router.get('/search', emailController.search);

// Retry failed email job
router.post('/:id/retry', emailController.retryJob);

// Metrics & Stats
router.get('/stats', emailController.getStats);

module.exports = router;
