const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const EmailJob = sequelize.define('EmailJob', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  sender_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  recipient_email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  subject: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  scheduled_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING, // Use STRING for universal SQLite & PG compatibility
    allowNull: false,
    defaultValue: 'SCHEDULED', // SCHEDULED, DELAYED_RATE_LIMIT, SENT, FAILED
    validate: {
      isIn: [['SCHEDULED', 'DELAYED_RATE_LIMIT', 'SENT', 'FAILED']],
    },
  },
  bull_job_id: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  idempotency_key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  ethereal_preview_url: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  message_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  hourly_limit: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  retry_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  attachments_json: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'email_jobs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = EmailJob;
