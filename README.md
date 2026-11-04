# Stream Helper

**In-game chat + OBS overlay + Twitch chat bot in one application.**

Stream Helper shows chat messages right on top of your game, outputs the same
chat to OBS, and runs a built-in bot: commands, moderation, points, giveaways,
quiz, and Telegram stream notifications.

The app runs on Windows, needs no separate server, and never captures clicks.
The chat window is excluded from screen capture, so viewers only see the clean
OBS overlay.

---

## Features

- **In-game chat** — transparent window, drag mode, hotkeys, and capture
  protection for OBS/Discord.
- **OBS overlay** — a plain HTML file: Twitch, YouTube, and Kick in one source,
  platform badges, emotes, auto-scroll.
- **Twitch bot** — commands, custom replies, timers, moderation (spam, links,
  caps, timeout, and ban), points, giveaways, quiz, subscription/raid/bits
  thanks.
- **Bot panel** — status, live feed, and editors for commands, links,
  moderation, and games in your browser at `http://127.0.0.1:39001`.
- **Twitch authorization in the app** — connect the bot with the device-code
  flow from the **Twitch** settings tab. No file editing required.
- **Telegram notifications** — a stream-start message with preview and buttons,
  plus a summary after the stream.
- **Settings sync** — the channel and links from the settings window are copied
  into the bot config and notifications automatically.
- **Russian and English UI** — switch languages in the **Language** tab; the
  choice is saved immediately.

---

## Installation (Windows)

1. Download the `Stream-Helper-Setup-*.exe` installer from
   [Releases](../../releases).
2. Run it. It installs into your user profile, so administrator rights are not
   required.
3. Launch **Stream Helper** from the desktop.

The application is not code-signed, so Windows may show the blue
"Windows protected your PC" dialog: **More info → Run anyway**.

The installer contains no tokens or channels — everything is configured for
your setup.

---

## Running from source

You need **Node.js 20+** and Windows 10/11.

```bat
git clone https://github.com/ENEMY-1/stream-helper.git
cd stream-helper
npm install
npm start
```

Bot tests:

```bat
npm test
```

Build the installer:

```bat
npm run dist
```

The file appears in `release/`.

---

## First setup

### 1. Channels

Open settings: tray icon → **Settings…** or `Ctrl + Alt + S`.

On the **Accounts & Channels** tab, set:

- **Twitch** — channel name without `@` or `#`;
- **YouTube** — channel ID (`UC…`) or `@handle`; the YouTube Data API key is
  only needed for the "API only" mode (chat is read without a key by default);
- **Kick** — if needed.

The channel and links apply to the chat window, OBS, and the bot. The bot
restarts automatically.

### 2. Twitch bot

1. Open <https://dev.twitch.tv/console/apps> → **Register Your Application**.
2. **Name** — anything, **OAuth Redirect URLs** — `http://localhost:3000`,
   **Category** — `Chat Bot`, **Client Type** — **Public**.
3. Open **Settings → Twitch** in Stream Helper.
4. Paste the **Client ID** and click **Log in to Twitch**.
5. Enter the code shown in the app on the Twitch activation page and confirm
   access. The token is saved automatically.

The token is stored in `chat-desktop/bot/data/tokens.json` and refreshed
automatically. The `data/` folder is excluded from git.

The same values can still be edited manually in `chat-desktop/bot/config.js`:

```js
twitch: {
  channel: 'your_channel',
  clientId: 'your_client_id',
  clientSecret: '',
  botUsername: ''
}
```

### 3. Telegram notifications (optional)

1. Create a bot with [@BotFather](https://t.me/BotFather) using `/newbot` and
   copy the token.
2. Add the bot as an **administrator** of your Telegram channel (posting
   permission is enough).
3. Open the app settings (`Ctrl + Alt + S`) → **Notifications** tab.
4. Paste the token and channel (`@channel_name` or numeric ID `-100…`).
5. Click **Send test message** — it should arrive in the channel.
6. Enable **Send notifications to Telegram** and click **Save**. The bot
   restarts automatically.

The same values can be written manually in `chat-desktop/bot/config.js`:

```js
streamAlerts: {
  enabled: true,
  telegram: {
    botToken: '123456789:AA...',
    chatId: '@channel_name',
    messageThreadId: ''
  }
}
```

Instead of storing the token in a file, you can set the
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` environment variables — they take
priority over `config.js`.

---

## OBS

1. **Sources → + → Browser** (or "Local file").
2. Select `chat-overlay/overlay.html` from the installation or project folder.
3. Source size — about **520 × 880**.
4. Enable **Refresh browser when scene becomes active**.

Details are in [`chat-overlay/README.md`](chat-overlay/README.md).

---

## Where things are stored

| What | Where |
|---|---|
| Channel and appearance settings | `chat-overlay/overlay-settings.js` (created on save) |
| Default settings | `chat-overlay/config.js` |
| Commands, moderation, notifications | `chat-desktop/bot/config.js` |
| Twitch tokens | `chat-desktop/bot/data/tokens.json` |
| Points and giveaway state | `chat-desktop/bot/data/state.json` |
| Logs | `chat-desktop/app.log`, `chat-desktop/bot/data/bot.log` |

When installed with the installer, the application folder is
`%LOCALAPPDATA%\Programs\Stream Helper`.

---

## Hotkeys

| Keys | Action |
|---|---|
| `Ctrl + Alt + S` | Settings |
| `Ctrl + Alt + B` | Bot panel |
| `Ctrl + Alt + C` | Show / hide chat |
| `Ctrl + Alt + E` | Window drag mode |
| `Ctrl + Alt + R` | Reload chat |
| `Ctrl + Alt + P` | Hide / show the window in captures |
| `Ctrl + Alt + Q` | Quit |

---

## Documentation

- [`chat-desktop/README.md`](chat-desktop/README.md) — application, settings,
  hotkeys, troubleshooting.
- [`chat-desktop/bot/README.md`](chat-desktop/bot/README.md) — all commands,
  bot and notification options.
- [`chat-overlay/README.md`](chat-overlay/README.md) — overlay, URL parameters,
  and OBS setup.

Russian versions are available as `README.ru.md` in the same folders.

---

## Author

- Twitch: <https://twitch.tv/uisquad>
- YouTube: <https://youtube.com/@UISquat>
- Telegram: <https://t.me/iseype>

If this project helped, give the repository a star.

---

## License

[MIT](LICENSE)
