const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const Sender = require('../models/Sender');
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
      async (accessToken, refreshToken, params, profile, done) => {
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

          if (user.email !== email || user.name !== name || user.avatar_url !== avatarUrl) {
            await user.update({ email, name, avatar_url: avatarUrl });
          }

          // If gmail.send scope was granted, provision/update Gmail OAuth HTTPS Sender
          const grantedScope = params && params.scope ? String(params.scope) : '';
          if (grantedScope.includes('gmail.send') && email) {
            const existing = await Sender.findOne({
              where: { user_id: user.id, email, provider: 'gmail_oauth' },
            });

            const tokenPayload = refreshToken
              ? `refresh:${refreshToken}`
              : existing && existing.smtp_pass && existing.smtp_pass.startsWith('refresh:')
              ? existing.smtp_pass
              : `access:${accessToken}`;

            if (existing) {
              await existing.update({
                display_name: `${name} (Gmail OAuth)`,
                smtp_pass: tokenPayload,
              });
            } else {
              await Sender.create({
                user_id: user.id,
                email,
                display_name: `${name} (Gmail OAuth)`,
                smtp_host: 'gmail.googleapis.com',
                smtp_port: 443,
                smtp_user: email,
                smtp_pass: tokenPayload,
                hourly_limit: Number(process.env.MAX_EMAILS_PER_HOUR_PER_SENDER) || 200,
                provider: 'gmail_oauth',
              });
            }
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
