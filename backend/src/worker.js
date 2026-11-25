const { Worker, DelayedError } = require('bullmq');
const { Op } = require('sequelize');
const redis = require('./config/redis');
const { syncDatabase } = require('./models');
const EmailJob = require('./models/EmailJob');
const { processEmailJob } = require('./services/jobProcessorService');
require('dotenv').config();

let bullWorker = null;
let fallbackInterval = null;
let isPollingFallback = false;

/**
 * Processes due jobs when Redis is offline so standalone Windows environments
 * support full delayed dispatch, rate limiting, and restart survival.
 */
async function processDueFallbackJobs() {
  if (isPollingFallback) return;
  isPollingFallback = true;

  try {
    const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5;
    const dueJobs = await EmailJob.findAll({
      where: {
        status: {
          [Op.in]: ['SCHEDULED', 'DELAYED_RATE_LIMIT'],
        },
        scheduled_at: {
          [Op.lte]: new Date(),
        },
      },
      order: [['scheduled_at', 'ASC']],
      limit: concurrency,
    });

    if (dueJobs.length === 0) return;

    const results = await Promise.allSettled(
      dueJobs.map((jobRow) =>
        processEmailJob({
          emailJobId: jobRow.id,
          hourlyLimit: jobRow.hourly_limit,
        })
      )
    );

    results.forEach((res) => {
      if (res.status === 'rejected') {
        console.error('[Worker] Fallback job error:', res.reason?.message || res.reason);
      }
    });
  } catch (err) {
    console.warn(`[Worker] Fallback dispatch notice: ${err.message}`);
  } finally {
    isPollingFallback = false;
  }
}

async function startWorker() {
  await syncDatabase();

  if (redis.isRedisAvailable && redis.isRedisAvailable()) {
    console.log('[Worker] Initializing BullMQ Email Job Worker Pool...');
    const concurrency = Number(process.env.WORKER_CONCURRENCY) || 5;

    bullWorker = new Worker(
      'email-queue',
      async (job, token) => {
        const { emailJobId, hourlyLimit } = job.data;
        return processEmailJob({
          emailJobId,
          hourlyLimit,
          onRateLimited: async (nextRunMs) => {
            await job.moveToDelayed(nextRunMs, token);
            throw new DelayedError();
          },
        });
      },
      {
        connection: redis,
        concurrency,
      }
    );

    bullWorker.on('ready', () => {
      console.log(`[Worker] BullMQ Worker ready on 'email-queue' (concurrency=${concurrency})`);
    });

    bullWorker.on('completed', (job) => {
      console.log(`[Worker] Job ${job.id} completed successfully.`);
    });

    bullWorker.on('failed', (job, err) => {
      if (err.name === 'DelayedError') {
        console.log(`[Worker] Job ${job ? job.id : 'unknown'} delayed for next window.`);
      } else {
        console.error(`[Worker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
      }
    });

    bullWorker.on('error', (err) => {
      console.warn(`[Worker] Worker runtime notice: ${err.message}`);
    });
  } else {
    console.log('[Worker] Standalone Persistent Job Dispatcher active (interval=1000ms, zero-Redis mode).');
    await processDueFallbackJobs();
    fallbackInterval = setInterval(processDueFallbackJobs, 1000);
  }
}

async function stopWorker() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
  if (bullWorker) {
    await bullWorker.close();
    bullWorker = null;
  }
}

if (require.main === module) {
  startWorker().catch((err) => {
    console.error('[Worker] Fatal worker error:', err);
    process.exit(1);
  });

  process.on('SIGINT', async () => {
    console.log('[Worker] Shutting down worker gracefully...');
    await stopWorker();
    process.exit(0);
  });
}

module.exports = {
  startWorker,
  stopWorker,
  processDueFallbackJobs,
};
