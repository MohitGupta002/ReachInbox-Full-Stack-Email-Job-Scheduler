const redis = require('../config/redis');
const { sequelize, withSqliteWriteLock } = require('../config/db');
const KVStore = require('../models/KVStore');

/**
 * Atomically increments a numeric counter key with TTL.
 * Uses real Redis INCR/EXPIRE when available, otherwise serialized atomic DB updates.
 */
async function incrWithTtl(key, ttlSeconds) {
  if (redis.isRedisAvailable && redis.isRedisAvailable()) {
    const val = await redis.incr(key);
    if (val === 1) {
      await redis.expire(key, ttlSeconds);
    }
    return val;
  }

  return withSqliteWriteLock(() =>
    sequelize.transaction(async (transaction) => {
      const now = new Date();
      const existing = await KVStore.findByPk(key, { transaction });

      if (!existing || (existing.expires_at && existing.expires_at <= now)) {
        const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
        await KVStore.upsert(
          { key, int_value: 1, expires_at: expiresAt },
          { transaction }
        );
        return 1;
      }

      const nextValue = existing.int_value + 1;
      await existing.update({ int_value: nextValue }, { transaction });
      return nextValue;
    })
  );
}

/**
 * Atomically decrements a counter key to keep rate tracking precise on overflow.
 */
async function decrKey(key) {
  if (redis.isRedisAvailable && redis.isRedisAvailable()) {
    return redis.decr(key);
  }

  return withSqliteWriteLock(() =>
    sequelize.transaction(async (transaction) => {
      const existing = await KVStore.findByPk(key, { transaction });
      if (!existing) return 0;
      const nextValue = Math.max(0, existing.int_value - 1);
      await existing.update({ int_value: nextValue }, { transaction });
      return nextValue;
    })
  );
}

/**
 * Acquires a distributed lock if unset or expired (`SET key 1 NX EX ttlSeconds`).
 * Returns true if lock was acquired, false if already held.
 */
async function setNxEx(key, ttlSeconds) {
  if (redis.isRedisAvailable && redis.isRedisAvailable()) {
    const result = await redis.set(key, '1', 'NX', 'EX', ttlSeconds);
    return result === 'OK';
  }

  return withSqliteWriteLock(() =>
    sequelize.transaction(async (transaction) => {
      const now = new Date();
      const existing = await KVStore.findByPk(key, { transaction });

      if (existing && (!existing.expires_at || existing.expires_at > now)) {
        return false;
      }

      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
      await KVStore.upsert(
        { key, int_value: 1, expires_at: expiresAt },
        { transaction }
      );
      return true;
    })
  );
}

async function getIntValue(key) {
  if (redis.isRedisAvailable && redis.isRedisAvailable()) {
    const val = await redis.get(key);
    return val ? Number(val) || 0 : 0;
  }

  const existing = await KVStore.findByPk(key);
  if (!existing) return 0;
  if (existing.expires_at && existing.expires_at <= new Date()) return 0;
  return Number(existing.int_value) || 0;
}

async function deleteKey(key) {
  if (redis.isRedisAvailable && redis.isRedisAvailable()) {
    return redis.del(key);
  }

  return withSqliteWriteLock(() => KVStore.destroy({ where: { key } }));
}

module.exports = {
  incrWithTtl,
  decrKey,
  setNxEx,
  getIntValue,
  deleteKey,
};
