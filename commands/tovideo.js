// Converts a replied-to animated sticker or gif into a regular mp4 video.
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
    commands: ['tovideo'],
    section: 'Conversion',
    description: 'Reply to an animated sticker or gif to convert it into a video',
    ownerOnly: false,
    handler: async ({ sock, from, msg }) => {
      const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      const stickerMsg = quoted?.stickerMessage;
      const imageMsg = quoted?.imageMessage; // WhatsApp sends gifs as imageMessage with gifPlayback set
      if (!stickerMsg && !imageMsg) {
        return sock.sendMessage(from, { text: 'Reply to an animated sticker or gif with .tovideo' }, { quoted: msg });
      }

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macon-tovideo-'));
      const inPath = path.join(tmpDir, stickerMsg ? 'in.webp' : 'in.gif');
      const outPath = path.join(tmpDir, 'out.mp4');

      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(
          { message: stickerMsg ? { stickerMessage: stickerMsg } : { imageMessage: imageMsg } },
          'buffer',
          {}
        );
        fs.writeFileSync(inPath, buffer);

        await run('ffmpeg', ['-y', '-i', inPath, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', outPath]);

        const videoBuffer = fs.readFileSync(outPath);
        await sock.sendMessage(from, { video: videoBuffer }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(from, { text: '⚠️ Could not convert that. Make sure ffmpeg is installed (pkg install ffmpeg in Termux).' }, { quoted: msg });
      } finally {
        fs.rm(tmpDir, { recursive: true, force: true }, () => {});
      }
    }
  };
}

module.exports = buildCommand();
