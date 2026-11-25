const { incrWithTtl, decrKey } = require('./kvStoreService');

function getHourKey(date = new Date()) {
  return date.toISOString().slice(0, 13).replace(/[-T:]/g, ''); // e.g. 2026112514
}

async function checkAndIncrementRate(senderId, limit = 200) {
  const hourKey = getHourKey();
  const rateKey = `ratelimit:${senderId}:${hourKey}`;

  const currentCount = await incrWithTtl(rateKey, 3700);
  const isExceeded = currentCount > limit;

  if (isExceeded) {
    await decrKey(rateKey);
  }

  return {
    isExceeded,
    currentCount: isExceeded ? limit : currentCount,
    hourKey,
  };
}

async function computeNextHourStagger(senderId, minDelay = 2000) {
  const nextHour = new Date();
  nextHour.setUTCMinutes(0, 0, 0);
  nextHour.setUTCHours(nextHour.getUTCHours() + 1);

  const overflowKey = `overflow:${senderId}:${getHourKey(nextHour)}`;
  const overflowIdx = await incrWithTtl(overflowKey, 7200);

  const nextRunMs = nextHour.getTime() + (overflowIdx - 1) * minDelay;
  return {
    nextRunMs,
    nextHourDate: new Date(nextRunMs),
  };
}

module.exports = {
  getHourKey,
  checkAndIncrementRate,
  computeNextHourStagger,
};
