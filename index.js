// ============================================================
// MUFASER-X – Express Server & Startup
// WhatsApp Multi-Device Bot by ROMA-TECH
// ============================================================
require('dotenv').config();

const express = require('express');
const path    = require('path');
const fs      = require('fs');

const config  = require('./config');
const session = require('./lib/sessionHelper');
const { connect, botState } = require('./connection');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Keep-alive / health check ────────────────────────────────
app.get('/health', (req, res) => res.send('MUFASER-X Bot Running Successfully'));

// ── Serve pairing page at root AND /pair ─────────────────────
app.get('/',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/pair',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── GET /api/status ──────────────────────────────────────────
// Returns current bot state for the UI to poll.
app.get('/api/status', (req, res) => {
  res.json({
    status:      botState.status,
    pairingCode: botState.pairingCode || null,
    qrDataUrl:   botState.qrDataUrl   || null,
    connected:   botState.status === 'connected',
  });
});

// ── POST /api/pair ───────────────────────────────────────────
// User submits phone number → we generate a pairing code.
app.post('/api/pair', async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: 'Phone number is required.' });
  }

  const clean = phone.replace(/\D/g, '');
  if (clean.length < 7) {
    return res.status(400).json({ error: 'Enter a valid international phone number (digits only, e.g. 256712345678).' });
  }

  if (botState.status === 'connected') {
    return res.status(400).json({ error: 'Bot is already connected.' });
  }

  // If a socket is already connecting/pairing, reject duplicate
  if (['generating_code', 'pairing_code_ready', 'waiting_approval', 'qr_ready'].includes(botState.status)) {
    // Return existing code if we already have one
    if (botState.pairingCode) {
      return res.json({ pairingCode: botState.pairingCode });
    }
    return res.status(409).json({ error: 'Pairing already in progress. Please wait.' });
  }

  // Reset state before starting
  botState.pairingCode = null;
  botState.qrDataUrl   = null;
  botState.status      = 'generating_code';

  // Start connection in background – do NOT await (it blocks until connected)
  connect(clean).catch(err => {
    console.error('[API/pair] Connection error:', err.message);
    botState.status = 'failed';
  });

  // Poll until we have a pairing code or failure (max 30 s)
  const code = await waitFor(() => botState.pairingCode, 30_000, 300);
  if (!code) {
    return res.status(408).json({
      error: 'Timed out generating pairing code. Check the console for errors and try again.',
    });
  }

  return res.json({ pairingCode: code });
});

// ── POST /api/start-qr ───────────────────────────────────────
// Start connection in QR mode (no phone number required).
app.post('/api/start-qr', async (req, res) => {
  if (botState.status === 'connected') {
    return res.status(400).json({ error: 'Bot is already connected.' });
  }
  if (['generating_code', 'qr_ready', 'waiting_approval'].includes(botState.status)) {
    return res.json({ message: 'QR generation already in progress.', qrDataUrl: botState.qrDataUrl });
  }

  botState.pairingCode = null;
  botState.qrDataUrl   = null;
  botState.status      = 'generating_code';

  connect(null).catch(err => {
    console.error('[API/start-qr] Connection error:', err.message);
    botState.status = 'failed';
  });

  // Wait up to 15 s for a QR code
  const qr = await waitFor(() => botState.qrDataUrl, 15_000, 300);
  if (!qr) {
    return res.status(408).json({ error: 'Timed out waiting for QR code. Try again.' });
  }

  return res.json({ qrDataUrl: qr });
});

// ── GET /api/qr ──────────────────────────────────────────────
// Returns the latest QR code data URL (for polling refreshes).
app.get('/api/qr', (req, res) => {
  if (!botState.qrDataUrl) {
    return res.status(404).json({ error: 'No QR code available.' });
  }
  res.json({ qrDataUrl: botState.qrDataUrl });
});

// ── Utility: poll a condition with timeout ───────────────────
function waitFor(condition, timeoutMs = 30_000, intervalMs = 300) {
  return new Promise(resolve => {
    const start = Date.now();
    const iv = setInterval(() => {
      const val = condition();
      if (val) { clearInterval(iv); return resolve(val); }
      if (Date.now() - start >= timeoutMs) { clearInterval(iv); resolve(null); }
    }, intervalMs);
  });
}

// ── Startup ───────────────────────────────────────────────────
async function start() {
  console.log(`
╔══════════════════════════════════╗
║    MUFASER-X BOT v${config.version}           ║
║    Developer: ROMA-TECH          ║
╚══════════════════════════════════╝`);

  // Ensure session directory exists
  if (!fs.existsSync(config.sessionDir)) {
    fs.mkdirSync(config.sessionDir, { recursive: true });
  }

  // ── Case 1: SESSION_ID in env → restore + auto-connect ────
  if (config.sessionId) {
    const restored = session.restoreSessionFromEnv();
    if (restored) {
      console.log('[Bot] SESSION_ID found – auto-connecting…');
      botState.status = 'generating_code';
      connect().catch(err => {
        console.error('[Bot] Auto-connect error:', err.message);
        botState.status = 'session_not_found';
      });
    } else {
      console.log('[Bot] SESSION_ID set but failed to decode – requesting new login.');
      botState.status = 'session_not_found';
    }

  // ── Case 2: Valid session folder on disk → auto-connect ───
  } else if (session.hasValidSession()) {
    console.log('[Bot] Existing session found – auto-connecting…');
    botState.status = 'generating_code';
    connect().catch(err => {
      console.error('[Bot] Auto-connect error:', err.message);
      botState.status = 'session_not_found';
    });

  // ── Case 3: No session at all → wait for user input ───────
  } else {
    console.log('[Bot] No session found. Open the web panel to pair your device.');
    botState.status = 'session_not_found';
  }

  // Start Express
  app.listen(config.port, () => {
    console.log(`[Server] 🌐  Running on port ${config.port}`);
    console.log(`[Server] 📲  Pairing panel: http://localhost:${config.port}/`);
  });
}

// ── Global safety nets ───────────────────────────────────────
process.on('uncaughtException',  err    => console.error('[Bot] Uncaught exception:', err.message));
process.on('unhandledRejection', reason => console.error('[Bot] Unhandled rejection:', reason));

start();
