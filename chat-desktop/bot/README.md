# Chat bot (built into the app)

This bot is part of the **Stream Helper — chat & bot** application (the
`chat-desktop` folder). The app starts it hidden, opens its panel in a separate
window, and stops it on exit. No separate console or `node.exe` is needed.

The bot reads chat on your Twitch channel, replies to commands, posts timed
messages every N minutes, and sends stream-start notifications to Telegram.
YouTube is currently **not used** and is disabled in the settings — the bot
works with Twitch only.

The channel is set in the app settings ("Accounts & Channels") or manually in
`config.js`. It is empty by default — fill it in before the first launch.

---

## What it can do

- **Commands** — `!help`, `!social`, `!uptime`, `!ping`, `!twitch`, `!youtube`
  (just a link), `!specs`, `!ds`, `!game`, and any custom ones
  (`!discord`, `!lurk`, `!hug` …).
- **Timed messages** — on a timer, but only while chat is active.
- **Moderation** — removes spam, banned words, third-party links, and caps,
  and issues timeouts and bans automatically based on accumulated strikes.
  Manual commands: `!ban`, `!timeout`, `!unban`, `!delete`, `!modstats`.
- **Points** — channel currency for messages and a daily check-in; transfers
  between viewers and a chat leaderboard.
- **Giveaways** — entry by keyword or `!join`, random winners, optional points
  entry cost.
- **Quiz** — questions in chat with a timer, hints, and a reward for the first
  correct answer.
- **Event thanks** — subscriptions, renewals, gift subscriptions, raids, bits,
  and follows.
- **Telegram notifications** — on stream start, sends a message to the channel
  with the title, category, viewers, and a "Watch" button; when the stream ends,
  sends a summary: duration, peak and average viewers, chat messages, bot
  messages, and moderation actions.
- **Control panel** — `http://127.0.0.1:39001`: connection status, live feed,
  and editors for commands, timers, links, moderation, and games. Changes are
  saved to `config.js` and applied immediately without a restart.
- **Flood protection** — per-command, per-viewer, and replies-per-minute
  limits.

---

## Quick start

The app runs on Electron. Running from source and tests require **Node.js 20 or
newer**; dependencies are installed with `npm install` in the project root. In
the installed version Node.js is not needed: `auth-twitch.bat`,
`check-config.bat`, and `test-alert.bat` use the bundled Electron.

> **`config.js` is not executable.** It is a settings file, not a program: open
> it in Notepad and edit it. Use `edit-config.bat` for that; validate settings
> with `check-config.bat`. The bot is started by the app (`..\start.bat`), not
> by `config.js`.

### Step 1. Twitch application (once)

1. Open <https://dev.twitch.tv/console/apps> → **Register Your Application**.
2. Fill in:
   - **Name** — anything, for example `StreamHelperBot`;
   - **OAuth Redirect URLs** — `http://localhost:3000`;
   - **Category** — `Chat Bot`;
   - **Client Type** — `Public`.
3. Click **Manage** and copy the **Client ID**.
4. In the app, open **Settings → Twitch** and paste the **Client ID**.
   The `clientSecret` and `botUsername` fields can stay empty.

   The same values can be written manually in `bot/config.js`:

   ```js
   twitch: {
     channel: 'your_channel',
     clientId: 'your_client_id_here',
     clientSecret: '',   // not needed for a Public app
     botUsername: ''
   }
   ```

   `edit-config.bat` is a convenient way to edit it.

### Step 2. Twitch login (once)

In the app, open **Settings → Twitch** and click **Log in to Twitch**. A code
appears and the Twitch page opens.

Log in with **the account the bot should post as**, enter the code, and confirm
access.

The old method also works: run **`auth-twitch.bat`** in this folder (`bot/`).

> It is better to create a separate bot account (for example,
> `your_channel_bot`), but the main account works too. It is worth making the
> separate account a channel moderator later — that way it bypasses
> "subscribers-only" and "followers-only" modes.

The token is saved to `data/tokens.json` and refreshed automatically.

> The bot requests permission to read chat, send messages, receive
> subscription/bit notifications, and read the follower list. If you logged in
> with an older version, **log in again** via **Settings → Twitch** (or
> `auth-twitch.bat`): without the new scopes, follow thanks will not work.
> Everything else works with the old token too.

### Step 3. Launch

Launch the **Stream Helper — chat & bot** app:

- the **"Chat over game"** desktop shortcut, or
- `..\start.bat` from the `chat-desktop` folder, or
- this `start.bat` — it opens the app and the bot panel.

