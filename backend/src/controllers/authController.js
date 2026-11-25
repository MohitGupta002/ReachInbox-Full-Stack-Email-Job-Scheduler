const jwt = require('jsonwebtoken');
const User = require('../models/User');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_reachinbox_key_2026';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

function getCookieOptions(withMaxAge = true) {
  const isProdHttps =
    process.env.NODE_ENV === 'production' && FRONTEND_URL.startsWith('https://');

  return {
    httpOnly: true,
    secure: isProdHttps,
    sameSite: isProdHttps ? 'none' : 'lax',
    ...(withMaxAge ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}),
  };
}

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

function setCookie(res, token) {
  res.cookie('token', token, getCookieOptions(true));
}

// Google OAuth callback
async function googleCallback(req, res) {
  try {
    if (!req.user) {
      return res.redirect(`${FRONTEND_URL}/?error=auth_failed`);
    }

    const token = signToken(req.user.id);
    setCookie(res, token);
    res.redirect(`${FRONTEND_URL}/`);
  } catch (err) {
    console.error('[Auth] Callback error:', err);
    res.redirect(`${FRONTEND_URL}/?error=server_error`);
  }
}

// Get authenticated user
async function getMe(req, res) {
  try {
    const user = req.user;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// Logout
async function logout(req, res) {
  res.clearCookie('token', getCookieOptions(false));
  res.json({ message: 'Logged out successfully' });
}

// Dev/Demo login helper (instant test account login)
async function devLogin(req, res) {
  try {
    const email = req.body.email || 'demo.user@reachinbox.ai';
    const name = req.body.name || 'Demo Engineer';
    const avatarUrl = 'https://api.dicebear.com/7.x/avataaars/svg?seed=ReachInbox';

    let [user] = await User.findOrCreate({
      where: { email },
      defaults: {
        google_id: 'demo-google-id-' + Date.now(),
        name,
        email,
        avatar_url: avatarUrl,
      },
    });

    const token = signToken(user.id);
    setCookie(res, token);

    res.json({
      message: 'Logged in successfully via Dev Mode',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar_url: user.avatar_url,
      },
      token,
    });
  } catch (err) {
    console.error('[Auth] Dev login error:', err);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  googleCallback,
  getMe,
  logout,
  devLogin,
};
