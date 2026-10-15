const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');
const chalk = require('chalk');
const cron = require('node-cron');
const cfg = require('./config');
const db = require('./lib/db');
const { loadCommands } = require('./lib/loader');

const fs = require('fs');
const path = require('path');

const SESSION_DIR = './session';
const LINK_REGEX = /(https?:\/\/|www\.)[^\s]+/i;
const COOLDOWN_MS = 2000; // minimum gap between a user's commands, prevents spam/flood abuse
const lastUsed = new Map(); // key: "senderNumber:cmd" -> timestamp

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

// In-memory recent-message cache, used by antidelete to re-post what was removed.
const recentMessages = new Map(); // key: msg.key.id -> { text, from, sender }

// If a SESSION_ID is provided (e.g. pasted from the pairing website), decode it
// into the session folder so the bot connects immediately without asking for a
// pairing code again. The session ID is just the creds.json file, base64-encoded.
function restoreSessionFromEnv() {
  const sessionId = process.env.SESSION_ID;
  if (!sessionId) return;
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
  const credsPath = path.join(SESSION_DIR, 'creds.json');
  if (fs.existsSync(credsPath)) return; // already have a session, don't overwrite
  try {
    const json = Buffer.from(sessionId, 'base64').toString('utf-8');
    JSON.parse(json); // validate it's real JSON before writing
    fs.writeFileSync(credsPath, json);
    console.log(chalk.green('✔ Session restored from SESSION_ID'));
  } catch (e) {
    console.log(chalk.red('⚠ SESSION_ID was invalid, ignoring it. Will ask for pairing code instead.'));
  }
}

