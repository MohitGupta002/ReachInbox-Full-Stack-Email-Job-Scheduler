const { sequelize, testAndInitDb } = require('../config/db');
const User = require('./User');
const Sender = require('./Sender');
const SlackIntegration = require('./SlackIntegration');
const EmailJob = require('./EmailJob');
const KVStore = require('./KVStore');

// Define relationships
User.hasMany(Sender, { foreignKey: 'user_id', as: 'senders', onDelete: 'CASCADE' });
Sender.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasOne(SlackIntegration, { foreignKey: 'user_id', as: 'slackIntegration', onDelete: 'CASCADE' });
SlackIntegration.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(EmailJob, { foreignKey: 'user_id', as: 'emailJobs', onDelete: 'CASCADE' });
EmailJob.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Sender.hasMany(EmailJob, { foreignKey: 'sender_id', as: 'emailJobs', onDelete: 'CASCADE' });
EmailJob.belongsTo(Sender, { foreignKey: 'sender_id', as: 'sender' });

/**
 * Safely adds new columns to existing SQLite tables without triggering Sequelize's
 * destructive DROP TABLE alter strategy on foreign-key-constrained tables.
 */
async function ensureSqliteColumns() {
  const columnChecks = [
    { table: 'senders', column: 'provider', sqlType: "VARCHAR(255) NOT NULL DEFAULT 'ethereal'" },
    { table: 'email_jobs', column: 'message_id', sqlType: 'VARCHAR(255)' },
    { table: 'email_jobs', column: 'hourly_limit', sqlType: 'INTEGER' },
  ];

  for (const { table, column, sqlType } of columnChecks) {
    const [cols] = await sequelize.query(`PRAGMA table_info(${table});`);
    const exists = Array.isArray(cols) && cols.some((col) => col.name === column);
    if (!exists) {
      await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${sqlType};`);
      console.log(`[DB] Migrated SQLite column ${table}.${column}.`);
    }
  }
}

async function syncDatabase() {
  await testAndInitDb();

  if (sequelize.getDialect() === 'sqlite') {
    await sequelize.sync();
    await ensureSqliteColumns();
  } else {
    await sequelize.sync({ alter: true });
  }

  console.log('[DB] Database models synchronized successfully.');
}

module.exports = {
  sequelize,
  syncDatabase,
  User,
  Sender,
  SlackIntegration,
  EmailJob,
  KVStore,
};
