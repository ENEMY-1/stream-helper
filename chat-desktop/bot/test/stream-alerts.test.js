'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { StreamAlerts } = require('../src/stream-alerts');
const { StreamStats } = require('../src/stream-stats');

const silent = { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };

function fakeFetch(responses) {
  const calls = [];
  async function fetchImpl(url, options) {
    calls.push({ url: url, body: JSON.parse(options.body || '{}') });
    const next = responses.shift() || { ok: true };
    const body = next.body || { ok: next.ok !== false, result: {} };
    return {
      ok: next.ok !== false,
      status: next.status || 200,
      text: async function () { return JSON.stringify(body); }
    };
  }
  fetchImpl.calls = calls;
  return fetchImpl;
}

function fakeApi(results) {
  let index = 0;
  return {
    getStream: async function () {
      const value = results[Math.min(index, results.length - 1)];
      index += 1;
      return value;
    }
  };
}

function makeAlerts(options) {
  const opts = options || {};
  const settings = Object.assign({
    enabled: true,
    offlineEnabled: true,
    checkIntervalSec: 60,
    maxStartAgeMinutes: 0,
    silent: false,
    sendPreview: false,
    message: '',
    offlineMessage: '',
    telegram: { botToken: '123:test', chatId: '@test_channel', messageThreadId: '' }
  }, opts.settings || {});

  const state = opts.state || {};
  const saves = [];
  const ended = [];
  const stats = opts.noStats ? null : new StreamStats({ moderation: opts.moderation });
  const alerts = new StreamAlerts({
    config: { twitch: { channel: 'demo_channel' }, streamAlerts: settings },
    twitchApi: opts.api,
    state: state,
    stats: stats,
    log: silent,
    fetch: opts.fetch,
    onStreamEnd: function (entry) { ended.push(entry); },
    onSave: function () { saves.push(JSON.parse(JSON.stringify(state.streamAlerts))); }
  });

  return { alerts: alerts, state: state, saves: saves, stats: stats, ended: ended };
}

function live(overrides) {
  return Object.assign({
    live: true,
    startedAt: 1000,
    title: 'Играем',
    game: 'Just Chatting',
    viewers: 1234,
    userName: 'demo_channel',
    thumbnail: ''
  }, overrides || {});
}

test('выключенные уведомления ничего не отправляют', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live()]),
    fetch: fetchImpl,
    settings: { enabled: false }
  });

  assert.equal(ctx.alerts.start(), false);
  const result = await ctx.alerts.checkOnce();

  assert.equal(result.skipped, 'disabled');
  assert.equal(fetchImpl.calls.length, 0);
});

test('отправляет при переходе offline → live и не дублирует', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({ api: fakeApi([live()]), fetch: fetchImpl });

  const first = await ctx.alerts.checkOnce();
  assert.equal(first.sent, true);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(ctx.state.streamAlerts.twitch.live, true);
  assert.equal(ctx.state.streamAlerts.twitch.startedAt, 1000);
  assert.equal(ctx.state.streamAlerts.sent, 1);

  const second = await ctx.alerts.checkOnce();
  assert.equal(second.skipped, 'already-notified');
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(ctx.saves.length, 1);
});

test('шлёт новое уведомление после офлайна и нового стрима', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([
      live({ startedAt: 1000 }),
      { live: false },
      live({ startedAt: 5000 })
    ]),
    fetch: fetchImpl
  });

  await ctx.alerts.checkOnce();
  const offline = await ctx.alerts.checkOnce();
  assert.equal(offline.live, false);
  assert.equal(ctx.state.streamAlerts.twitch.live, false);

  await ctx.alerts.checkOnce();
  assert.equal(fetchImpl.calls.length, 3);
  assert.equal(ctx.state.streamAlerts.twitch.startedAt, 5000);
  assert.equal(ctx.state.streamAlerts.sent, 2);
});

test('ошибка Twitch не сбрасывает состояние и не шлёт повторно', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([
      live(),
      { live: false, unknown: true },
      live()
    ]),
    fetch: fetchImpl
  });

  await ctx.alerts.checkOnce();
  const unknown = await ctx.alerts.checkOnce();
  assert.equal(unknown.skipped, 'unknown');

  const again = await ctx.alerts.checkOnce();
  assert.equal(again.skipped, 'already-notified');
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(ctx.state.streamAlerts.twitch.live, true);
});

test('не дублирует уведомление после перезапуска бота', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live()]),
    fetch: fetchImpl,
    state: { streamAlerts: { twitch: { live: true, startedAt: 1000, notifiedAt: 2000 }, sent: 1 } }
  });

  const result = await ctx.alerts.checkOnce();

  assert.equal(result.skipped, 'already-notified');
  assert.equal(fetchImpl.calls.length, 0);
});

