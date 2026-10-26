'use strict';

// Точка входа: собирает Twitch, команды, автосообщения и панель.
// YouTube-часть осталась в коде, но по умолчанию выключена в config.js.

const { loadConfig } = require('./config');
const { readJson, writeJson } = require('./fsutil');
const log = require('./log');
const { TokenStore } = require('./tokens');
const { GoogleAuth } = require('./google');
const { TwitchApi } = require('./twitch-api');
const { TwitchChat } = require('./twitch');
const { YouTubeChat } = require('./youtube');
const { Engine, humanDuration } = require('./engine');
const { Timers } = require('./timers');
const { createPanel } = require('./panel');
const { startStatusServer } = require('./status');
const { StreamAlerts } = require('./stream-alerts');
const { StreamStats } = require('./stream-stats');
const { Moderation } = require('./moderation');
const { Points } = require('./points');
const { Giveaway } = require('./giveaway');
const { Quiz } = require('./quiz');
const { Events } = require('./events');
const { EventSub } = require('./eventsub');

// Сколько прошедших стримов хранить в data/state.json.
const STREAM_HISTORY_LIMIT = 20;

function parseArgs(argv) {
  const args = {
    demo: false,
    dry: false,
    verbose: false,
    config: null,
    twitch: true,
    youtube: true
  };

  argv.forEach(function (raw) {
    if (raw === '--demo') args.demo = true;
    else if (raw === '--dry') args.dry = true;
    else if (raw === '--verbose' || raw === '--debug') args.verbose = true;
    else if (raw === '--no-twitch') args.twitch = false;
    else if (raw === '--no-youtube') args.youtube = false;
    else if (raw.startsWith('--config=')) args.config = raw.slice('--config='.length);
  });

  return args;
}

function printBanner(config, args) {
  console.log('');
  console.log('  Чат-бот для стримов');
  console.log('  Twitch:  #' + (config.twitch.channel || '—'));
  console.log('  YouTube: ' + (config.youtube.enabled
    ? (config.youtube.channelId || config.youtube.videoId || '—')
    : 'выключен (бот только для Twitch)'));
  if (args.demo) console.log('  Режим:   ДЕМО (без подключений)');
  if (args.dry) console.log('  Режим:   DRY-RUN (ничего не отправляет)');
  console.log('');
}