The bot starts automatically and runs hidden. Bot panel:

- tray → **"Bot panel…"**;
- `Ctrl + Alt + B`;
- the **"Stream Helper bot panel"** shortcut;
- <http://127.0.0.1:39001> in a browser.

Test without streaming (fake chat):

```
..\start.bat --bot-demo
```

Or run the bot separately for debugging:

```
node src\index.js --demo
```

Validate settings and tokens without sending anything:

```
check-config.bat
```

---

## Launch modes

The app manages the bot. App flags:

| Command | What it does |
|---|---|
| `..\start.bat` | normal launch: in-game chat + bot |
| `..\start.bat --bot` | launch and open the bot panel immediately |
| `..\start.bat --bot-demo` | demo bot: fake chat without connections |
| `..\start.bat --no-bot` | overlay only, no bot |
| `..\start.bat --debug` | overlay technical status |
| `start.bat` (this file) | app + bot panel |
| `start.bat --demo` | same as `..\start.bat --bot-demo` |

Stop it via tray → **"Stop bot"**, the **Bot** tab in settings, or by quitting
the app (`Ctrl + Alt + Q`). The bot has time to save points and giveaway state.

---

## Telegram stream notifications

The bot checks whether the stream is live (once a minute via the Twitch API),
and on the "offline → live" transition sends a message to the Telegram channel:
title, category, viewers, preview, and a "Watch" button. It does not post twice
about the same stream — including after a bot restart.

When the stream ends, the bot sends a **stream summary**:

```
📊 your_channel: stream ended

⏱ Duration: 2 h 15 min
🏆 Peak viewers: 128
👀 Average: 74

💬 Chat: 342
🤖 Bot messages: 27
🛡 Moderation actions: 3

🕘 Start: 21:18
🕘 End: 23:33

▶️ Channel: https://twitch.tv/your_channel
```

- **Peak viewers** — the maximum from Twitch API checks while the stream was
  live. The smaller `checkIntervalSec`, the more accurate the peak (60 s is a
  good balance).
- **Duration** — time from the stream start (per Twitch) to the last check when
  the stream was still live — so the stream is considered ended within a minute
  of the actual end.
- **Average** — average across all checks.
- **Chat / bot** — how many messages arrived in chat and how many the bot sent
  during this stream.
- **Moderation** — how many actions (deletions, timeouts, bans) the bot made.

The summary arrives within `checkIntervalSec` after the stream ends. The bot
must be running for this — if you close the app, nobody will check the stream
and send the summary. See the autostart section below.

If the bot did not see the stream for more than 15 minutes (was off, network
was down), the summary is not sent — otherwise it would have to describe a
"stream" with an unknown end. The results still go into history.

### Setup (once)

1. In Telegram, open **@BotFather** → `/newbot` → choose a name. It returns a
   token like `123456789:AA...`.
2. Add the bot as an **administrator** of your channel. "Post messages"
   permission is enough.
3. Open the app settings (`Ctrl + Alt + S`) → **Notifications** tab.
4. Paste the token and channel: for a public one — `@channel_name`, for a
   private one — numeric ID `-100…`. If notifications should go to a supergroup
   topic, specify its number.
5. Click **Send test message** — it should arrive in the channel.
6. Enable **Send notifications to Telegram** (and, if needed, **Send summary
   after stream**) and click **Save**. The bot restarts automatically.

You can also do it manually — in `config.js` via `edit-config.bat`:

```js
streamAlerts: {
  enabled: true,          // stream-start notifications
  offlineEnabled: true,   // summary when the stream ends
  telegram: {
    botToken: '123456789:AA...',
    chatId: '@my_channel',   // or -1001234567890
    messageThreadId: ''      // only for a supergroup topic
  }
}
```

After a manual edit, restart the bot: tray → "Restart bot" (or the Bot tab in
the app settings).

Check without the settings window: `test-alert.bat` — stream-start test,
`test-alert.bat --end` — summary test.

Instead of storing the token in a file, you can set the `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_CHAT_ID` environment variables — they take priority over `config.js`.

### Settings

