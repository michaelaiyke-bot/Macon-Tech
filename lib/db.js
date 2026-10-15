// Simple JSON file "database" — no external DB needed to get started.
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const DEFAULTS = {
  prefix: null,       // null = use config.js default until changed here
  menuImageUrl: null,
  sudo: [],
  banned: [],
  chatbot: { enabled: false, scope: 'off', number: null },
  mode: 'public',      // public | private | dm | group
  groups: {},          // { [groupId]: { antilink: bool, antidelete: bool, welcome: bool } }
  economy: {}           // { [userNumber]: { balance, bank, lastDaily, lastWork } }
};

function ensureDataDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')) };
  } catch (e) {
    fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULTS, null, 2));
    return { ...DEFAULTS };
  }
}

function save(data) { ensureDataDir(); fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

let db = load();

function groupSettings(groupId) {
  if (!db.groups[groupId]) db.groups[groupId] = { antilink: false, antidelete: false, welcome: false };
  return db.groups[groupId];
}

function econ(userNumber) {
  if (!db.economy[userNumber]) db.economy[userNumber] = { balance: 500, bank: 0, lastDaily: 0, lastWork: 0 };
  return db.economy[userNumber];
}

module.exports = {
  get: () => db,
  econ,
  saveEcon: () => save(db),
  set: (updater) => { db = { ...db, ...updater }; save(db); return db; },
  addSudo: (n) => { if (!db.sudo.includes(n)) db.sudo.push(n); save(db); return db.sudo; },
  delSudo: (n) => { db.sudo = db.sudo.filter(x => x !== n); save(db); return db.sudo; },
  isSudo: (n) => db.sudo.includes(n),
  banUser: (n) => { if (!db.banned.includes(n)) db.banned.push(n); save(db); },
  unbanUser: (n) => { db.banned = db.banned.filter(x => x !== n); save(db); },
  isBanned: (n) => db.banned.includes(n),
  groupSettings,
  setGroupSetting: (groupId, key, value) => {
    const g = groupSettings(groupId);
    g[key] = value;
    save(db);
    return g;
  }
};
