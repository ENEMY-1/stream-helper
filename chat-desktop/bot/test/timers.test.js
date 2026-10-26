'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Timers } = require('../src/timers');

const silent = { debug() {}, info() {}, warn() {}, error() {} };

function makeTimers(overrides) {
  const sent = [];
  let clock = 0;
  const config = Object.assign({
    bot: { activityWindowMinutes: 10 },
    timersSettings: { minGapMs: 0 },
    timers: [
      { id: 't1', text: 'привет {platform}', everyMinutes: 1, platforms: ['twitch'] }
    ]
  }, overrides || {});

  const timers = new Timers({
    config: config,
    send: async function (platform, text) { sent.push({ platform: platform, text: text }); },
    render: async function (text, platform) { return text.replace('{platform}', platform); },
    log: silent,
    now: function () { return clock; },
    saved: {}
  });

  return {
    timers: timers,
    sent: sent,
    advance: function (ms) { clock += ms; },
    now: function () { return clock; }
  };
}

test('первое автосообщение ждёт полный интервал', function () {
  const ctx = makeTimers();
  assert.equal(ctx.timers.tick(0).length, 0);
  assert.equal(ctx.timers.tick(59999).length, 0);
});

test('без активности в чате автосообщение не отправляется', function () {
  const ctx = makeTimers();
  ctx.timers.timers[0].nextAt = 1000;
  const fired = ctx.timers.tick(1000);
  assert.equal(fired.length, 0);
  assert.equal(ctx.timers.timers[0].nextAt, 61000);
});

test('при активности отправляет и сдвигает следующий раз', async function () {
  const ctx = makeTimers();
  ctx.timers.timers[0].nextAt = 1000;
  ctx.timers.noteActivity(1000);

  const fired = ctx.timers.tick(1000);
  assert.equal(fired.length, 1);
  assert.equal(ctx.timers.timers[0].nextAt, 61000);

  await new Promise(function (resolve) { setTimeout(resolve, 20); });
  assert.deepEqual(ctx.sent, [{ platform: 'twitch', text: 'привет twitch' }]);
});

test('общая пауза между автосообщениями соблюдается', async function () {
  const overrides = {
    timersSettings: { minGapMs: 120000 },
    timers: [
      { id: 'a', text: 'раз', everyMinutes: 1, platforms: ['twitch'] },
      { id: 'b', text: 'два', everyMinutes: 1, platforms: ['twitch'] }
    ]
  };
  const ctx = makeTimers(overrides);
  ctx.timers.noteActivity(1);
  ctx.timers.timers[0].nextAt = 1000;
  ctx.timers.timers[1].nextAt = 1000;

  const first = ctx.timers.tick(1000);
  assert.equal(first.length, 1);
  assert.equal(ctx.timers.lastSentAt, 1000);

  // Второй таймер ждёт паузу, его срок не сдвигается.
  assert.equal(ctx.timers.timers[1].nextAt, 1000);
  assert.equal(ctx.timers.tick(50000).length, 0);
});

test('состояние сохраняется и восстанавливается', function () {
  const ctx = makeTimers();
  ctx.timers.timers[0].nextAt = 123456;
  const state = ctx.timers.exportState();
  assert.equal(state.nextAt.t1, 123456);

  const restored = new Timers({
    config: {
      bot: { activityWindowMinutes: 10 },
      timersSettings: { minGapMs: 0 },
      timers: [{ id: 't1', text: 'x', everyMinutes: 1 }]
    },
    send: async function () {},
    log: silent,
    now: function () { return 0; },
    saved: state
  });
  assert.equal(restored.timers[0].nextAt, 123456);
});
