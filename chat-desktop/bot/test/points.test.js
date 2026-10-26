'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Points, keyOf, formatNumber } = require('../src/points');

const silent = { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };

function makePoints(options) {
  const opts = options || {};
  let now = opts.now || 10000000000;
  const points = new Points({
    config: Object.assign({
      points: opts.points || {},
      bot: { ignore: opts.ignore || [] }
    }, opts.config || {}),
    log: silent,
    now: function () { return now; }
  });
  points.tick = function (delta) { now += delta; };
  points.setNow = function (value) { now = value; };
  return points;
}

function message(overrides) {
  return Object.assign({
    userId: '42',
    login: 'viewer',
    user: 'Viewer',
    text: 'привет'
  }, overrides || {});
}

test('keyOf берёт id, логин или имя', function () {
  assert.equal(keyOf({ userId: '42' }), '42');
  assert.equal(keyOf({ login: 'Viewer' }), 'viewer');
  assert.equal(keyOf({ user: 'Name' }), 'name');
  assert.equal(keyOf({}), '');
});

test('formatNumber разделяет тысячи', function () {
  assert.match(formatNumber(1234), /1\s?234/);
  assert.equal(formatNumber(null), '0');
});

test('баллы начисляются за сообщение с учётом кулдауна', function () {
  const points = makePoints({ points: { perMessage: 5, messageCooldownSec: 60 } });

  assert.equal(points.noteMessage(message()), 5);
  assert.equal(points.balance(message()), 5);
  assert.equal(points.noteMessage(message()), 0);

  points.tick(60000);
  assert.equal(points.noteMessage(message()), 5);
  assert.equal(points.balance(message()), 10);
});

test('кулдаун и начисление можно выключить', function () {
  const points = makePoints({ points: { enabled: false } });
  assert.equal(points.noteMessage(message()), 0);

  const zero = makePoints({ points: { perMessage: 0 } });
  assert.equal(zero.noteMessage(message()), 0);
  assert.equal(zero.balance(message()), 0);
});

test('боты из списка ignore не получают баллы', function () {
  const points = makePoints({ points: { perMessage: 1 }, ignore: ['Nightbot'] });

  assert.equal(points.noteMessage(message({ login: 'nightbot', user: 'Nightbot' })), 0);
  assert.equal(points.balance(message({ login: 'nightbot' })), 0);
});

test('баланс не превышает максимум', function () {
  const points = makePoints({ points: { perMessage: 100, maxBalance: 150, messageCooldownSec: 1 } });

  points.noteMessage(message());
  points.tick(1000);
  assert.equal(points.noteMessage(message()), 50);
  points.tick(1000);
  assert.equal(points.noteMessage(message()), 0);
  assert.equal(points.balance(message()), 150);
});

test('ежедневный бонус выдаётся раз в 24 часа', function () {
  const points = makePoints({ points: { dailyBonus: 50 } });

  const first = points.daily(message());
  assert.equal(first.ok, true);
  assert.equal(first.amount, 50);
  assert.equal(first.points, 50);

  const wait = points.daily(message());
  assert.equal(wait.ok, false);
  assert.equal(wait.reason, 'wait');
  assert.ok(wait.waitMs > 0);

  points.tick(24 * 60 * 60 * 1000);
  const second = points.daily(message());
  assert.equal(second.ok, true);
  assert.equal(second.points, 100);
});

test('ежедневный бонус недоступен без пользователя и при выключенной системе', function () {
  const points = makePoints();
  assert.equal(points.daily({}).reason, 'no-user');

  const disabled = makePoints({ points: { enabled: false } });
  assert.equal(disabled.daily(message()).reason, 'disabled');
});

test('перевод баллов проверяет минимум, себя, получателя и баланс', function () {
  const points = makePoints({ points: { perMessage: 100, messageCooldownSec: 1, transferMin: 10 } });
  points.noteMessage(message());

  const other = message({ userId: '77', login: 'friend', user: 'Friend', text: 'йо' });
  points.noteMessage(other);

  assert.equal(points.transfer(message(), 'friend', 5).ok, false);
  assert.equal(points.transfer(message(), 'viewer', 10).ok, false);
  assert.equal(points.transfer(message(), 'nobody', 10).ok, false);
  assert.equal(points.transfer(message(), 'friend', 500).ok, false);

  const ok = points.transfer(message(), 'friend', 40);
  assert.equal(ok.ok, true);
  assert.equal(ok.amount, 40);
  assert.equal(ok.points, 60);
  assert.equal(points.balance(other), 140);
});

test('списание баллов не уводит баланс в минус', function () {
  const points = makePoints({ points: { perMessage: 25 } });
  points.noteMessage(message());

  const failed = points.spend(message(), 30);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'не хватает баллов');
  assert.equal(failed.need, 30);

  const ok = points.spend(message(), 10);
  assert.equal(ok.ok, true);
  assert.equal(ok.points, 15);
  assert.equal(points.spend(message(), 0).ok, true);
});

test('add начисляет и снимает баллы', function () {
  const points = makePoints();
  assert.equal(points.add(message(), 30), 30);
  assert.equal(points.add(message(), -10), -10);
  assert.equal(points.balance(message()), 20);
  assert.equal(points.add(message(), -100), -20);
  assert.equal(points.balance(message()), 0);
});

test('топ сортирует по баллам и не показывает нулевых', function () {
  const points = makePoints({ points: { perMessage: 1, messageCooldownSec: 1 } });

  points.add(message({ userId: '1', user: 'Ann' }), 10);
  points.add(message({ userId: '2', user: 'Bob' }), 30);
  points.add(message({ userId: '3', user: 'Cid' }), 0);

  const top = points.top(5);
  assert.deepEqual(top.map(function (item) { return item.name; }), ['Bob', 'Ann']);
  assert.equal(points.total(), 40);
});

test('summary показывает баланс и место в топе', function () {
  const points = makePoints();
  points.add(message({ userId: '1', user: 'Ann' }), 10);
  points.add(message({ userId: '2', user: 'Bob' }), 30);

  const summary = points.summary(message({ userId: '2', user: 'Bob' }));
  assert.equal(summary.points, 30);
  assert.equal(summary.rank, 1);
  assert.equal(summary.currency, 'балл');

  const unknown = points.summary(message({ userId: '9', user: 'New' }));
  assert.equal(unknown.points, 0);
  assert.equal(unknown.rank, 0);
});

test('snapshot отдаёт топ и сумму баллов', function () {
  const points = makePoints();
  points.add(message({ userId: '1', user: 'Ann' }), 10);

  const snapshot = points.snapshot();
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.currency, 'балл');
  assert.equal(snapshot.totalUsers, 1);
  assert.equal(snapshot.totalPoints, 10);
  assert.equal(snapshot.users[0].name, 'Ann');
});

test('reload применяет новые настройки', function () {
  const points = makePoints();
  points.reload({ perMessage: 7, currency: 'монета' });

  assert.equal(points.settings.perMessage, 7);
  assert.equal(points.currency, 'монета');
});