test('не шлёт старый стрим, если задан maxStartAgeMinutes', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live({ startedAt: Date.now() - 60 * 60000 })]),
    fetch: fetchImpl,
    settings: { maxStartAgeMinutes: 15 }
  });

  const result = await ctx.alerts.checkOnce();

  assert.equal(result.skipped, 'too-old');
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(ctx.state.streamAlerts.twitch.live, true);
  assert.equal(ctx.state.streamAlerts.sent, 0);
});

test('при ошибке отправки состояние не меняется, следующий раз пробует снова', async function () {
  const fetchImpl = fakeFetch([
    { ok: false, status: 400, body: { ok: false, description: 'Bad Request: chat not found' } }
  ]);
  const ctx = makeAlerts({ api: fakeApi([live()]), fetch: fetchImpl });

  const failed = await ctx.alerts.checkOnce();
  assert.equal(failed.sent, false);
  assert.match(failed.error, /chat not found/);
  assert.equal(ctx.state.streamAlerts.twitch, null);
  assert.match(ctx.alerts.lastError, /chat not found/);

  const retried = await ctx.alerts.checkOnce();
  assert.equal(retried.sent, true);
  assert.equal(fetchImpl.calls.length, 2);
  assert.equal(ctx.state.streamAlerts.sent, 1);
});

test('если фото не отправилось — отправляет текст', async function () {
  const fetchImpl = fakeFetch([
    { ok: false, status: 400, body: { ok: false, description: 'wrong file identifier' } }
  ]);
  const ctx = makeAlerts({
    api: fakeApi([live({ thumbnail: 'https://example.com/preview_{width}x{height}.jpg' })]),
    fetch: fetchImpl,
    settings: { sendPreview: true }
  });

  const result = await ctx.alerts.checkOnce();

  assert.equal(result.sent, true);
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[0].url, /\/sendPhoto$/);
  assert.equal(fetchImpl.calls[0].body.photo, 'https://example.com/preview_1280x720.jpg');
  assert.match(fetchImpl.calls[1].url, /\/sendMessage$/);
  assert.equal(ctx.state.streamAlerts.sent, 1);
});

test('сообщение экранирует HTML и подставляет данные стрима', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live({ title: 'Стрим <b>&</b>', game: 'Dota 2', viewers: 1234 })]),
    fetch: fetchImpl,
    settings: { message: '{channel} | {game} | {title} | {viewers} | {url}' }
  });

  await ctx.alerts.checkOnce();

  const body = fetchImpl.calls[0].body;
  assert.equal(body.parse_mode, 'HTML');
  assert.equal(body.chat_id, '@test_channel');
  assert.equal(body.text,
    'demo_channel | Dota 2 | Стрим &lt;b&gt;&amp;&lt;/b&gt; | 1\u00a0234 | https://twitch.tv/demo_channel');
  assert.equal(body.reply_markup.inline_keyboard[0][0].url, 'https://twitch.tv/demo_channel');
});

test('ссылка на YouTube из канала превращается в /live и попадает в текст и кнопку', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live()]),
    fetch: fetchImpl,
    settings: { youtube: 'https://youtube.com/@demo_channel' }
  });

  await ctx.alerts.checkOnce();

  const body = fetchImpl.calls[0].body;
  assert.match(body.text, /YouTube: https:\/\/youtube\.com\/@demo_channel\/live/);
  assert.equal(body.reply_markup.inline_keyboard[0].length, 2);
  assert.deepEqual(body.reply_markup.inline_keyboard[0][1], {
    text: '📺 YouTube',
    url: 'https://youtube.com/@demo_channel/live'
  });
});

test('готовая ссылка на видео не дополняется /live', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live()]),
    fetch: fetchImpl,
    settings: {
      youtube: 'https://www.youtube.com/watch?v=abc123',
      message: '{url}\n{youtube}'
    }
  });

  await ctx.alerts.checkOnce();

  const body = fetchImpl.calls[0].body;
  assert.equal(body.text,
    'https://twitch.tv/demo_channel\nhttps://www.youtube.com/watch?v=abc123');
  assert.equal(body.reply_markup.inline_keyboard[0][1].url,
    'https://www.youtube.com/watch?v=abc123');
});

test('без youtube в настройках строка и кнопка YouTube не появляются', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live()]),
    fetch: fetchImpl,
    settings: { message: 'Текст\n📺 YouTube: {youtube}' }
  });

  await ctx.alerts.checkOnce();

  const body = fetchImpl.calls[0].body;
  assert.equal(body.text, 'Текст');
  assert.equal(body.reply_markup.inline_keyboard[0].length, 1);
});

test('link_preview_options и тема сообщения передаются в Telegram', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live()]),
    fetch: fetchImpl,
    settings: {
      silent: true,
      telegram: { botToken: '123:test', chatId: '-100123', messageThreadId: '42' }
    }
  });

  await ctx.alerts.checkOnce();

  const body = fetchImpl.calls[0].body;
  assert.equal(body.disable_notification, true);
  assert.equal(body.message_thread_id, 42);
  assert.deepEqual(body.link_preview_options, { is_disabled: true });
});

// --- справка о завершении стрима ---------------------------------------

