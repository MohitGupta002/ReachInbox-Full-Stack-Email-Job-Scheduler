const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const Sender = sequelize.define('Sender', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  display_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  smtp_host: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  smtp_port: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 587,
  },
  smtp_user: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  smtp_pass: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  hourly_limit: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 200,
  },
  provider: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'ethereal',
  },
}, {
  tableName: 'senders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Sender;
