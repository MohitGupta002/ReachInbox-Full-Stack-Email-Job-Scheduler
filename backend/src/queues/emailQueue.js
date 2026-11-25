const { Queue } = require('bullmq');
const connection = require('../config/redis');

let emailQueue = null;

if (connection.isRedisAvailable && connection.isRedisAvailable()) {
  emailQueue = new Queue('email-queue', {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: false,
      removeOnFail: false,
    },
  });
}

module.exports = { emailQueue };