test('собирает пик зрителей и шлёт справку после окончания стрима', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([
      live({ viewers: 40 }),
      live({ viewers: 150 }),
      live({ viewers: 90 }),
      { live: false }
    ]),
    fetch: fetchImpl
  });

  await ctx.alerts.checkOnce();
  await ctx.alerts.checkOnce();
  await ctx.alerts.checkOnce();
  const result = await ctx.alerts.checkOnce();

  assert.equal(result.live, false);
  assert.ok(result.ended, 'у результата есть справка');
  assert.equal(result.ended.peak, 150);
  assert.equal(result.ended.average, Math.round((40 + 150 + 90) / 3));
  assert.equal(result.ended.notified, true);

  // 1 — начало стрима, 2 — справка об итогах
  assert.equal(fetchImpl.calls.length, 2);
  assert.match(fetchImpl.calls[1].url, /\/sendMessage$/);
  const text = fetchImpl.calls[1].body.text;
  assert.match(text, /стрим закончился/);
  assert.match(text, /Пик зрителей: 150|Пик зрителей: 93/);
  assert.match(text, /Длительность/);

  assert.equal(ctx.state.streamAlerts.ended, 1);
  assert.equal(ctx.state.streamAlerts.history.length, 1);
  assert.equal(ctx.ended.length, 1);
  assert.equal(ctx.ended[0].peak, 150);
});

test('справка учитывает активность чата и модерации', async function () {
  const fetchImpl = fakeFetch([]);
  const stats = new StreamStats({
    moderation: { snapshot: function () { return { stats: { total: 4 } }; } }
  });
  const state = {};
  const alerts = new StreamAlerts({
    config: {
      twitch: { channel: 'demo_channel' },
      streamAlerts: {
        enabled: true,
        offlineEnabled: true,
        message: '',
        offlineMessage: '{messages} сообщений, {replies} ответов, {commands} команд, {moderation} наказаний',
        telegram: { botToken: '123:test', chatId: '@test_channel', messageThreadId: '' }
      }
    },
    twitchApi: fakeApi([live({ viewers: 10 }), { live: false }]),
    state: state,
    stats: stats,
    log: silent,
    fetch: fetchImpl,
    onSave: function () {}
  });

  await alerts.checkOnce();
  stats.noteMessage({ text: 'привет' });
  stats.noteMessage({ text: '!help' });
  stats.noteReply('twitch');
  await alerts.checkOnce();

  const text = fetchImpl.calls[1].body.text;
  assert.equal(text, '2 сообщений, 1 ответов, 1 команд, 4 наказаний');
  assert.equal(stats.noteMessage({ text: 'поздно' }), undefined);
  assert.equal(stats.state, null);
});

test('offlineEnabled: false — справка не отправляется, но попадает в историю', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live({ viewers: 55 }), { live: false }]),
    fetch: fetchImpl,
    settings: { offlineEnabled: false }
  });

  await ctx.alerts.checkOnce();
  const result = await ctx.alerts.checkOnce();

  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(result.ended.notified, false);
  assert.equal(result.ended.peak, 55);
  assert.equal(ctx.state.streamAlerts.history.length, 1);
  assert.equal(ctx.ended.length, 1);
});

test('ошибка отправки справки не теряет историю стрима', async function () {
  const fetchImpl = fakeFetch([
    { ok: true },
    { ok: false, status: 403, body: { ok: false, description: 'Forbidden: bot was blocked' } }
  ]);
  const ctx = makeAlerts({
    api: fakeApi([live({ viewers: 7 }), { live: false }]),
    fetch: fetchImpl
  });

  await ctx.alerts.checkOnce();
  const result = await ctx.alerts.checkOnce();

  assert.equal(result.ended.notified, false);
  assert.match(result.ended.error, /blocked/);
  assert.match(ctx.alerts.lastOfflineError, /blocked/);
  assert.equal(ctx.state.streamAlerts.history.length, 1);
  assert.equal(ctx.state.streamAlerts.ended || 0, 0);
});

test('старый потерянный стрим не считается и справка не шлётся', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live({ viewers: 10 }), { live: false }]),
    fetch: fetchImpl
  });

  await ctx.alerts.checkOnce();
  // Эмулируем, что бот долго не проверял стрим (больше 15 минут).
  ctx.stats.state.lastSeenAt = Date.now() - 20 * 60000;

  const result = await ctx.alerts.checkOnce();

  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(result.ended, undefined);
  assert.equal(ctx.state.streamAlerts.history.length, 0);
  assert.equal(ctx.ended.length, 0);
});

test('без StreamStats уведомления работают как раньше', async function () {
  const fetchImpl = fakeFetch([]);
  const ctx = makeAlerts({
    api: fakeApi([live()]),
    fetch: fetchImpl,
    noStats: true
  });

  const result = await ctx.alerts.checkOnce();
  assert.equal(result.sent, true);
  assert.equal(fetchImpl.calls.length, 1);
});
