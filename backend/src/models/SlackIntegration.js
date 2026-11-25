const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const SlackIntegration = sequelize.define('SlackIntegration', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
  },
  team_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  team_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  channel_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  channel_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  webhook_url: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  access_token: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'slack_integrations',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = SlackIntegration;
