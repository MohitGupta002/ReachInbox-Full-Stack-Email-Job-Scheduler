const IORedis = require('ioredis');
const { isTcpPortReachableSync } = require('./db');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL;
let redisHost = process.env.REDIS_HOST || '127.0.0.1';
let redisPort = Number(process.env.REDIS_PORT) || 6379;
let isTls = false;

if (redisUrl) {
  try {
    const parsed = new URL(redisUrl);
    redisHost = parsed.hostname || redisHost;
    redisPort = Number(parsed.port) || (parsed.protocol === 'rediss:' ? 6380 : 6379);
    isTls = parsed.protocol === 'rediss:';
  } catch (err) {
    console.warn(`[Redis] Could not parse REDIS_URL cleanly: ${err.message}`);
  }
}

const useMockEnv = process.env.USE_REDIS_MOCK === 'true';
const forceRedis = process.env.REDIS_FORCE === 'true' || Boolean(redisUrl);

const baseOptions = {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    if (times > 5) {
      return null;
    }
    return Math.min(times * 250, 2000);
  },
};

let redis;
let redisAvailable = false;

if (useMockEnv) {
  const RedisMock = require('ioredis-mock');
  redis = new RedisMock();
  redisAvailable = false; // BullMQ Lua cmsgpack is unsupported in ioredis-mock
  console.log('[Redis] Running in standalone offline mode (USE_REDIS_MOCK=true).');
} else if (forceRedis || isTcpPortReachableSync(redisHost, redisPort, 600)) {
  if (redisUrl) {
    redis = new IORedis(redisUrl, {
      ...baseOptions,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
    });
  } else {
    redis = new IORedis({
      host: redisHost,
      port: redisPort,
      ...baseOptions,
    });
  }

  redisAvailable = true;

  redis.on('connect', () => {
    redisAvailable = true;
    console.log(`[Redis] Connected to Redis at ${redisHost}:${redisPort}`);
  });

  redis.on('ready', () => {
    redisAvailable = true;
  });

  redis.on('close', () => {
    redisAvailable = false;
  });

  redis.on('error', (err) => {
    redisAvailable = false;
    console.warn(`[Redis] Notice: ${err.message}`);
  });
} else {
  const RedisMock = require('ioredis-mock');
  redis = new RedisMock();
  redisAvailable = false;
  console.warn(
    `[Redis] Redis unreachable at ${redisHost}:${redisPort} — standalone persistent fallback active (start Docker for full BullMQ mode).`
  );
}

function isRedisAvailable() {
  return Boolean(redisAvailable && !useMockEnv && redis && typeof redis.ping === 'function');
}

module.exports = redis;
module.exports.isRedisAvailable = isRedisAvailable;