async function startBot() {
  restoreSessionFromEnv();
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: [cfg.botName, 'Chrome', '1.0.0']
  });

  if (!sock.authState.creds.registered) {
    const phoneNumber = await question(chalk.green('Enter your WhatsApp number (with country code, no +): '));
    const code = await sock.requestPairingCode(phoneNumber.replace(/\D/g, ''));
    console.log(chalk.yellow(`\nYour pairing code: ${chalk.bold(code)}`));
    console.log(chalk.cyan('Open WhatsApp > Linked Devices > Link with phone number, and enter this code.\n'));
  }

  const { commandMap, commandList } = loadCommands();

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
      console.log(chalk.green('✔ Connected to WhatsApp'));
      const myJid = sock.user.id;
      const db = require('./lib/db');
      const liveSettings = db.get();
      await sock.sendMessage(myJid, {
        text:
`┌「 🐺 *${cfg.botName}* 」
│
├─ Name: ${liveSettings.botName || cfg.botName}
├─ Prefix: ${liveSettings.prefix || cfg.prefix}
├─ Owner: ${liveSettings.owner || cfg.ownerNumber || 'Not set'}
├─ Platform: ${process.platform === 'linux' ? 'Linux' : process.platform === 'android' ? 'Android' : process.platform}
├─ Mode: ${liveSettings.mode || 'public'}
└─ Status: ✅ Connected

⚠️ *Keep your session files private.*
Never share your /session folder with anyone —
it gives full access to this WhatsApp account,
same as your password.

Type *${liveSettings.prefix || cfg.prefix}menu* to see all commands.

⭐ Follow on GitHub: ${cfg.repoUrl}`
      });

      // ── SCHEDULED GREETINGS ──────────────────────────────────────
      // Sends to your own DM by default. To also send to groups, add
      // their JIDs to GREETING_TARGETS below (e.g. '1234...@g.us').
      const GREETING_TARGETS = [myJid];

      cron.schedule('0 5 * * *', () => {
        for (const target of GREETING_TARGETS) {
          sock.sendMessage(target, {
            text:
`☀️ *GOOD MORNING* ⌐
│
├─ To: Owner 👑
├─ Note: New day, same grind 💪
├─ Antidelete: ✅ Running
├─ Commands: ✅ Ready
├─ Connection: ✅ Stable
└─ Status: ✅ Online 24/7

└─ ${cfg.botName} Online 🐾`
          });
        }
      }, { timezone: 'Africa/Lagos' });

      cron.schedule('0 21 * * *', () => {
        for (const target of GREETING_TARGETS) {
          sock.sendMessage(target, {
            text:
`🌙 *GOOD NIGHT* ⌐
│
├─ To: Owner 👑
├─ Note: Rest up, tomorrow's already loading 💪
├─ Antidelete: ✅ Running
├─ Commands: ✅ Ready
├─ Connection: ✅ Stable
└─ Status: ✅ Online 24/7

└─ ${cfg.botName} Online 🐾`
          });
        }
      }, { timezone: 'Africa/Lagos' });
    }

    if (connection === 'close') {
      const isRegistered = sock.authState.creds.registered;
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

      if (!isRegistered) {
        // Still mid-pairing (code not entered yet). Do NOT auto-restart here —
        // that was causing a rapid loop of brand-new pairing codes, which also
        // gets the number rate-limited by WhatsApp for looking like spam.
        console.log(chalk.red('Connection closed during pairing.'));
        console.log(chalk.yellow('If your code expired, wait at least a minute, then run "npm start" again for a fresh one — just once.'));
        return;
      }

      console.log(chalk.red('Connection closed.'), shouldReconnect ? 'Reconnecting...' : 'Logged out.');
      if (shouldReconnect) startBot();
    }
  });

  // ---- ANTIDELETE: catch message deletions and re-post them ----
  sock.ev.on('messages.update', async (updates) => {
    for (const u of updates) {
      const isDeleted = u.update?.messageStubType === 1 || u.update?.message === null;
      if (!isDeleted) continue;

      const cached = recentMessages.get(u.key.id);
      if (!cached) continue;

      const groupSettings = db.groupSettings(cached.from);
      if (!groupSettings.antidelete) continue;

      await sock.sendMessage(cached.from, {
        text: `🗑️ *Antidelete*\n@${cached.sender.split('@')[0]} deleted:\n\n${cached.text}`,
        mentions: [cached.sender]
      });
    }
  });

  // ---- MESSAGE HANDLER ----
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? msg.key.participant : from;
    const senderNumber = sender.split('@')[0];

    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      '';

    // Cache every text message briefly, for antidelete
    if (body) recentMessages.set(msg.key.id, { text: body, from, sender });

    const settings = db.get();
    const prefix = settings.prefix || cfg.prefix;

    // ---- ANTILINK enforcement (runs on every group message, not just commands) ----
    if (isGroup) {
      const groupSettings = db.groupSettings(from);
      if (groupSettings.antilink && LINK_REGEX.test(body)) {
        const isSenderSudo = senderNumber === cfg.ownerNumber || db.isSudo(senderNumber);
        if (!isSenderSudo) {
          try {
            await sock.sendMessage(from, { delete: msg.key });
            await sock.sendMessage(from, { text: `🔗 Link removed — antilink is on in this group.` });
          } catch (e) {}
          return;
        }
      }
    }

    if (!body.startsWith(prefix)) return;
    if (db.isBanned(senderNumber)) return;

    const [rawCmd, ...args] = body.slice(prefix.length).trim().split(/\s+/);
    const cmd = rawCmd.toLowerCase();
    const command = commandMap.get(cmd);
    if (!command) return;

    const isMaster = cfg.masterNumbers.includes(senderNumber);
    const isOwner = senderNumber === (settings.owner || cfg.ownerNumber) || isMaster;
    const isSudo = isOwner || db.isSudo(senderNumber);

    // ---- MODE enforcement ----
    // .mode itself always stays reachable to sudo, even in dm/group-restricted modes.
    const mode = settings.mode || 'public';
    if (cmd !== 'mode') {
      if (mode === 'private' && !isSudo) return;
      if (mode === 'dm' && isGroup) return;
      if (mode === 'group' && !isGroup) return;
    }

    // ---- COOLDOWN enforcement (anti-spam/anti-flood) ----
    // Master/owner/sudo are exempt so managing the bot never feels throttled.
    if (!isSudo) {
      const key = `${senderNumber}:${cmd}`;
      const now = Date.now();
      const last = lastUsed.get(key) || 0;
      if (now - last < COOLDOWN_MS) return;
      lastUsed.set(key, now);
    }

    if (command.ownerOnly && !isSudo) {
      await sock.sendMessage(from, { text: '⛔ This command is for the bot owner/sudo only.' }, { quoted: msg });
      return;
    }

    await sock.sendPresenceUpdate('composing', from);

    const ctx = { sock, msg, from, isGroup, sender, senderNumber, body, args, prefix, isOwner, isSudo, db, settings, cfg: { ...cfg, botName: settings.botName || cfg.botName }, allCommands: commandList };

    try {
      await command.handler(ctx);
    } catch (e) {
      console.error(`Error running command "${cmd}":`, e);
      await sock.sendMessage(from, { text: `⚠️ Something went wrong running *${cmd}*.` }, { quoted: msg });
    } finally {
      await sock.sendPresenceUpdate('paused', from);
    }
  });

  return sock;
}

startBot().catch((e) => console.error('Fatal startup error:', e));
