// ============================================================
// MUFASER-X – Connection Manager (v2)
// Fixes: correct event-listener order, QR support, state machine,
// duplicate-connection guard, proper pairing code timing.
// ============================================================
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
} = require('@whiskeysockets/baileys');
const pino   = require('pino');
const QRCode = require('qrcode');
const fs     = require('fs');
const path   = require('path');

const config  = require('./config');
const session = require('./lib/sessionHelper');

// ── Load commands dynamically ────────────────────────────────
const commands    = new Map();
const commandsDir = path.join(__dirname, 'commands');
if (fs.existsSync(commandsDir)) {
  fs.readdirSync(commandsDir)
    .filter(f => f.endsWith('.js'))
    .forEach(file => {
      const cmd = require(path.join(commandsDir, file));
      commands.set(cmd.name, cmd);
    });
  console.log(`[Bot] Loaded ${commands.size} command(s): ${[...commands.keys()].join(', ')}`);
}

// ── Shared bot state (read by Express routes) ───────────────
// Status values:
//   idle | session_not_found | generating_code | pairing_code_ready
//   waiting_approval | qr_ready | connected | disconnected | failed
const botState = {
  status:      'idle',
  pairingCode: null,      // '1234-5678' formatted
  qrDataUrl:   null,      // 'data:image/png;base64,...'
  sock:        null,
  isConnecting: false,
};

// ── Internal logger (silent – Baileys is noisy) ──────────────
const logger = pino({ level: 'silent' });

// ── Prevent duplicate connections ────────────────────────────
let connectLock = false;

// ─────────────────────────────────────────────────────────────
// Main connect function
// phoneNumber: digits-only string for pairing code, or null for QR/session
// ─────────────────────────────────────────────────────────────
async function connect(phoneNumber = null) {
  if (connectLock) {
    console.log('[Bot] Connection already in progress – skipping duplicate call.');
    return;
  }
  connectLock = true;

  try {
    // Ensure session directory exists
    if (!fs.existsSync(config.sessionDir)) {
      fs.mkdirSync(config.sessionDir, { recursive: true });
    }

    const { state: authState, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    console.log(`[Bot] Baileys version: ${version.join('.')}`);
    console.log(`[Bot] Registered: ${authState.creds.registered}`);
    console.log(`[Bot] Phone number requested: ${phoneNumber || 'none (QR mode)'}`);

    const sock = makeWASocket({
      version,
      auth: {
        creds: authState.creds,
        keys:  makeCacheableSignalKeyStore(authState.keys, logger),
      },
      printQRInTerminal: false,   // we handle QR ourselves
      logger,
      browser:                  ['MUFASER-X', 'Chrome', '120.0.0'],
      markOnlineOnConnect:      true,
      generateHighQualityLinkPreview: false,
      syncFullHistory:          false,
      connectTimeoutMs:         60_000,
      keepAliveIntervalMs:      30_000,
    });

    botState.sock   = sock;
    botState.status = phoneNumber ? 'generating_code' : 'qr_ready';

    // ── STEP 1: Register creds.update FIRST ─────────────────
    // This MUST happen before anything else so credentials are
    // saved as soon as WhatsApp sends them during the pairing handshake.
    sock.ev.on('creds.update', async () => {
      await saveCreds();
      console.log('[Bot] 💾 Credentials saved.');
    });

    // ── STEP 2: Register connection.update handler ───────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr, isOnline } = update;

      console.log(`[Bot] connection.update →`, JSON.stringify({
        connection,
        isOnline,
        hasQR: !!qr,
        statusCode: lastDisconnect?.error?.output?.statusCode,
      }));

      // QR code received (fallback / first attempt without phone number)
      if (qr) {
        try {
          botState.qrDataUrl   = await QRCode.toDataURL(qr, { width: 300 });
          botState.status      = 'qr_ready';
          botState.pairingCode = null;
          console.log('[Bot] 📷 QR code ready – open the pairing page to scan.');
        } catch (err) {
          console.error('[Bot] Failed to generate QR image:', err.message);
        }
      }

      if (connection === 'connecting') {
        console.log('[Bot] 🔄 Connecting to WhatsApp…');
        if (botState.status !== 'pairing_code_ready' && botState.status !== 'qr_ready') {
          botState.status = phoneNumber ? 'generating_code' : 'qr_ready';
        }
      }

      if (connection === 'open') {
        botState.status      = 'connected';
        botState.pairingCode = null;
        botState.qrDataUrl   = null;
        console.log('[Bot] ✅ Connected to WhatsApp!');
        connectLock = false;
        await handlePostConnect(sock);
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const loggedOut  = statusCode === DisconnectReason.loggedOut;

        console.log(`[Bot] ❌ Connection closed. StatusCode: ${statusCode}`);
        botState.status = loggedOut ? 'session_not_found' : 'disconnected';
        botState.sock   = null;
        connectLock     = false;

        if (loggedOut) {
          console.log('[Bot] Logged out – clearing session. Please re-pair.');
          session.clearSession();
          return; // Do NOT reconnect after logout
        }

        if (config.autoReconnect && statusCode !== DisconnectReason.badSession) {
          console.log('[Bot] Reconnecting in 5 seconds…');
          setTimeout(() => connect(), 5000);
        } else if (statusCode === DisconnectReason.badSession) {
          console.log('[Bot] Bad session detected – clearing and requesting new login.');
          session.clearSession();
          botState.status = 'session_not_found';
        }
      }
    });

    // ── STEP 3: Register message handler ────────────────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          await handleMessage(sock, msg);
        } catch (err) {
          console.error('[Bot] Error in message handler:', err.message);
        }
      }
    });

    // ── STEP 4: Request pairing code (if phone provided) ────
    // Must be done AFTER registering all listeners.
    // Baileys internally waits for the right socket state before
    // actually sending the pairing request to WhatsApp.
    if (phoneNumber && !authState.creds.registered) {
      botState.status = 'generating_code';

      // Small delay allows the socket to initiate its WS connection.
      // requestPairingCode() itself will wait until the socket is ready.
      await new Promise(r => setTimeout(r, 1500));

      try {
        const code          = await sock.requestPairingCode(phoneNumber);
        // Format as XXXX-XXXX for readability
        const formatted     = code.match(/.{1,4}/g)?.join('-') ?? code;
        botState.pairingCode = formatted;
        botState.qrDataUrl   = null;
        botState.status      = 'pairing_code_ready';

        console.log(`\n[Bot] ══════════════════════════════`);
        console.log(`[Bot] 🔑 PAIRING CODE: ${formatted}`);
        console.log(`[Bot] ══════════════════════════════\n`);
        console.log(`[Bot] Status set to 'pairing_code_ready'. Waiting for WhatsApp approval…`);

        // After displaying the code, update status to reflect we're waiting
        // for the user to enter it in WhatsApp
        botState.status = 'waiting_approval';

        // Keep pairingCode in state so the UI can still display it
      } catch (err) {
        console.error('[Bot] ❌ Failed to request pairing code:', err.message);
        botState.status = 'failed';
        connectLock     = false;
        // Clean up the failed socket
        try { sock.end(); } catch (_) {}
        botState.sock = null;
      }
    }

  } catch (err) {
    console.error('[Bot] ❌ Fatal connection error:', err.message);
    botState.status   = 'failed';
    botState.sock     = null;
    connectLock       = false;
  }
}