| Parameter | Meaning |
|---|---|
| `enabled` | `true` — enable stream-start notifications |
| `offlineEnabled` | `true` (default) — send the summary when the stream ends |
| `checkIntervalSec` | how often to check the stream, 20–600 seconds (default 60) |
| `maxStartAgeMinutes` | do not post if the stream has been live longer than N minutes; `0` — always post |
| `silent` | `true` — notification without sound |
| `sendPreview` | attach the stream preview to the message |
| `message` | start text; placeholders `{channel} {title} {game} {viewers} {url} {youtube} {uptime} {started}` |
| `offlineMessage` | summary text (empty — default) |
| `youtube` | YouTube link in the notification: channel (`https://youtube.com/@handle` — the bot appends `/live`) or a ready video; empty — no YouTube |

Placeholders in `offlineMessage`:

| Field | Value |
|---|---|
| `{channel}` `{title}` `{game}` `{url}` `{date}` | channel, stream title and category, link, date |
| `{duration}` | duration as text: `2 h 15 min` |
| `{durationMinutes}` | duration in minutes: `135` |
| `{peak}` | peak viewers |
| `{average}` | average viewers across checks |
| `{messages}` | chat messages during the stream |
| `{replies}` | how many messages the bot sent |
| `{commands}` | how many commands (`!…`) viewers wrote |
| `{moderation}` | moderation actions |
| `{started}` `{ended}` | start and end time (`21:18`) |

Check settings and current status without sending anything:

```
test-alert.bat --check
```

Results of past streams are saved in `data/state.json` (`streamHistory`
section, last 20) and in `streamAlerts.history`; the bot panel also returns them
via `/status` (the `streams` field).

If notifications do not arrive: check that the bot is still a channel
administrator, the token has not been revoked, and `data/bot.log` has no lines
with `Telegram` or `Notification not sent`. If only the summary is missing, look
for `Stream end summary not sent`.

---

## Control panel

<http://127.0.0.1:39001>

Sections:

- **Overview** — Twitch: connection, channel, which account, whether it can post;
  message and reply counters; recent message feed.
- **Commands** — create, edit, disable, duplicate, and delete a command. You can
  set aliases, permissions, platforms, cooldown, and reply text. There is search,
  filtering, and a live preview.
- **Timers** — text, interval, platforms, enable/disable. The panel shows when
  the next timed message will fire.
- **Links** — Twitch, YouTube, Discord, Telegram, and other platform addresses;
  they are inserted into `!social` and variables like `{discord}`.
- **Moderation** — enable, exemptions, banned words, domains, caps, spam, and
  punishment rules. Statistics for deletions, timeouts, and bans is shown next
  to them.
- **Games** — points, giveaways, quiz, and thank-you texts for subscriptions,
  raids, and bits.

How saving works:

- changes are written directly to `config.js`; comments and other sections are
  preserved;
- a `config.js.bak` backup is created before each write;
- the file is replaced atomically, and after writing it is checked to still be
  valid;
- the running bot picks up new commands and timers immediately, no restart
  needed;
- names of built-in commands (`!help`, `!social`, `!uptime`, `!ping`, and their
  aliases) cannot be taken.

The panel is accessible only from this computer (`127.0.0.1`), and changes are
accepted only from the panel itself (protection against third-party requests).
The YouTube card appears only if YouTube is enabled in `config.js`.

---

## Commands

Built-in (work immediately):

| Command | What it replies |
|---|---|
| `!help`, `!commands` | list of available commands |
| `!social` | all filled links from `socials` |
| `!uptime` | how long the Twitch stream has been running |
| `!ping` | `pong 🏓` |
| `!twitch` | Twitch link |
| `!youtube` | YouTube link (just a link; the bot does not read chat there) |
| `!specs` | PC specs (text set in `config.js`) |
| `!ds`, `!discord` | Discord link from `socials.discord` |
| `!game` | current stream category from the Twitch API |
| `!points` | viewer's points balance |
| `!top` | top-5 viewers by points |
| `!daily` | daily points bonus |
| `!give <nick> <amount>` | transfer points to another viewer |
| `!join` | join an active giveaway |
| `!quiz start/stop/skip/status` | quiz (moderators only) |
| `!ga start <word> <minutes> [winners] <prize>` | start a giveaway (moderators) |
| `!ga stop`, `!ga cancel`, `!ga status` | finish, cancel, or check a giveaway (moderators) |
| `!ban`, `!timeout`, `!unban`, `!delete`, `!modstats` | manual moderation (moderators) |

Custom commands — in `config.js`:

```js
commands: [
  {
    name: 'discord',                 // !discord
    aliases: ['ds'],                 // !ds
    reply: 'Community Discord: {discord}',
    permission: 'everyone',          // everyone | mod | broadcaster
    platforms: ['twitch'],
    cooldownMs: 10000,               // optional
    enabled: true
  }
]
```

