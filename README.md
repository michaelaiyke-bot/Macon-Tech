<a href="https://git.io/typing-svg">
  <img src="https://readme-typing-svg.demolab.com?font=Orbitron&size=50&pause=1000&color=33ff00&center=true&width=910&height=100&lines=Macon bot;Predator+Bot;Made+By+Silent+Wolf" alt="Typing SVG" style="font-size: 50px;"/>
</a>

<div align="center">
<img src="./assets/a_dramatic_high_contrast_cinematic_tech_gaming_s.png" alt="Macon-Tech" width="500">

# Macon-Tech Bot

*Built quiet. Runs loud.*

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/yourusername/macon-tech-bot)
[![Session Pair](https://img.shields.io/badge/SESSION-PAIR%20CODE-blue)](https://your-pairing-site.example.com)
[![Download ZIP](https://img.shields.io/badge/DOWNLOAD-ZIP-orange)](https://github.com/michaelaiyke-bot/Macon-Tech/archive/refs/heads/main.zip)

![Stars](https://img.shields.io/github/stars/michaelaiyke-bot/Macon-Tech?style=flat&color=green)
![Forks](https://img.shields.io/github/forks/michaelaiyke-bot/Macon-Tech?style=flat&color=green)
![Repo Size](https://img.shields.io/github/repo-size/michaelaiyke-bot/Macon-Tech?style=flat&color=green)

</div>

---

## What is Macon-Tech?

Macon-Tech is a WhatsApp bot with 160+ commands — owner tools, group
management, a full economy game, trivia and reactions, AI chat, network
lookups, text-effect logos, and more. It runs on Node.js using the
Baileys library, and every command lives in plain, readable code inside
this repo — nothing is fetched or executed from anywhere else at
runtime. What you see here is what runs.

---

## 🚀 Installation

### 1. Clone the repository
```
git clone https://github.com/yourusername/macon-tech-bot.git
cd macon-tech-bot
```

### 2. Install dependencies
```
npm install
```

### 3. Get your session pair code
Visit the [Session Pair Page](https://your-pairing-site.example.com) to
generate your WhatsApp session credentials — or just run the bot and
pair interactively, see step 4.

### 4. Start the bot
```
npm start
```
Or deploy directly using the **Deploy to Heroku** button above for a
one-click cloud setup. Railway and Render both work too — connect the
repo in their dashboard, set your environment variables from
`.env.example`, and deploy.

Full step-by-step Termux (phone) instructions are further down this
README.

---

## 📋 Command Categories

| Category | Example commands |
|---|---|
| Owner | menu, alive, uptime, ping, status, setprefix, setowner, setbotname, mode, repo |
| Group | kick, promote, demote, tagall, antilink, antidelete |
| Fun | slap, hug, happy, art, take |
| Anime Reactions | hug, kiss, pat, dance, wink, cry, bonk, yeet |
| Games | trivia, joke, quote, truth, dare |
| Economy | balance, daily, work, pay, rob, gamble, leaderboard |
| Network Tools | whois, dnslookup, headers, sslcheck, hashcheck |
| Utility | calc, weather, wiki, url, vv, onwhatsapp |
| AI | ai, gpt, gemini, grok, chatbot |
| Sports | football, basketball, cricket, tennis |
| Music | song, video, lyrics |
| Text Effects | 40+ styled logo/text commands |
| Conversion | tosticker, toimage, tovideo |

Full list any time with `.menu` inside the bot itself.

---

## ⚙️ Requirements

- Node.js v18 or higher
- npm v9 or higher
- A WhatsApp account for pairing
- Termux (phone), Heroku, Railway, Render, or any Linux VPS
- **ffmpeg** — only needed for `.tosticker`, `.toimage`, and `.tovideo`.
  In Termux: `pkg install ffmpeg -y`. On a VPS: `apt install ffmpeg` (or
  your distro's equivalent). This is a system package, not an npm
  dependency — it's what avoids the native-compile failures npm packages
  like `sharp` run into on Android.

---

## 📱 Deploying on your phone (Termux)

1. Install **Termux** from F-Droid (not the outdated Play Store version):
   https://f-droid.org/en/packages/com.termux/
2. Open Termux and run:
   ```
   pkg update -y && pkg upgrade -y
   pkg install nodejs git unzip ffmpeg -y
   ```
3. Get this project into Termux's own storage (not your shared Downloads
   folder — that causes permission errors):
   ```
   cp -r /storage/emulated/0/Download/Macon-Tech-Main ~/Macon-Tech-Main
   cd ~/Macon-Tech-Main
   ```
4. Set up your environment file:
   ```
   cp .env.example .env
   nano .env
   ```
   Fill in your `OWNER_NUMBER` and any API keys you have. Save with
   `Ctrl+O`, Enter, then `Ctrl+X` to exit.
5. Install and approve scripts:
   ```
   npm install
   npm approve-scripts --all
   mkdir data
   ```
6. Start it:
   ```
   npm start
   ```
   Enter your WhatsApp number when asked, then link the pairing code
   under WhatsApp → Linked Devices → Link a Device → "Link with phone
   number instead." Have that screen open *before* the code appears.

To keep it running after closing Termux, look into `termux-wake-lock`
and a `tmux` session, or move to one of the always-on hosts above.

---

## Never share these

- Your `.env` file (has your API keys)
- Your `session/` folder or any `SESSION_ID` — full access to your
  WhatsApp account, same as your password

Both are already excluded from git via `.gitignore`.
