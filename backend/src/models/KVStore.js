const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

/**
 * Relational KV fallback store used for atomic rate-limit counters and Slack
 * deduplication locks only when Redis is unavailable (standalone mode).
 */
const KVStore = sequelize.define(
  'KVStore',
  {
    key: {
      type: DataTypes.STRING,
      primaryKey: true,
    },
    int_value: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    expires_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'kv_store',
    timestamps: false,
  }
);

module.exports = KVStore;
