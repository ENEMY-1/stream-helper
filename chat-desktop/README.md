# Stream Helper — chat and bot

One app for streaming: a transparent in-game chat, an OBS overlay, and a chat
bot in a single process. One tray icon, one settings panel.

- `chat-desktop/` — chat window, settings, tray icon, and the built-in bot.
- `../chat-overlay/` — the HTML overlay added to OBS.

Both windows read the same channel and appearance settings.

---

## 1. Running from source

You need Windows 10/11 and **Node.js 20+**.

```bat
npm install
npm start
```

`npm start` launches Electron from the project root. Bot tests:

```bat
npm test
```

Build the Windows installer:

```bat
npm run dist
```

The ready installer appears in the `release/` folder.

You can also run `chat-desktop\start.bat` — it uses Electron from
`node_modules`. Flags: `--demo` (demo chat), `--bot-demo` (fake chat for the
bot), `--no-bot` (without the bot), `--settings` (open settings immediately).

---

## 2. What the app does

1. Shows a transparent chat window on top of the game.
2. Starts a local YouTube relay on `127.0.0.1:38999` so OBS and the in-game
   window do not spend the YouTube API quota twice.
3. Starts the built-in bot hidden, without a separate console.
4. Adds a tray icon.

On startup, a hint **"Stream Helper is running · waiting for chat messages"**
appears in the bottom-left corner for 15 seconds, and the tray shows a
notification. If you launch the app a second time, the existing window is
raised instead of opening a new one.

The bot starts with the app when **"Start bot with the application"** is
enabled (the **Bot** tab). On exit, the bot stops and has time to save its
state.

---

## 3. Settings

**Tray → "Settings…"** or `Ctrl + Alt + S`.

- **Accounts & Channels** — Twitch, Kick, YouTube, YouTube API key. Change the
  channel once and it applies to the chat window, OBS, and the bot.
- **Appearance** — theme, font, message count, opacity, platform badges, and
  new-message direction.
- **Behavior** — demo mode, technical status, and bot sync.
- **Bot** — state, start/stop/restart, autostart, and the path to
  `bot/config.js`.
- **Notifications** — Telegram bot token, channel or chat, thread, stream-start
  notifications, and the post-stream summary. There is also a test message
  button here.
- **Twitch** — Twitch application Client ID and bot authorization via the
  device-code flow. No file editing required.
- **Language** — Auto (system), Russian, or English. The change is saved
  immediately, without pressing Save.

Saving writes `chat-overlay/overlay-settings.js`, which is read by both OBS and
the in-game window. Telegram settings are saved separately, directly into
`bot/config.js`, because the bot reads them. Changes are visible in the window
immediately; in OBS, refresh the source (right-click → **Refresh**).

If the channel or a link changes, the app restarts the bot automatically. The
same YouTube link goes into `!social` and into the stream-start/end
notifications.

---

## 4. Hotkeys

| Keys | Action |
|---|---|
| `Ctrl + Alt + S` | Settings |
| `Ctrl + Alt + B` | Bot panel |
| `Ctrl + Alt + C` | Show / hide chat |
| `Ctrl + Alt + E` | Chat window drag mode |
| `Ctrl + Alt + R` | Reload chat |
| `Ctrl + Alt + P` | Hide / show the window in captures |
| `Ctrl + Alt + ]` | Enlarge the window |
| `Ctrl + Alt + [` | Shrink the window |
| `Ctrl + Alt + Q` | Quit (the bot stops too) |

Window position and size are stored in `position.json`. If the window moves
off-screen, use **"Reset position"** in the tray.

---

## 5. Bot

The bot lives in `bot/` and is started by the app. Full instructions are in
[`bot/README.md`](bot/README.md).

In short:

- commands `!help`, `!social`, `!uptime`, `!ping`, `!game`, `!points`, `!top`,
  `!daily`, `!give`, `!join`, `!quiz`, `!ga`, and custom commands;
- timed messages while chat is active;
- moderation: spam, banned words, links, caps, timeout, and ban;
- points, giveaways, quiz, subscription/raid/bits thanks;
- Telegram stream-start notifications and a post-stream summary;
- control panel at `http://127.0.0.1:39001`.

Everything is configured in the bot panel. Settings live in `bot/config.js`;
tokens live in `bot/data/` (this folder is not committed to git).

First Twitch login:

1. Create an application at <https://dev.twitch.tv/console/apps> (Client Type —
   **Public**).
2. In the app, open **Settings → Twitch**, paste the **Client ID**, and click
   **Log in to Twitch**.
3. Enter the code on the Twitch activation page and confirm access.
4. Open the bot panel (`Ctrl + Alt + B`) — the status should be **"Bot
   connected"**.

The token is saved to `bot/data/tokens.json` automatically.

---

## 6. OBS

Add **Sources → + → Browser** (or "Local file") and select
`chat-overlay/overlay.html`. Source size — about **520 × 880**.
Enable **Refresh browser when scene becomes active**.

Details and URL parameters are in
[`../chat-overlay/README.md`](../chat-overlay/README.md).

---

## 7. Troubleshooting

| Symptom | What to do |
|---|---|
| Bot says "Stopped" | Bot tab → **Start**. Check `bot/data/bot.log` |
| Bot says "Error" | Read the text on the tab; usually it is `bot/config.js` or port 39001 is busy |
| Bot panel is empty | Wait a couple of seconds and click **Retry**; check `bot/data/bot.log` |
| Twitch bot is silent | Open Settings → Twitch and log in again; for timeouts and bans the bot must be a channel moderator |
| YouTube is silent | Check the channel in settings; `app.log` should contain `youtube web: chat connected` |
| OBS shows old settings | Right-click the source → **Refresh** |
| Chat window is not visible | Tray → **Show / hide chat** (`Ctrl+Alt+C`), check game mode |
| Port 39001 is busy | Close the old bot or change `statusPort` in `bot/config.js` |
| Settings are not saved | Check write permissions on the `chat-overlay` folder; `overlay-settings.js` must be writable |

---

## 8. Structure

```
chat-desktop/
├── start.bat              launch through Electron from node_modules
├── main.js                chat window, tray, hotkeys, bot startup
├── settings.html          settings window
├── i18n.js                Russian and English dictionaries
├── bot-panel.html         bot panel splash screen
├── bot-panel-preload.js
├── settings-preload.js
├── preload.js             window dragging
├── yt-live.js             YouTube chat reader without Data API
├── bot-sync.js            channel sync into bot/config.js
├── icon.ico / icon.png    window, tray, and shortcut icons
└── bot/                   built-in chat bot
    ├── config.js          commands, timers, moderation, points, giveaways
    ├── src/               bot code
    ├── data/              tokens, state, log (not in git)
    ├── test/              tests (node --test)
    ├── auth-twitch.bat    Twitch login (legacy helper)
    ├── check-config.bat   config and token check
    └── open-panel.bat     open the bot panel
```

---

## 9. Important notes about games

- The overlay is visible in **windowed / borderless** mode. In exclusive
  fullscreen, Windows does not let the window draw on top of the game — switch
  the game to "Borderless Windowed".
- Clicks and focus are not captured.
- The window is excluded from capture (`WDA_EXCLUDEFROMCAPTURE`): it is not
  visible in OBS, Discord, or screen recordings.
- `Ctrl + Alt + P` — if you ever need to show the window in a capture.
