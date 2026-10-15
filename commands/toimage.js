// Converts a replied-to sticker (webp) back into a regular PNG image.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: 30000 }, (err) => (err ? reject(err) : resolve()));
  });
}

function buildCommand() {
  return {
    commands: ['toimage'],
    section: 'Conversion',
    description: 'Reply to a sticker to convert it back into an image',
    ownerOnly: false,
    handler: async ({ sock, from, msg }) => {
      const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      const stickerMsg = quoted?.stickerMessage;
      if (!stickerMsg) return sock.sendMessage(from, { text: 'Reply to a sticker with .toimage' }, { quoted: msg });

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macon-toimage-'));
      const inPath = path.join(tmpDir, 'in.webp');
      const outPath = path.join(tmpDir, 'out.png');

      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage({ message: { stickerMessage: stickerMsg } }, 'buffer', {});
        fs.writeFileSync(inPath, buffer);

        await run('ffmpeg', ['-y', '-i', inPath, outPath]);

        const imageBuffer = fs.readFileSync(outPath);
        await sock.sendMessage(from, { image: imageBuffer }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(from, { text: '⚠️ Could not convert that sticker. Make sure ffmpeg is installed (pkg install ffmpeg in Termux).' }, { quoted: msg });
      } finally {
        fs.rm(tmpDir, { recursive: true, force: true }, () => {});
      }
    }
  };
}

module.exports = buildCommand();