Available variables in `reply`:

```
{user} {channel} {platform} {uptime} {date} {time}
{game} {title} {viewers}
{socials} {youtube} {twitch} {discord}
```

`{game}`, `{title}`, and `{viewers}` come from the Twitch API. If the stream is
not live or the API is unavailable, an empty string is substituted.

Details:

- `!help` is not shown to viewers if a command is moderator-only.
- Replies are automatically trimmed to 480 characters (Twitch limit).
- Cooldowns: 1.2 s between any replies, 5 s per command, 15 s per viewer, no
  more than 10 replies per minute. Everything is configured in `bot`.
- Names and aliases of built-in commands (`!points`, `!top`, `!quiz`, `!ga`,
  `!ban`, and the rest from the table) cannot be taken by a custom command.

`!uptime` works through Twitch Helix with your token. If there is no token, the
bot honestly replies that it cannot check.

---

## Timed messages

```js
timers: [
  {
    text: 'Subscribe on YouTube: {youtube}',
    everyMinutes: 25,
    platforms: ['twitch']
  }
]
```

Rules:

- the first message only after a full interval since launch;
- a message is sent **only if chat had activity in the last 10 minutes**
  (`bot.activityWindowMinutes`);
- at least 2 minutes between any timed messages (`timersSettings.minGapMs`);
- if chat is silent, the timer waits and does not "catch up" on missed posts.

This way the bot does not spam an empty chat or dump a dozen messages after
returning from AFK.

---

## Moderation and punishments

Moderation works automatically if `moderation.enabled: true`. The bot must be a
**channel moderator** or run the channel from its own account: deletion,
timeout, and ban are sent as regular Twitch commands (`/delete`, `/timeout`,
`/ban`, `/unban`), so no separate OAuth permissions are needed. If the bot is
not a mod, Twitch simply rejects the command — in chat it looks as if the
punishment did not work.

What is checked:

| Violation | How it is detected |
|---|---|
| Banned words | `bannedWords.words` list; `match: 'word'` — whole word only, `'substring'` — any occurrence |
| Third-party links | any domain not in `links.allow` or the `socials` section |
| Caps | at least `caps.minLength` letters and at least `caps.percent` % uppercase |
| Flood | more than `spam.maxMessages` messages in `spam.windowSec` seconds |
| Repeats | the same message `spam.duplicateCount` times in `spam.duplicateWindowSec` seconds |
| Too long | longer than `spam.maxLength` characters |
| Symbol spam | 12 identical characters in a row or 10+ emoji |

Punishments:

- a violation gives a strike; strikes are counted for
  `punishment.strikeWindowMin` minutes, then reset;
- from the 2nd strike — a timeout for `timeoutSec` (5 minutes by default), each
  next timeout is longer;
- from the 6th strike — a ban;
- the message is deleted immediately, and the offender gets a short warning
  once a minute (if `warnInChat: true`).

Moderators, the broadcaster, subscribers, and VIPs are not checked by default.
This changes in `exempt`; specific nicknames can be added in `exempt.users`.

Manual commands (moderators only):

```
!ban <nick> [reason]
!timeout <nick> [seconds] [reason]
!unban <nick>
!delete <nick|message id>
!modstats
```

Strikes and the last action are saved in `data/state.json`; statistics are shown
on the **Moderation** tab in the panel.

---

## Points (channel currency)

Points are awarded for chat messages: `points.perMessage` per message, but no
more often than once per `points.messageCooldownSec` seconds. Bots from
`bot.ignore` do not receive points.

| Command | What it does |
|---|---|
| `!points` | shows the balance and leaderboard position |
| `!top` | top-5 viewers |
| `!daily` | daily bonus `points.dailyBonus` once per 24 hours |
| `!give <nick> <amount>` | transfer to another viewer, minimum `points.transferMin` |

The balance is stored in `data/points.json` and survives restarts. Maximum —
`points.maxBalance`. Points are spent on giveaway entry if `giveaways.entryCost`
is set, and awarded for correct quiz answers.

You can only transfer to someone who has already written in chat: the bot knows
viewers by messages, not by the follower list.

---

## Giveaways

Start (moderators):

```
!ga start <word> <minutes> [winners] <prize>
!ga status
!ga stop      — finish and pick winners now
!ga cancel    — cancel without picking
```

Example: `!ga start prize 10 2 Steam game`.

