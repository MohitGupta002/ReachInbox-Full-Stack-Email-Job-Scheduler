const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
require('dotenv').config();

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const renderExternalUrl = process.env.RENDER_EXTERNAL_URL ? process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '') : '';
const callbackURL =
  process.env.GOOGLE_CALLBACK_URL ||
  (renderExternalUrl ? `${renderExternalUrl}/api/auth/google/callback` : 'http://localhost:5000/api/auth/google/callback');

const googleOAuthConfigured = Boolean(
  googleClientId &&
    googleClientSecret &&
    googleClientId !== 'your_google_client_id' &&
    googleClientSecret !== 'your_google_client_secret'
);

if (googleOAuthConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientId,
        clientSecret: googleClientSecret,
        callbackURL,
        scope: ['profile', 'email'],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
          const avatarUrl = profile.photos && profile.photos[0] ? profile.photos[0].value : null;
          const name = profile.displayName || email;

          let [user] = await User.findOrCreate({
            where: { google_id: profile.id },
            defaults: {
              google_id: profile.id,
              name,
              email,
              avatar_url: avatarUrl,
            },
          });

          // Ensure profile updates are kept fresh
          if (user.email !== email || user.name !== name || user.avatar_url !== avatarUrl) {
            await user.update({ email, name, avatar_url: avatarUrl });
          }

          return done(null, user);
        } catch (err) {
          return done(err, null);
        }
      }
    )
  );
} else {
  console.log('[Passport] Google OAuth credentials not configured. Use 1-Click/Custom login or add credentials in .env.');
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findByPk(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = passport;
module.exports.isGoogleOAuthConfigured = () => googleOAuthConfigured;
