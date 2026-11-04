# Multi-chat overlay for OBS

A single HTML file that outputs **Twitch + YouTube + Kick** chat in OBS as a
Browser Source: transparent background, nick and user-color badges, emotes,
auto-scroll, and support for multiple channels at once.

```
chat-overlay/
├── overlay.html          <- the overlay itself (add this to OBS)
├── config.js             <- default settings (channels, size, look)
├── overlay-settings.js   <- settings from the app window (overrides config.js)
└── README.md             <- this guide
```

---

## 0. What the overlay shows

One HTML file outputs Twitch, YouTube, and Kick messages: nick, user color,
emotes, platform badges, and auto-scroll. No server required.

Channels are set in `config.js` or in the app's settings window — it saves them
to `overlay-settings.js`, which overrides `config.js`. The channel list is
empty by default.

YouTube messages can go through the desktop app (`chat-desktop`): it reads
YouTube chat **without the Data API** (no daily quota spent) and relays messages
to OBS at `http://127.0.0.1:38999` — both windows show them within 1–2 seconds.
If the app is not running, OBS polls the API itself (slower and quota-limited).

---

## 1. Quick start

1. Open `config.js` and add your channels:

   ```js
   twitch: ['channel_one', 'channel_two'],
   kick:   [],
   youtube: { videoId: '', apiKey: '' }
   ```

2. In OBS: **Sources → + → Browser**.
3. Tick **"Local file"** and select `overlay.html` (the "Browse" button). Or
   paste the path into the URL field:

   ```
   file:///C:/obs/chat-overlay/overlay.html
   ```

4. Source size: **Width 480, Height 900** (adjust to your screen).
5. Enable **"Refresh browser when scene becomes active"** and **"Shutdown
   source when not visible"** — so the chat does not run idle.
6. Place the source in the desired corner above the game/camera.

The source background is transparent; nothing else needs changing.

> If OBS cannot open a file from a path containing non-Latin characters, copy
> the `chat-overlay` folder somewhere without them, for example
> `C:\obs\chat-overlay`, and add it from there. The folder is self-contained.

---

## 2. Settings

### Through the settings window (easiest)

In the **Stream Helper — chat & bot** app, open settings:

- right-click the tray icon → **"Settings…"**, or
- the **`Ctrl + Alt + S`** hotkey.

There are seven sections:

- **Accounts & Channels** — Twitch, Kick, YouTube (channel, stream link, API
  key). If the channel is renamed, change it here once.
- **Appearance** — theme, font, message count, opacity, platform badges, and
  new-message direction.
- **Behavior** — demo mode, technical status, and chat-bot sync.
- **Bot** — start, stop, and restart the built-in bot, autostart, and a link to
  its panel.
- **Notifications** — Telegram stream alerts and summaries.
- **Twitch** — Twitch application Client ID and bot authorization via the
  device-code flow.
- **Language** — Auto (system), Russian, or English.

Available themes: **Classic**, **Glass**, **Neon**, **Light**, **Minimal**, and
**Modern**. The theme applies to both overlays right after saving.
- **Behavior** also has chat-bot sync: on save, the Twitch channel and YouTube
  data are written to `chat-desktop/bot/config.js`, and the app restarts the bot
  automatically.

Saving writes `overlay-settings.js` next to `overlay.html`. It is read by
**both** overlays: OBS and the in-game window. In the in-game window changes
apply immediately; in OBS, after refreshing the source (right-click the source
→ **"Refresh"**).

> `overlay-settings.js` overrides `config.js`. If a channel "does not change",
> check for an old value there, or click **"Reset to config.js"** in settings.

### Through `config.js` (defaults)

| Parameter | What it does |
|---|---|
| `twitch` | array of channels, e.g. `['nordwind', 'kisa']` |
| `kick` | array of Kick channels |
| `youtube.channelId` | channel ID (`UC…`) or `@handle` — the overlay finds the current stream |
| `youtube.videoId` | specific stream id (`watch?v=**THIS**`), optional |
| `youtube.apiKey` | YouTube Data API v3 key |
| `youtube.relay` | take messages from the `chat-desktop` app (default yes) |
| `youtube.pollMs` | interval for direct API mode, ms (12,000); unused through the app |
| `maxMessages` | messages on screen (default 14) |
| `fontSize` | font size; everything scales from it (24) |
| `theme` | theme: `'classic'`, `'glass'`, `'neon'`, `'soft'`, `'minimal'`, or `'modern'` |
| `bgOpacity` | badge opacity: 0 — fully transparent, 100 — solid (58) |
| `showPlatform` | show the TWITCH / YOUTUBE / KICK badge |
| `align` | `'bottom'` (new messages at the bottom) or `'top'` |
| `demo` | `true` — fake chat for checking the look |
| `debug` | `true` — connection status in the corner |

### Through the source URL (overrides `config.js`)

Convenient when you do not want to edit a file:

```
overlay.html?twitch=nordwind,kisa&limit=12&size=30
```