Viewers enter by writing the keyword in chat or with `!join`. One viewer — one
entry (`allowMultiple: false`). Messages starting with `!` do not count as
entries. When time runs out, the bot randomly picks winners and posts them in
chat. If there are no participants, it says so.

`entryCost` sets the entry cost in points; if the viewer does not have enough,
the bot replies with the required amount. The charge is non-refundable, including
on `!ga cancel`. The active giveaway and participant list are saved in
`data/state.json`, so a bot restart does not reset them.

---

## Quiz

```
!quiz start     — start
!quiz stop      — finish
!quiz skip      — skip the current question
!quiz status    — how many questions and correct answers
```

Commands are available to moderators. Questions come from `quiz.questions`:

```js
questions: [
  { q: 'How many planets are in the Solar System?', a: ['8', 'eight'], hint: 'Fewer than nine' }
]
```

`a` is a list of accepted answers (can also be written with `|`). Case, accents,
spaces, and punctuation do not matter, but the answer must match entirely. The
first correct answer receives `quiz.rewardPoints` points. A question lasts
`questionSeconds` seconds, a hint appears after `hintAfterSeconds`, and there is
a `betweenSeconds` pause between questions. `maxQuestions: 0` — continue until
questions run out. Questions are shuffled on every start.

---

## Event thanks

The bot thanks for:

- a new subscription and renewal (with the number of months);
- a gift subscription and mass gift;
- a raid (if viewers are at least `events.minRaidViewers`);
- bits (from `events.minCheerBits`);
- follows.

Texts are in `events.messages`, placeholders: `{user}`, `{months}`,
`{recipient}`, `{count}`, `{viewers}`, `{bits}`. Subscriptions, raids, and bits
arrive as regular Twitch messages. **Follows** arrive via EventSub: they require
logging in again via **Settings → Twitch** (or `auth-twitch.bat`) with the
`moderator:read:followers` scope. Without this scope the bot logs that EventSub
was skipped and keeps working without follow notifications.

---

## Files

```
chat-desktop/bot/
├── start.bat               launch the app and open the bot panel
├── open-panel.bat          same (for the old shortcut)
├── panel.ico               icon for the panel shortcut
├── edit-config.bat         open config.js in Notepad
├── check-config.bat        validate settings and tokens
├── auth-twitch.bat         Twitch login (legacy helper)
├── auth-youtube.bat        YouTube login (not needed now)
├── test-alert.bat          test a Telegram notification
├── config.js               ALL settings: channel, commands, timers, texts
├── src/
│   ├── index.js            app assembly and demo mode
│   ├── twitch.js           Twitch IRC (read and send)
│   ├── stream-alerts.js    Telegram stream notifications
│   ├── stream-stats.js     stream summary: peak viewers, duration, chat
│   ├── youtube.js          YouTube (disabled, kept for the future)
│   ├── engine.js           commands, permissions, cooldowns, variables
│   ├── moderation.js       spam, banned words, links, timeout and ban
│   ├── points.js           points, daily bonus, transfers, top
│   ├── giveaway.js         keyword and !join giveaways
│   ├── quiz.js             quiz with questions and rewards
│   ├── events.js           thanks for subscriptions, raids, and bits
│   ├── eventsub.js         follows via Twitch EventSub
│   ├── timers.js           timed messages
│   ├── panel.js            API for the visual editor
│   ├── config-editor.js    safe section writing into config.js
│   ├── status.js           local panel HTTP server
│   ├── web/                panel HTML, CSS, and JS (no build step)
│   ├── auth-twitch.js      Twitch device code flow
│   ├── auth-youtube.js     Google OAuth (unused)
│   └── …                   helper modules
├── test/                   tests (node --test)
└── data/
    ├── tokens.json         Twitch token (never publish!)
    ├── state.json          timer, giveaway, and strike state
    ├── points.json         viewer balances
    └── bot.log             log
```

Tokens live only on this computer. They are excluded in `.gitignore`.

---

## Relationship with the overlay

```
chat-overlay/          — chat in OBS (display only)
chat-desktop/          — in-game window + settings + this bot
chat-desktop/bot/      — bot: reads and writes Twitch
```

- The bot **does not display** messages on stream — the overlay handles that.
- The bot is started by the app and stopped with it.
- The Twitch channel and YouTube data are stored in `bot/config.js`; they are
  updated by the "Accounts & Channels" tab in the app settings. Manual editing
  is also possible via `edit-config.bat`.

---

## Troubleshooting

