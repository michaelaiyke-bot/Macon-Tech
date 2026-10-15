// lib/helpers.js — small utilities shared by several command files.

function formatUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${m}m ${s}s`;
}

function formatUptimeVerbose(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${d}days : ${h}hrs : ${m}mins : ${s}secs`;
}

function extractNumber(ctx) {
  const mentioned = ctx.msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
  if (mentioned) return mentioned.split('@')[0];
  if (ctx.args[0]) return ctx.args[0].replace(/\D/g, '');
  return null;
}

function progressBar(percent, length = 10) {
  const filled = Math.round((percent / 100) * length);
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

module.exports = { formatUptime, formatUptimeVerbose, extractNumber, progressBar };