// ── Post-connect: send Session ID to owner once ──────────────
async function handlePostConnect(sock) {
  if (session.isSessionAlreadySent()) {
    console.log('[Bot] Session ID already sent previously – skipping.');
    return;
  }

  const sessionId = session.encodeSessionToBase64();
  if (!sessionId) {
    console.error('[Bot] Could not encode session to Base64.');
    return;
  }

  // Always print to console
  console.log(`\n[Bot] ══════════════════════════════`);
  console.log(`[Bot] 🔑 SESSION ID (save this!):`);
  console.log(sessionId);
  console.log(`[Bot] ══════════════════════════════\n`);

  if (!config.ownerNumber) {
    console.warn('[Bot] OWNER_NUMBER not set – skipping WhatsApp send.');
    session.markSessionAsSent();
    return;
  }

  const ownerJid = `${config.ownerNumber}@s.whatsapp.net`;

  try {
    await new Promise(r => setTimeout(r, 3000)); // Let connection stabilise

    const sentMsg = await sock.sendMessage(ownerJid, {
      text: `*MUFASER-X – Your Session ID*\n\nCopy this and set it as your SESSION_ID environment variable:\n\n${sessionId}`,
    });
    console.log('[Bot] ✅ Session ID sent to owner via WhatsApp.');
    session.markSessionAsSent();

    // Attempt to auto-delete after 10 s (fail silently)
    setTimeout(async () => {
      try {
        await sock.sendMessage(ownerJid, { delete: sentMsg.key });
        console.log('[Bot] Session ID message auto-deleted.');
      } catch (_) { /* deletion not supported – ignore */ }
    }, 10_000);

  } catch (err) {
    console.error('[Bot] ❌ Failed to send Session ID:', err.message);
  }
}

// ── Message handler ───────────────────────────────────────────
async function handleMessage(sock, msg) {
  if (!msg.message) return;
  if (!msg.key.remoteJid) return;
  if (isJidBroadcast(msg.key.remoteJid)) return;
  if (msg.key.remoteJid === 'status@broadcast') return;

  const jid    = msg.key.remoteJid;
  const body   =
    msg.message?.conversation                        ||
    msg.message?.extendedTextMessage?.text           ||
    msg.message?.imageMessage?.caption               ||
    msg.message?.videoMessage?.caption               ||
    '';

  if (!body.startsWith(config.prefix)) return;

  const [rawCmd, ...args] = body.slice(config.prefix.length).trim().split(/\s+/);
  const cmdName           = rawCmd.toLowerCase();
  const command           = commands.get(cmdName);
  if (!command) return;

  const senderJid  = msg.key.participant || msg.key.remoteJid;
  const senderName = msg.pushName || senderJid.split('@')[0];
  const sender     = { name: senderName, number: senderJid.split('@')[0] };

  console.log(`[Command] ${config.prefix}${cmdName} from ${sender.number}`);
  await command.execute(sock, msg, jid, args, sender);
}

module.exports = { connect, botState };