async function runDemo(config, args) {
  printBanner(config, args);
  log.init(config.paths.log, { debug: args.verbose });
  log.info('Демо-режим: реальные подключения выключены.');

  const startedAt = Date.now();
  const feed = [];
  const counters = { messages: 0, replies: 0 };
  let timers = null;

  function pushFeed(dir, platform, user, text) {
    feed.push({
      dir: dir,
      platform: platform,
      user: user,
      text: text,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    if (feed.length > 60) feed.splice(0, feed.length - 60);
  }

  async function send(platform, text) {
    counters.replies += 1;
    pushFeed('out', platform, 'бот', text);
    log.info('→ ' + platform + ': ' + text);
    return { ok: true, dry: true };
  }

  const engine = new Engine({
    config: config,
    send: send,
    log: log.child('engine'),
    uptime: async function () {
      const ms = 83 * 60000;
      return { live: true, ms: ms, text: humanDuration(ms) };
    }
  });

  timers = new Timers({
    config: config,
    send: send,
    render: function (text, platform) {
      return engine.renderText(text, { platform: platform, user: '' });
    },
    log: log.child('timers'),
    saved: {}
  });
  timers.start();

  const panel = createPanel({
    config: config,
    engine: engine,
    timers: timers,
    log: log.child('panel')
  });

  const status = startStatusServer({
    port: 39001,
    log: log.child('panel'),
    panel: panel,
    onShutdown: function () { shutdown(); },
    getSnapshot: function () {
      return {
        now: Date.now(),
        startedAt: startedAt,
        uptimeText: humanDuration(Date.now() - startedAt),
        twitch: {
          status: 'online',
          channel: config.twitch.channel,
          bot: 'demo_bot',
          readOnly: false,
          sent: counters.replies
        },
        youtube: {
          mode: 'off',
          status: 'off',
          chat: '',
          error: '',
          sent: 0,
          quota: { date: '', units: 0, allBudget: 0, replyUnits: 0, replyBudget: 0, replies: 0 }
        },
        counters: counters,
        timers: timers.snapshot(),
        feed: feed.slice()
      };
    }
  });

  const script = [
    { platform: 'twitch', user: 'nordwind', text: '!help' },
    { platform: 'twitch', user: 'Аня', text: '!social' },
    { platform: 'twitch', user: 'kisa', text: '!uptime' },
    { platform: 'twitch', user: 'Иван', text: '!lurk' },
    { platform: 'twitch', user: 'moderator', text: '!hug', isMod: true },
    { platform: 'twitch', user: 'гость', text: '!неттакой' },
    { platform: 'twitch', user: 'Nick', text: '!ping' },
    { platform: 'twitch', user: 'nordwind', text: 'привет всем' }
  ];

  let index = 0;
  const timer = setInterval(function () {
    const item = script[index % script.length];
    index += 1;
    counters.messages += 1;
    timers.noteActivity();
    pushFeed('in', item.platform, item.user, item.text);
    log.info('[' + (item.platform === 'twitch' ? 'tw' : 'yt') + '] ' + item.user + ': ' + item.text);
    engine.handle({
      platform: item.platform,
      user: item.user,
      userId: item.user,
      text: item.text,
      isMod: !!item.isMod,
      isBroadcaster: false
    }).catch(function (error) {
      log.error('Демо:', error.message);
    });
  }, 4000);
  if (timer.unref) timer.unref();

  console.log('Демо идёт. Панель: http://127.0.0.1:39001 · Ctrl+C — выход.');
  console.log('');

  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    timers.stop();
    await status.close();
    log.info('Демо остановлено.');
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function runBot(config, args) {
  printBanner(config, args);

  const statusPort = Number(config.statusPort) || 39001;

  // Защита от второго экземпляра: два бота отвечали бы в чат дважды.
  try {
    const health = await fetch('http://127.0.0.1:' + statusPort + '/health', {
      signal: AbortSignal.timeout(1500)
    });
    if (health.ok) {
      log.error('Бот уже запущен (панель на порту ' + statusPort + ' отвечает).');
      log.error('Закрой старое окно или смени statusPort в config.js.');
      process.exit(1);
      return;
    }
  } catch (error) { /* порт свободен — это нормально */ }

  const state = readJson(config.paths.state, {}) || {};
  const store = new TokenStore(config.paths.tokens, log.child('tokens'));
  const google = new GoogleAuth({
    store: store,
    credentialsFile: config.paths.google,
    log: log.child('google')
  });
  const twitchApi = new TwitchApi({
    clientId: config.twitch.clientId,
    clientSecret: config.twitch.clientSecret,
    store: store,
    log: log.child('twitch-api')
  });

  const startedAt = Date.now();
  const feed = [];
  const counters = { messages: 0, replies: 0 };

  // История прошедших стримов: пик зрителей, длительность, активность чата.
  if (!Array.isArray(state.streamHistory)) state.streamHistory = [];

  function onStreamEnd(entry) {
    state.streamHistory.push(entry);
    state.streamHistory = state.streamHistory.slice(-STREAM_HISTORY_LIMIT);
    writeJson(config.paths.state, state);
    log.info('История стримов: ' + entry.durationMs + ' мс, пик ' + entry.peak +
      ', сообщений ' + (entry.chat && entry.chat.messages));
  }

  // Счётчики для справки об итогах стрима: бот наполняет их по ходу эфира,
  // а StreamAlerts запрашивает сводку, когда Twitch сообщает об окончании.
  // Создаётся без moderation — модерация появляется ниже (TDZ).
  const streamStats = new StreamStats({
    counters: counters,
    settings: config.streamAlerts
  });

  const streamAlerts = new StreamAlerts({
    config: config,
    twitchApi: twitchApi,
    state: state,
    stats: streamStats,
    onStreamEnd: onStreamEnd,
    log: log.child('alerts'),
    onSave: function () { writeJson(config.paths.state, state); }
  });

  function pushFeed(dir, platform, user, text) {
    feed.push({
      dir: dir,
      platform: platform,
      user: user,
      text: text,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    });
    if (feed.length > 60) feed.splice(0, feed.length - 60);
  }

  const youtubeChat = (config.youtube.enabled && args.youtube)
    ? new YouTubeChat({
      config: config,
      store: store,
      google: google,
      quotaFile: config.paths.quota,
      log: log.child('youtube'),
      dry: args.dry
    })
    : null;

  const twitchChat = new TwitchChat({
    channel: config.twitch.channel,
    clientId: config.twitch.clientId,
    clientSecret: config.twitch.clientSecret,
    botUsername: config.twitch.botUsername,
    store: store,
    log: log.child('twitch')
  });

  async function send(platform, text) {
    const clean = String(text || '').trim();
    if (!clean) return { ok: false, reason: 'empty' };

    if (args.dry) {
      counters.replies += 1;
      streamStats.noteReply(platform);
      pushFeed('out', platform, 'бот', clean);
      log.info('[dry] ' + platform + ': ' + clean);
      return { ok: true, dry: true };
    }

    let result;
    if (platform === 'twitch') {
      result = { ok: twitchChat.say(clean) };
    } else if (platform === 'youtube' && youtubeChat) {
      result = await youtubeChat.say(clean);
    } else {
      result = { ok: false, reason: 'platform-off' };
    }

    if (result.ok) {
      counters.replies += 1;
      streamStats.noteReply(platform);
      pushFeed('out', platform, 'бот', clean);
      log.info('→ ' + platform + ': ' + clean);
    } else {
      const quiet = ['not-live', 'no-token', 'reply-budget', 'quota'];
      if (quiet.indexOf(result.reason) === -1) {
        log.warn('Не отправлено в ' + platform + ': ' + (result.reason || 'unknown') +
          (result.error ? ' — ' + result.error : ''));
      }
    }

    return result;
  }

  async function uptimeProvider() {
    if (!store.twitch) return { live: false, unknown: true };
    const stream = await twitchApi.getStream(config.twitch.channel);
    if (stream.live) {
      const ms = Date.now() - (stream.startedAt || Date.now());
      return {
        live: true,
        ms: ms,
        text: humanDuration(ms),
        game: stream.game || '',
        title: stream.title || '',
        viewers: stream.viewers || 0
      };
    }
    if (stream.unknown) return { live: false, unknown: true };
    return { live: false };
  }

  const points = new Points({
    file: config.paths.points,
    config: config,
    log: log.child('points'),
    now: Date.now
  });

  const giveaway = new Giveaway({
    config: config,
    log: log.child('giveaway'),
    points: points,
    send: function (text) { return send('twitch', text); },
    state: state,
    onSave: function () { writeJson(config.paths.state, state); }
  });

  const quiz = new Quiz({
    config: config,
    log: log.child('quiz'),
    points: points,
    send: function (text) { return send('twitch', text); }
  });

  const events = new Events({
    config: config,
    log: log.child('events'),
    send: function (text) { return send('twitch', text); }
  });

  const moderation = new Moderation({
    config: config,
    log: log.child('moderation'),
    state: state,
    onSave: function () { writeJson(config.paths.state, state); },
    actions: {
      deleteMessage: function (messageId) {
        if (args.dry) {
          log.info('[dry] модерация: удалить сообщение ' + messageId);
          return;
        }
        twitchChat.deleteMessage(messageId);
      },
      timeout: function (login, seconds, reason) {
        if (args.dry) {
          log.info('[dry] модерация: мут ' + login + ' на ' + seconds + ' с');
          return;
        }
        twitchChat.timeout(login, seconds, reason);
      },
      ban: function (login, reason) {
        if (args.dry) {
          log.info('[dry] модерация: бан ' + login);
          return;
        }
        twitchChat.ban(login, reason);
      },
      unban: function (login) {
        if (args.dry) {
          log.info('[dry] модерация: разбан ' + login);
          return;
        }
        twitchChat.unban(login);
      },
      reply: function (text) {
        send('twitch', text).catch(function () {});
      }
    }
  });

  // Теперь модерация есть — справка об итогах возьмёт из неё статистику.
  streamStats.moderation = moderation;

  // Панель показывает нормализованные настройки со всеми значениями по умолчанию.
  config.moderation = moderation.settings;
  config.points = points.settings;
  config.giveaways = giveaway.settings;
  config.quiz = quiz.settings;
  config.events = events.settings;

  const engine = new Engine({
    config: config,
    send: send,
    log: log.child('engine'),
    uptime: uptimeProvider,
    services: {
      points: points,
      giveaway: giveaway,
      quiz: quiz,
      moderation: moderation,
      events: events
    }
  });

  const timers = new Timers({
    config: config,
    send: send,
    render: function (text, platform) {
      return engine.renderText(text, { platform: platform, user: '' });
    },
    log: log.child('timers'),
    saved: state.timers || {},
    onSave: function (timersState) {
      state.timers = timersState;
      writeJson(config.paths.state, state);
    }
  });

  function onMessage(message) {
    counters.messages += 1;
    streamStats.noteMessage(message);
    timers.noteActivity();
    pushFeed('in', message.platform, message.user, message.text);
    log.info('[' + (message.platform === 'twitch' ? 'tw' : 'yt') + '] ' +
      message.user + ': ' + message.text);

    // Если платформа не умеет писать (нет токена) — только показываем в ленте.
    const writable = message.platform === 'twitch'
      ? !twitchChat.readOnly
      : !!(youtubeChat && store.google);
    if (!writable) return;

    if (message.platform === 'twitch') {
      const verdict = moderation.handle(message);
      if (verdict.action !== 'none') {
        streamStats.noteModeration();
        pushFeed('out', 'twitch', 'модерация',
          verdict.action + ' · ' + (message.user || message.login) + ' · ' + verdict.reason);
        return;
      }

      if (message.bits) events.handleCheer(message);
      points.noteMessage(message);

      if (quiz.check(message)) return;
      if (giveaway.noteMessage(message)) return;
    }

    engine.handle(message).catch(function (error) {
      log.error('Команда:', error.message);
    });
  }

  twitchChat.on('message', onMessage);
  if (youtubeChat) youtubeChat.on('message', onMessage);
  twitchChat.on('usernotice', function (notice) {
    events.handleUserNotice(notice);
  });

  const eventSub = new EventSub({
    clientId: config.twitch.clientId,
    clientSecret: config.twitch.clientSecret,
    store: store,
    channel: config.twitch.channel,
    log: log.child('eventsub'),
    enabled: config.events.enabled !== false,
    onEvent: function (type, data) {
      if (type === 'follow') events.handleFollow(data);
    }
  });

  if (!config.twitch.clientId) {
    log.warn('Twitch: не задан twitch.clientId — отправка недоступна.');
    log.warn('Заполни twitch.clientId в config.js (edit-config.bat) и запусти auth-twitch.bat.');
  }
  if (!store.twitch) {
    log.warn('Twitch: нет токена — бот только читает. Запусти auth-twitch.bat.');
  }
  if (youtubeChat && !store.google) {
    log.warn('YouTube: нет токена — бот только читает. Запусти auth-youtube.bat.');
  }
  if (youtubeChat && !config.youtube.apiKey) {
    log.warn('YouTube: не задан youtube.apiKey — чтение без ретранслятора не работает.');
  }

  const panel = createPanel({
    config: config,
    engine: engine,
    timers: timers,
    moderation: moderation,
    points: points,
    giveaway: giveaway,
    quiz: quiz,
    events: events,
    log: log.child('panel')
  });

  const status = startStatusServer({
    port: statusPort,
    log: log.child('panel'),
    panel: panel,
    onShutdown: function () { shutdown(); },
    getSnapshot: function () {
      return {
        now: Date.now(),
        startedAt: startedAt,
        uptimeText: humanDuration(Date.now() - startedAt),
        twitch: {
          status: twitchChat.status,
          channel: config.twitch.channel,
          bot: twitchChat.botLogin,
          readOnly: twitchChat.readOnly,
          sent: twitchChat.stats.sent
        },
        youtube: youtubeChat ? youtubeChat.snapshot() : {
          mode: 'off',
          status: 'off',
          chat: '',
          error: '',
          sent: 0,
          quota: { date: '', units: 0, allBudget: 0, replyUnits: 0, replyBudget: 0, replies: 0 }
        },
        counters: counters,
        timers: timers.snapshot(),
        alerts: streamAlerts.snapshot(),
        streams: (state.streamHistory || []).slice(-5).reverse(),
        moderation: moderation.snapshot(),
        points: points.snapshot(),
        giveaway: giveaway.snapshot(),
        quiz: quiz.snapshot(),
        events: events.snapshot(),
        eventsub: eventSub.snapshot(),
        feed: feed.slice()
      };
    }
  });

  if (args.twitch) twitchChat.start();
  if (youtubeChat) youtubeChat.start();
  timers.start();
  if (!args.dry) streamAlerts.start();
  if (!args.dry) eventSub.start().catch(function (error) {
    log.warn('EventSub не запустился: ' + error.message);
  });

  const servicesTimer = setInterval(function () {
    giveaway.tick();
    quiz.tick();
    moderation.cleanStrikes(Date.now());
    points.maybeSave();
  }, 2000);
  if (servicesTimer.unref) servicesTimer.unref();

  console.log('Бот запущен. Панель: http://127.0.0.1:' + statusPort + ' · Ctrl+C — выход.');
  console.log('');

  let closing = false;
  async function shutdown() {
    if (closing) return;
    closing = true;
    log.info('Останавливаюсь…');
    clearInterval(servicesTimer);
    timers.stop();
    twitchChat.stop();
    if (youtubeChat) youtubeChat.stop();
    streamAlerts.stop();
    eventSub.stop();
    points.flush();
    state.timers = timers.exportState();
    writeJson(config.paths.state, state);
    try { await status.close(); } catch (error) { /* ignore */ }
    setTimeout(function () { process.exit(0); }, 200);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let config;
  try {
    config = loadConfig({ file: args.config });
  } catch (error) {
    console.error('');
    console.error(error.message);
    console.error('');
    process.exit(1);
    return;
  }

  log.init(config.paths.log, { debug: args.verbose });

  if (config.problems.length) {
    config.problems.forEach(function (problem) {
      log.warn('Настройки: ' + problem);
    });
  }

  if (args.demo) {
    await runDemo(config, args);
  } else {
    await runBot(config, args);
  }
}

process.on('uncaughtException', function (error) {
  log.error('Необработанная ошибка:', error && error.stack ? error.stack : String(error));
});

process.on('unhandledRejection', function (error) {
  log.error('Необработанный Promise:', error && error.stack ? error.stack : String(error));
});

main().catch(function (error) {
  log.error('Старт не удался:', error && error.stack ? error.stack : String(error));
  process.exit(1);
});
