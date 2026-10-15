// lib/loader.js — scans commands/*.js (one file per command, or per group
// of closely-related commands like anime reactions / text effects) and
// builds a name -> command lookup, plus the full list for .menu to use.
const fs = require('fs');
const path = require('path');

const COMMANDS_DIR = path.join(__dirname, '..', 'commands');

function loadCommands() {
  const commandMap = new Map();
  const commandList = [];

  const files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.js'));

  for (const file of files) {
    try {
      const command = require(path.join(COMMANDS_DIR, file));
      if (!command || !command.commands || !command.handler) {
        console.warn(`Skipping ${file}: missing "commands" or "handler"`);
        continue;
      }
      commandList.push(command);
      for (const name of command.commands) {
        if (commandMap.has(name.toLowerCase())) {
          console.warn(`Duplicate command "${name}" in ${file} — overwriting previous registration`);
        }
        commandMap.set(name.toLowerCase(), command);
      }
    } catch (e) {
      console.error(`Failed to load command file ${file}:`, e.message);
    }
  }

  const totalNames = commandList.reduce((sum, c) => sum + c.commands.length, 0);
  console.log(`Loaded ${commandList.length} command files, ${totalNames} command names total`);
  return { commandMap, commandList };
}

module.exports = { loadCommands };
