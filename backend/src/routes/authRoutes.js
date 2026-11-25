const express = require('express');
const router = express.Router();
const passport = require('../config/passport');
const authController = require('../controllers/authController');
const authMiddleware = require('../middleware/authMiddleware');
require('dotenv').config();

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

function requireGoogleConfig(req, res, next) {
  if (!passport.isGoogleOAuthConfigured || !passport.isGoogleOAuthConfigured()) {
    return res.redirect(`${FRONTEND_URL}/?error=google_not_configured`);
  }
  return next();
}

// Check OAuth capability status
router.get('/providers', (req, res) => {
  res.json({
    googleConfigured: Boolean(passport.isGoogleOAuthConfigured && passport.isGoogleOAuthConfigured()),
  });
});

// Google OAuth start
router.get(
  '/google',
  requireGoogleConfig,
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

// Google OAuth callback with clear error diagnostics
router.get('/google/callback', requireGoogleConfig, (req, res, next) => {
  passport.authenticate('google', { session: false }, (err, user, info) => {
    if (err || !user) {
      const reason = err ? err.message : (info && info.message) || 'authentication_failed';
      console.error('[Auth] Google OAuth callback error:', reason);
      return res.redirect(`${FRONTEND_URL}/?error=auth_failed&reason=${encodeURIComponent(reason)}`);
    }
    req.user = user;
    return authController.googleCallback(req, res);
  })(req, res, next);
});

// Current user profile
router.get('/me', authMiddleware, authController.getMe);

// Logout
router.post('/logout', authController.logout);

// Dev/Engineer login endpoint for local testing without OAuth keys
router.post('/dev-login', authController.devLogin);

module.exports = router;
