// Converts a replied-to image, video, or gif into a WhatsApp sticker.
// Uses ffmpeg (a Termux system package via `pkg install ffmpeg`, not an
// npm native module) — this avoids the sharp/libvips compile failures
// that happen on Android.
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
    commands: ['tosticker'],
    section: 'Conversion',
    description: 'Reply to an image, video, or gif to convert it into a sticker',
    ownerOnly: false,
    handler: async ({ sock, from, msg }) => {
      const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
      const imageMsg = quoted?.imageMessage || msg.message.imageMessage;
      const videoMsg = quoted?.videoMessage || msg.message.videoMessage;
      if (!imageMsg && !videoMsg) {
        return sock.sendMessage(from, { text: 'Reply to an image, video, or gif with .tosticker' }, { quoted: msg });
      }

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'macon-sticker-'));
      const inPath = path.join(tmpDir, imageMsg ? 'in.jpg' : 'in.mp4');
      const outPath = path.join(tmpDir, 'out.webp');

      try {
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        const buffer = await downloadMediaMessage(
          { message: imageMsg ? { imageMessage: imageMsg } : { videoMessage: videoMsg } },
          'buffer',
          {}
        );
        fs.writeFileSync(inPath, buffer);

        if (imageMsg) {
          await run('ffmpeg', ['-y', '-i', inPath, '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', outPath]);
        } else {
          await run('ffmpeg', ['-y', '-i', inPath, '-t', '6', '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000', '-loop', '0', '-an', outPath]);
        }

        const stickerBuffer = fs.readFileSync(outPath);
        await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(from, { text: '⚠️ Could not convert that. Make sure ffmpeg is installed (pkg install ffmpeg in Termux).' }, { quoted: msg });
      } finally {
        fs.rm(tmpDir, { recursive: true, force: true }, () => {});
      }
    }
  };
}

module.exports = buildCommand();
