// ============================================================
// MUFASER-X Configuration
// Reads all settings from environment variables via .env
// ============================================================
require('dotenv').config();

const config = {
  // Bot identity
  botName:   'MUFASER-X',
  developer: 'ROMA-TECH',
  version:   '1.0.0',
  prefix:    '.',

  // Server
  port: process.env.PORT || 3000,

  // Owner WhatsApp number (international format, digits only: 2567xxxxxxxx)
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),

  // Session ID (Base64-encoded creds.json) – used for hosted deployments
  sessionId: process.env.SESSION_ID || '',

  // Session file paths
  sessionDir:      './session',
  credsPath:       './session/creds.json',
  sessionSentFlag: './session/.session_sent',

  // Auto-reconnect on network drop (but NOT on logout)
  autoReconnect: true,
};

module.exports = config;