| Parameter | Example | Meaning |
|---|---|---|
| `twitch` | `?twitch=a,b` | comma-separated Twitch channels |
| `kick` | `?kick=a` | Kick channels |
| `youtube` | `?youtube=VIDEO_ID` | stream id |
| `ytchannel` | `?ytchannel=@your_channel` | channel: finds the current stream itself |
| `ytkey` | `?ytkey=AIza...` | YouTube API key |
| `limit` | `?limit=12` | messages on screen |
| `size` | `?size=32` | font size |
| `theme` | `?theme=neon` | appearance theme |
| `opacity` | `?opacity=40` | badge opacity, 0–100 |
| `relay` | `?relay=0` | do not take YouTube messages from the app |
| `poll` | `?poll=15000` | YouTube poll interval, ms |
| `platform` | `?platform=0` | disable platform badges |
| `align` | `?align=top` | new messages at the top |
| `demo` | `?demo=1` | demo chat |
| `debug` | `?debug=1` | connection status |

> If the URL contains `?`, it is better to paste the local file path into OBS
> manually rather than through "Browse" — OBS sometimes drops parameters.

---

## 3. YouTube: where to get a key and channel

1. Open <https://console.cloud.google.com/> → create a project.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Copy the key into `config.js` (`youtube.apiKey`) or `?ytkey=`.

Then it is enough to specify the channel — the overlay finds the current stream
itself:

```js
youtube: {
  channelId: 'UCxxxxxxxxxxxxxxxxxxxxxx', // or '@your_channel'
  videoId: '',
  apiKey: 'AIza...'
}
```

Channel ID: channel page → "More" → "Share" → "Copy channel ID" (starts with
`UC`). You can also just write `@handle` — the overlay resolves it.

If you need a specific stream (for example, a premiere that is not in search
yet), enter `videoId` — the part of the link after `v=` (for `youtu.be/XXXX` it
is `XXXX` itself). Channel search is then skipped.

The key is free, but the Data API has a limit — **10,000 units per day**, and
one chat poll costs 5 units. That is why direct mode uses a 12-second interval
(about 6.5 hours of stream), and stream discovery goes through the channel's
uploads playlist instead of `search.list` (search has its own limit of only 100
requests per day).

In practice the key is almost unnecessary for reading: the `chat-desktop` app
reads chat directly from the YouTube page — no quota and 1–2 seconds of
latency — and OBS takes the ready messages. The key remains for the bot and for
the fallback mode when the app is off.

---

## 4. About VK Play / VK Video / Trovo

These platforms are **not supported directly**: their chat cannot be read from
a static page — it requires an app OAuth token and a server-side proxy (VK also
requires request signing). Options if you need chat from there:

- **Restream Studio / Restream Chat** — reads VK Play, Trovo, Twitch, YouTube,
  and provides one widget for OBS.
- **VK Play**: the official chat widget in the streamer panel (iframe) can be
  added to OBS as a Browser Source directly.
- Third-party overlay services (StreamElements, Streamlabs, BotRix) — most have
  a multi-chat widget with an OBS link.

Twitch and Kick are read directly by this overlay and require no tokens.

---

## 5. Look and customization

All styling is in the `<style>` block at the top of `overlay.html`.

```css
:root {
  --bg: rgba(10, 10, 14, 0.58);  /* badge background, 4th number = opacity */
  --fg: #f4f4f7;                 /* text color */
  --radius: calc(var(--font-size) * 0.46);
}
```

Accent color (left stripe) and nick colors per platform:

```css
.msg.p-twitch  { --accent: #9146ff; }
.msg.p-youtube { --accent: #ff0033; }
.msg.p-kick    { --accent: #53fc18; }
```

If you want no badges at all (just text with a shadow), replace
`background: var(--bg);` on `.msg` with `background: transparent;`.

---

## 6. Troubleshooting

| Symptom | What to do |
|---|---|
| Empty, nothing at all | add `?debug=1` to the source URL to see the reason; make sure the channel is written without `@`/`#` |
| Twitch is silent | does the channel exist? check the login in a browser: `twitch.tv/channel_name` |
| YouTube: "no active chat" | the stream has not started or has already ended / wrong `videoId` |
| YouTube: "key error" or empty, Twitch works | check `channelId` (not confused with an empty same-name channel) and the limit: 10,000 units per day, one poll — 5 |
| Kick is empty | unofficial API, often blocked by region — enable a VPN or remove Kick |
| Emotes do not load | OBS needs internet; a corporate/home filter may block the CDN |
| Old messages stay | reduce `maxMessages` |
| Chat is cut off at the edges | increase the source size in OBS or reduce `size` |
| Chat died after minimizing the scene | enable "Refresh browser when scene becomes active" |

To check the look without streaming: add `?demo=1` to the URL — a fake chat
from three platforms starts.

---

## 7. Limitations

- Twitch is read anonymously: the overlay cannot send messages, only display
  them. Sending requires an OAuth token and a separate bot.
- Anonymous Twitch chat sometimes does not deliver messages in channels with
  "subscribers-only"/verification restrictions — this is a Twitch limitation,
  not the overlay's.
- Kick uses an unofficial Pusher channel; stability is not guaranteed.
- The YouTube key is stored in the file in plain text — do not publish
  `config.js` if you do not want to expose the key (restrict it in Google Cloud
  by HTTP referrer or use a separate project).