| Symptom | Cause and solution |
|---|---|
| Double-clicking `config.js` does nothing | expected: it is a settings file, not a program. Edit it via `edit-config.bat`; the app starts the bot |
| `Twitch: no token` | Twitch login was not completed or access expired. Open Settings → Twitch and log in again |
| `Twitch rejected the token` | the token was revoked or login was done with the wrong account. Log in again via Settings → Twitch |
| Twitch says `login_authentication_failed` | wrong Client ID or the app was deleted. Check the Client ID on the Twitch tab |
| Bot is silent on Twitch | the bot account is banned/timed out, the channel is in "subscribers-only" mode, and the bot is not a mod or follower. Make the bot a moderator |
| Moderation does not delete or time out | the bot is not a channel moderator. Give it mod rights or run the bot from the streamer's account |
| Follows are not thanked | the token is old, without `moderator:read:followers`. Log in again via Settings → Twitch |
| Points are not awarded | `points.enabled: false`, the `messageCooldownSec` cooldown has not passed, or the viewer is in `bot.ignore` |
| Giveaway does not start | another one is already running, `giveaways.enabled` is off, or the keyword contains a space |
| Quiz does not start | `quiz.questions` is empty or `quiz.enabled: false` |
| `!ds` replies with an empty link | fill in `socials.discord` in `config.js` |
| Panel did not start | port 39001 is busy. Stop the old bot on the Bot tab or change `statusPort` in `config.js` |
| Shortcut does not open the panel | run `open-panel.bat` manually. It opens the app; if Electron is not installed, reinstall the app |
| Command does not reply | check `!help`: it may be disabled, not for this platform, or on cooldown |
| Cyrillic in the console is garbled | the console is no longer needed: see `data/bot.log` or the panel |
| Telegram notifications do not arrive | check `enabled: true`, `botToken`, and `chatId`; the bot must be a channel admin. Run `test-alert.bat` and read the error |
| Stream summary did not arrive | check `offlineEnabled: true`; look for `Stream end summary not sent` in `data/bot.log`. If the bot was off during the stream, there will be no summary |
| Peak viewers is lower than real | the peak is calculated from Twitch API checks: reduce `checkIntervalSec` (for example, to 30) |
| No YouTube card in the panel | by design: YouTube is disabled, the bot works with Twitch only |

Log: `data/bot.log`. For more detail, run the app with `--debug`.

---

## Code checks

```
cd chat-desktop/bot
node --test
```

142 tests: commands, permissions, cooldowns, message trimming, timers, Twitch
login, Telegram notifications (stream start and summary), moderation and
punishments, points, giveaways, quiz, event thanks, `config.js` sync, and the
`config.js` editor (validation, backups, comment preservation).
(If npm is blocked by Windows policy, `npm test` also works.)

---

## Autostart with Windows (optional)

1. `Win + R` → `shell:startup` → Enter.
2. Put the "Chat over game" shortcut there (from the `chat-desktop` folder).

The app starts with the system and launches the bot. If there is no stream, the
bot just waits and posts nothing.

---

## Limitations

- One Twitch channel. Multiple channels would require separate configuration.
- Moderation works only while the bot is a channel moderator (or is the
  streamer's account). Checks are simple: word list, domains, caps, and message
  frequency. Disguised links and banned-word "bypasses" using symbols may slip
  through.
- Points are earned only by those who write in chat. There is no points shop —
  they can be spent on giveaway entries.
- One giveaway at a time; no scheduled repeats. The entry cost is not refunded
  on cancel.
- In the quiz, the answer must match one of the variants entirely (case and
  punctuation are ignored).
- Follows arrive via EventSub only when the bot is running and the token was
  issued again with the required scope. Follows missed while the bot was off are
  not restored.
- Twitch limits: 20 messages per 30 seconds; the bot additionally keeps a 1.6 s
  pause and a queue.
- Messages starting with `!` but addressed to another bot are still checked
  against the command list; unknown commands are silently skipped.

---

## YouTube (optional, currently disabled)

The YouTube code remains in the project, but `youtube.enabled: false` — no Google
access is required. If you ever need it:

1. In Google Cloud, enable **YouTube Data API v3**.
2. Create an **OAuth client ID** of type **Desktop app** and put the JSON in
   `data/google-oauth.json`.
3. Run `auth-youtube.bat` and log in with the channel account.
4. In `config.js`, set `youtube.enabled: true` and restart the bot
   (tray → "Restart bot").

Note: sending one YouTube message costs 20 units of daily quota (about 50
replies per day by default), and while the Google app is in **Testing** status,
you have to log in again every 7 days.
