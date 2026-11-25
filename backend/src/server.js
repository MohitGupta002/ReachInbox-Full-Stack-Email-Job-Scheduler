const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

dotenv.config();

const { sequelize, syncDatabase } = require('./models');
const redis = require('./config/redis');
const { initElasticIndex } = require('./config/elastic');
const { getQueueInspectorRouter } = require('./queues/bullBoard');
const { reconcilePendingJobs } = require('./services/recoveryService');
const passport = require('./config/passport');

// Import routes
const authRoutes = require('./routes/authRoutes');
const senderRoutes = require('./routes/senderRoutes');
const emailRoutes = require('./routes/emailRoutes');
const slackRoutes = require('./routes/slackRoutes');

const app = express();
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const ALLOW_RENDER_ORIGINS = process.env.ALLOW_RENDER_ORIGINS === 'true';

// Required behind Render / reverse proxy TLS termination for secure cookies & callbacks
app.set('trust proxy', 1);

const allowedOrigins = new Set([
  FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      if (ALLOW_RENDER_ORIGINS && /^https:\/\/[a-z0-9-]+\.onrender\.com$/i.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS origin rejected: ${origin}`));
    },
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(passport.initialize());

// Mount Bull Board / Queue Inspector
app.use('/admin/queues', getQueueInspectorRouter());

// Mount REST API routes
app.use('/api/auth', authRoutes);
app.use('/api/senders', senderRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/slack', slackRoutes);

// Health check endpoint with truthful infrastructure telemetry
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    infrastructure: {
      databaseDialect: sequelize.getDialect(),
      redisMode: redis.isRedisAvailable && redis.isRedisAvailable() ? 'redis_bullmq' : 'standalone_fallback',
      googleOAuthConfigured: Boolean(passport.isGoogleOAuthConfigured && passport.isGoogleOAuthConfigured()),
      embeddedWorkerEnabled: process.env.ENABLE_EMBEDDED_WORKER === 'true',
    },
  });
});

// Serve frontend static build if present (single-container fallback)
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/admin')) {
      return next();
    }
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.json({
      name: 'ReachInbox Email Job Scheduler API',
      version: '1.0.0',
      bullBoard: '/admin/queues',
      health: '/api/health',
    });
  });
}

// Server boot sequence
async function startServer() {
  try {
    console.log('----------------------------------------------------');
    console.log('⚡ Starting ReachInbox Email Job Scheduler API...');
    console.log('----------------------------------------------------');

    await syncDatabase();
    await initElasticIndex();
    await reconcilePendingJobs();

    // Optionally start BullMQ / fallback worker in-process (e.g. Render Free Web Service)
    if (process.env.ENABLE_EMBEDDED_WORKER === 'true') {
      const { startWorker } = require('./worker');
      await startWorker();
      console.log('🔄 Embedded worker started alongside Express API.');
    }

    const server = app.listen(PORT, () => {
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`📊 Queue Inspector available at /admin/queues`);
      console.log(`🖥️ Frontend allowed origin: ${FRONTEND_URL}`);
      console.log('----------------------------------------------------');
    });

    return server;
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = app;
module.exports.startServer = startServer;
