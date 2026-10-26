'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Engine } = require('../src/engine');

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function makeConfig(extra) {
  return Object.assign({
    twitch: { channel: 'testchannel' },
    bot: {
      prefix: '!',
      globalCooldownMs: 0,
      commandCooldownMs: 0,
      userCooldownMs: 0,
      maxRepliesPerMinute: 100,
      maxReplyLength: { twitch: 480, youtube: 200 },
      ignore: ['nightbot']
    },
    replies: {
      help: 'Команды: {commands}',
      ping: 'понг',
      uptime: 'В эфире уже {uptime}',
      uptimeOffline: 'офлайн',
      uptimeUnknown: 'нет данных',
      noSocials: 'ссылок нет',
      unknown: ''
    },
    socials: { youtube: 'https://youtu.be/x', twitch: 'https://twitch.tv/x' },
    commands: [
      { name: 'lurk', aliases: ['люрк'], reply: '{user} в люрке' },
      { name: 'modonly', reply: 'мод', permission: 'mod' },
      { name: 'secret', reply: 'секрет', enabled: false },
      { name: 'long', reply: 'а'.repeat(300) }
    ]
  }, extra || {});
}

function message(overrides) {
  return Object.assign({
    platform: 'twitch',
    user: 'Вася',
    userId: '42',
    text: '!ping',
    isMod: false,
    isBroadcaster: false
  }, overrides || {});
}

function makeEngine(options) {
  const config = (options && options.config) || makeConfig();
  const sent = [];
  let clock = 100000;
  const engine = new Engine({
    config: config,
    log: silent,
    now: function () { return clock; },
    uptime: (options && options.uptime) || async function () { return { live: true, text: '2 ч 10 мин' }; },
    send: async function (platform, text, meta) {
      sent.push({ platform: platform, text: text, meta: meta });
      return { ok: true };
    }
  });
  return {
    engine: engine,
    sent: sent,
    advance: function (ms) { clock += ms; }
  };
}

test('команда и её алиас отвечают, переменные подставляются', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: '!lurk' }));
  await ctx.engine.handle(message({ text: '!ЛЮРК', user: 'Петя', userId: '7' }));

  assert.equal(ctx.sent.length, 2);
  assert.equal(ctx.sent[0].platform, 'twitch');
  assert.equal(ctx.sent[0].text, 'Вася в люрке');
  assert.equal(ctx.sent[1].text, 'Петя в люрке');
  assert.equal(ctx.sent[0].meta.command, 'lurk');
});

test('обычный текст и неизвестная команда не вызывают ответа', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: 'привет' }));
  await ctx.engine.handle(message({ text: '!неттакой' }));
  assert.equal(ctx.sent.length, 0);
});

test('ответ обрезается под лимит YouTube (200 символов)', async function () {
  const ctx = makeEngine();
  const result = await ctx.engine.handle(message({ platform: 'youtube', text: '!long' }));

  assert.equal(result.handled, true);
  assert.equal(ctx.sent.length, 1);
  assert.ok(ctx.sent[0].text.length <= 200, 'длина: ' + ctx.sent[0].text.length);
  assert.ok(ctx.sent[0].text.endsWith('…'));
});

test('permission mod: зрителю нельзя, модератору можно', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: '!modonly' }));
  assert.equal(ctx.sent.length, 0);

  const asMod = await ctx.engine.handle(message({ text: '!modonly', isMod: true }));
  assert.equal(asMod.handled, true);
  assert.equal(ctx.sent[0].text, 'мод');
});

test('выключенная команда молчит', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: '!secret' }));
  assert.equal(ctx.sent.length, 0);
});

test('кулдаун на пользователя работает', async function () {
  const config = makeConfig();
  config.bot.userCooldownMs = 10000;
  const ctx = makeEngine({ config: config });

  await ctx.engine.handle(message({ text: '!lurk' }));
  const second = await ctx.engine.handle(message({ text: '!lurk' }));
  assert.equal(second.reason, 'user-cooldown');
  assert.equal(ctx.sent.length, 1);

  ctx.advance(10001);
  await ctx.engine.handle(message({ text: '!lurk' }));
  assert.equal(ctx.sent.length, 2);
});

test('лимит ответов в минуту соблюдается', async function () {
  const config = makeConfig();
  config.bot.maxRepliesPerMinute = 2;
  const ctx = makeEngine({ config: config });

  await ctx.engine.handle(message({ text: '!ping' }));
  await ctx.engine.handle(message({ text: '!social' }));
  const third = await ctx.engine.handle(message({ text: '!youtube' }));
  assert.equal(third.reason, 'minute-limit');
  assert.equal(ctx.sent.length, 2);
});

test('боты из ignore-списка игнорируются', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: '!ping', user: 'Nightbot', userId: '1' }));
  assert.equal(ctx.sent.length, 0);
});

test('help скрывает мод-команды от зрителей и показывает их модератору', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: '!help' }));
  const viewerHelp = ctx.sent[0].text;

  assert.match(viewerHelp, /!ping/);
  assert.match(viewerHelp, /!lurk/);
  assert.doesNotMatch(viewerHelp, /!modonly/);
  assert.doesNotMatch(viewerHelp, /!secret/);

  const modCtx = makeEngine();
  await modCtx.engine.handle(message({ text: '!help', isMod: true }));
  assert.match(modCtx.sent[0].text, /!modonly/);
});

test('!social собирает только заполненные ссылки', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: '!social' }));
  assert.equal(ctx.sent[0].text, 'YouTube: https://youtu.be/x · Twitch: https://twitch.tv/x');
});

test('!uptime берёт данные у провайдера', async function () {
  const ctx = makeEngine();
  await ctx.engine.handle(message({ text: '!uptime' }));
  assert.equal(ctx.sent[0].text, 'В эфире уже 2 ч 10 мин');
});

test('!uptime без доступа к API отвечает отдельным текстом', async function () {
  const ctx = makeEngine({ uptime: async function () { return { live: false, unknown: true }; } });
  await ctx.engine.handle(message({ text: '!uptime' }));
  assert.equal(ctx.sent[0].text, 'нет данных');
});

test('платформенный фильтр не даёт отвечать не туда', async function () {
  const config = makeConfig();
  config.commands.push({ name: 'twonly', reply: 'только твич', platforms: ['twitch'] });
  const ctx = makeEngine({ config: config });

  const result = await ctx.engine.handle(message({ platform: 'youtube', text: '!twonly' }));
  assert.equal(result.reason, 'platform');
  assert.equal(ctx.sent.length, 0);
});
