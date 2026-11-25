const { Op } = require('sequelize');
const { emailQueue } = require('../queues/emailQueue');
const EmailJob = require('../models/EmailJob');
const Sender = require('../models/Sender');

async function reconcilePendingJobs() {
  try {
    console.log('[Recovery] Scanning database for uncompleted email jobs...');
    const pendingJobs = await EmailJob.findAll({
      where: {
        status: {
          [Op.in]: ['SCHEDULED', 'DELAYED_RATE_LIMIT'],
        },
      },
      include: [{ model: Sender, as: 'sender', attributes: ['hourly_limit'] }],
    });

    console.log(`[Recovery] Found ${pendingJobs.length} pending jobs in database.`);

    if (!emailQueue) {
      console.log('[Recovery] Standalone persistent mode active — pending jobs preserved cleanly in database.');
      return { totalPending: pendingJobs.length, recoveredCount: pendingJobs.length, mode: 'standalone' };
    }

    let recoveredCount = 0;
    for (const jobRow of pendingJobs) {
      if (!jobRow.bull_job_id) continue;

      const existingJob = await emailQueue.getJob(jobRow.bull_job_id);
      if (!existingJob) {
        const remainingDelay = Math.max(0, new Date(jobRow.scheduled_at).getTime() - Date.now());
        const effectiveLimit =
          jobRow.hourly_limit || (jobRow.sender ? jobRow.sender.hourly_limit : null) || null;

        await emailQueue.add(
          'send-email',
          {
            emailJobId: jobRow.id,
            userId: jobRow.user_id,
            senderId: jobRow.sender_id,
            hourlyLimit: effectiveLimit,
          },
          {
            jobId: jobRow.bull_job_id,
            delay: remainingDelay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          }
        );
        recoveredCount++;
      }
    }

    console.log(`[Recovery] Re-enqueued ${recoveredCount} missing jobs into BullMQ.`);
    return { totalPending: pendingJobs.length, recoveredCount, mode: 'bullmq' };
  } catch (err) {
    console.warn(`[Recovery] Reconciliation notice: ${err.message}`);
    return { totalPending: 0, recoveredCount: 0, error: err.message };
  }
}

module.exports = {
  reconcilePendingJobs,
};
