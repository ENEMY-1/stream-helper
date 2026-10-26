'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Events } = require('../src/events');

const silent = { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };

function makeEvents(options) {
  const opts = options || {};
  const sent = [];
  const events = new Events({
    config: Object.assign({ events: opts.events || {} }, opts.config || {}),
    log: silent,
    send: function (text) { sent.push(text); return Promise.resolve(); }
  });
  return { events: events, sent: sent };
}

test('сообщение о подписке подставляет имя', function () {
  const ctx = makeEvents();

  const text = ctx.events.handleUserNotice({ type: 'sub', user: 'Viewer', login: 'viewer' });
  assert.match(text, /Viewer/);
  assert.match(text, /подписался/);
  assert.deepEqual(ctx.sent, [text]);
  assert.equal(ctx.events.stats.subs, 1);
});

test('продление показывает число месяцев', function () {
  const ctx = makeEvents();

  const text = ctx.events.handleUserNotice({ type: 'resub', user: 'Viewer', months: 7 });
  assert.match(text, /7 мес/);
  assert.equal(ctx.events.stats.resubs, 1);
});

test('подарочная и массовая подписка учитываются по-разному', function () {
  const ctx = makeEvents();

  const gift = ctx.events.handleUserNotice({ type: 'subgift', user: 'Ann', recipient: 'Bob' });
  assert.match(gift, /Bob/);
  assert.equal(ctx.events.stats.gifts, 1);

  const mass = ctx.events.handleUserNotice({ type: 'submysterygift', user: 'Ann', count: 5 });
  assert.match(mass, /5 подписок/);
  assert.equal(ctx.events.stats.gifts, 6);
});

test('рейд приходит с числом зрителей и уважает минимум', function () {
  const ctx = makeEvents({ events: { minRaidViewers: 10 } });

  assert.equal(ctx.events.handleUserNotice({ type: 'raid', user: 'Raider', viewers: 5 }), null);
  assert.equal(ctx.events.stats.raids, 0);

  const text = ctx.events.handleUserNotice({ type: 'raid', user: 'Raider', viewers: 1500 });
  assert.match(text, /1\s?500/);
  assert.match(text, /Raider/);
  assert.equal(ctx.events.stats.raids, 1);
});

test('битсы благодарят только от минимального порога', function () {
  const ctx = makeEvents({ events: { minCheerBits: 100 } });

  assert.equal(ctx.events.handleCheer({ user: 'Ann', bits: 99 }), null);
  assert.equal(ctx.events.stats.cheers, 0);

  const text = ctx.events.handleCheer({ user: 'Ann', bits: 500 });
  assert.match(text, /500/);
  assert.match(text, /Ann/);
  assert.equal(ctx.events.stats.cheers, 1);
});

test('фоллоу берёт имя из данных EventSub', function () {
  const ctx = makeEvents();

  const text = ctx.events.handleFollow({ user_name: 'NewViewer', user_login: 'newviewer' });
  assert.match(text, /NewViewer/);
  assert.equal(ctx.events.stats.follows, 1);
});

test('неизвестные события игнорируются', function () {
  const ctx = makeEvents();

  assert.equal(ctx.events.handleUserNotice({ type: 'unknown' }), null);
  assert.equal(ctx.events.handleUserNotice(null), null);
  assert.equal(ctx.sent.length, 0);
});

test('выключенные уведомления ничего не отправляют', function () {
  const ctx = makeEvents({ events: { enabled: false } });

  assert.equal(ctx.events.handleUserNotice({ type: 'sub', user: 'Viewer' }), null);
  assert.equal(ctx.events.handleCheer({ user: 'Ann', bits: 500 }), null);
  assert.equal(ctx.events.handleFollow({ user_name: 'NewViewer' }), null);
  assert.equal(ctx.sent.length, 0);
});

test('свои шаблоны и неизвестные плейсхолдеры сохраняются как есть', function () {
  const ctx = makeEvents({ events: { messages: { follow: 'Спасибо, {user}! {unknown}' } } });

  const text = ctx.events.handleFollow({ user_name: 'Ann' });
  assert.equal(text, 'Спасибо, Ann! {unknown}');
});

test('snapshot отдаёт статистику', function () {
  const ctx = makeEvents();
  ctx.events.handleUserNotice({ type: 'sub', user: 'Viewer' });
  ctx.events.handleCheer({ user: 'Ann', bits: 200 });

  const snapshot = ctx.events.snapshot();
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.stats.subs, 1);
  assert.equal(snapshot.stats.cheers, 1);
  assert.equal(snapshot.stats.last.type, 'cheer');
});

test('reload меняет настройки на лету', function () {
  const ctx = makeEvents();
  ctx.events.reload({ minCheerBits: 1000 });

  assert.equal(ctx.events.settings.minCheerBits, 1000);
  assert.equal(ctx.events.handleCheer({ user: 'Ann', bits: 500 }), null);
});
