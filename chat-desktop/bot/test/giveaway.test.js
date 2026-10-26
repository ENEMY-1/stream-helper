'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Giveaway, containsKeyword } = require('../src/giveaway');
const { Points } = require('../src/points');

const silent = { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };

function makeGiveaway(options) {
  const opts = options || {};
  let now = opts.now || 1000000;
  const state = opts.state || {};
  const sent = [];
  const saves = [];

  const giveaway = new Giveaway({
    config: Object.assign({ giveaways: opts.giveaways || {} }, opts.config || {}),
    log: silent,
    now: function () { return now; },
    send: function (text) { sent.push(text); return Promise.resolve(); },
    points: opts.points || null,
    state: state,
    onSave: function () { saves.push(JSON.parse(JSON.stringify(state.giveaway))); }
  });
  giveaway.tick = function (delta) { now += delta; return Giveaway.prototype.tick.call(giveaway); };
  giveaway.setNow = function (value) { now = value; };
  return { giveaway: giveaway, state: state, sent: sent, saves: saves };
}

function message(overrides) {
  return Object.assign({
    userId: '42',
    login: 'viewer',
    user: 'Viewer',
    text: 'привет'
  }, overrides || {});
}

test('containsKeyword ищет слово целиком и не зависит от регистра', function () {
  assert.equal(containsKeyword('Хочу ПРИЗ!', 'приз'), true);
  assert.equal(containsKeyword('призовой фонд', 'приз'), false);
  assert.equal(containsKeyword('ну давай, приз', 'приз'), true);
});

test('запуск розыгрыша требует корректное ключевое слово', function () {
  const ctx = makeGiveaway();

  assert.match(ctx.giveaway.start({ keyword: 'а' }), /от 2 до 32/);
  assert.match(ctx.giveaway.start({ keyword: 'два слова' }), /без пробелов/);
  assert.match(ctx.giveaway.start({ keyword: 'приз', minutes: 5 }), /Розыгрыш/);
  assert.equal(ctx.giveaway.running, true);
  assert.equal(ctx.state.giveaway.keyword, 'приз');
});

test('второй розыгрыш не стартует поверх активного', function () {
  const ctx = makeGiveaway({ giveaways: { defaultMinutes: 5 } });
  ctx.giveaway.start({ keyword: 'приз' });

  assert.match(ctx.giveaway.start({ keyword: 'другой' }), /Уже идёт/);
});

test('розыгрыши можно выключить в настройках', function () {
  const ctx = makeGiveaway({ giveaways: { enabled: false } });
  assert.match(ctx.giveaway.start({ keyword: 'приз' }), /выключены/);
});

test('участник добавляется по ключевому слову и не дублируется', function () {
  const ctx = makeGiveaway();
  ctx.giveaway.start({ keyword: 'приз', minutes: 5 });

  ctx.giveaway.noteMessage(message({ text: 'хочу приз!' }));
  assert.equal(ctx.giveaway.active.participants.size, 1);

  ctx.giveaway.noteMessage(message({ text: 'приз приз' }));
  assert.equal(ctx.giveaway.active.participants.size, 1);
  assert.equal(ctx.sent.filter(function (text) { return /участвует/.test(text); }).length, 1);
});

test('команды в чате не считаются участием', function () {
  const ctx = makeGiveaway();
  ctx.giveaway.start({ keyword: 'приз' });

  assert.equal(ctx.giveaway.noteMessage(message({ text: '!приз' })), false);
  assert.equal(ctx.giveaway.active.participants.size, 0);
});

test('!join добавляет участника, повторный вход отклоняется', function () {
  const ctx = makeGiveaway();
  ctx.giveaway.start({ keyword: 'приз' });

  const first = ctx.giveaway.join(message());
  assert.equal(first.ok, true);
  assert.equal(first.entries, 1);

  const second = ctx.giveaway.join(message());
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already');
});

test('розыгрыш завершается по времени и выбирает победителя', function () {
  const ctx = makeGiveaway({ giveaways: { defaultMinutes: 5 } });
  ctx.giveaway.start({ keyword: 'приз', minutes: 1 });
  ctx.giveaway.join(message({ userId: '1', user: 'Ann' }));
  ctx.giveaway.join(message({ userId: '2', user: 'Bob' }));

  const early = ctx.giveaway.tick(30000);
  assert.equal(early, null);
  assert.equal(ctx.giveaway.running, true);

  const result = ctx.giveaway.tick(40000);
  assert.ok(result);
  assert.equal(result.winners.length, 1);
  assert.ok(['Ann', 'Bob'].indexOf(result.winners[0]) !== -1);
  assert.equal(ctx.giveaway.active, null);
  assert.equal(ctx.state.giveaway, null);
});

test('без участников розыгрыш завершается без победителя', function () {
  const ctx = makeGiveaway();
  ctx.giveaway.start({ keyword: 'приз', minutes: 1 });

  const result = ctx.giveaway.finish(false);
  assert.deepEqual(result.winners, []);
  assert.match(result.text, /никто не участвовал/);
  assert.equal(ctx.giveaway.lastResult.entries, 0);
});

test('число победителей не превышает число участников', function () {
  const ctx = makeGiveaway();
  ctx.giveaway.start({ keyword: 'приз', winners: 5 });
  ctx.giveaway.join(message({ userId: '1', user: 'Ann' }));
  ctx.giveaway.join(message({ userId: '2', user: 'Bob' }));

  const result = ctx.giveaway.finish(true);
  assert.equal(result.winners.length, 2);
  assert.equal(new Set(result.winners).size, 2);
});

test('платное участие списывает баллы и не пускает без баланса', function () {
  const points = new Points({ config: { points: { perMessage: 100, messageCooldownSec: 1 } }, log: silent, now: function () { return 1000000; } });
  const player = message({ userId: '1', user: 'Ann' });
  points.noteMessage(player);

  const ctx = makeGiveaway({ giveaways: { entryCost: 25 }, points: points });
  ctx.giveaway.start({ keyword: 'приз' });

  const joined = ctx.giveaway.join(player, true);
  assert.equal(joined.ok, true);
  assert.equal(points.balance(player), 75);

  const broke = ctx.giveaway.join(message({ userId: '2', user: 'Bob' }), true);
  assert.equal(broke.ok, false);
  assert.equal(broke.reason, 'points');
  assert.match(broke.text, /25/);
});

test('состояние восстанавливается после перезапуска', function () {
  const state = {
    giveaway: {
      id: 'ga-1',
      keyword: 'приз',
      prize: 'игра',
      startedAt: 1000,
      endsAt: 2000000,
      winnersCount: 2,
      participants: [
        { key: '1', name: 'Ann', at: 1000 },
        { key: '2', name: 'Bob', at: 2000 }
      ]
    }
  };
  const ctx = makeGiveaway({ state: state, now: 1500000 });

  assert.equal(ctx.giveaway.active.keyword, 'приз');
  assert.equal(ctx.giveaway.active.participants.size, 2);
  assert.equal(ctx.giveaway.running, true);
  assert.match(ctx.giveaway.statusText(), /участников: 2/);
});

test('команды !ga start/status/cancel работают', function () {
  const ctx = makeGiveaway();

  assert.match(ctx.giveaway.command(message({ text: '!ga status' })), /розыгрыша нет/);
  assert.match(ctx.giveaway.command(message({ text: '!ga start приз 5 2 игра' })), /Розыгрыш/);
  assert.equal(ctx.giveaway.active.winnersCount, 2);
  assert.equal(ctx.giveaway.active.prize, 'игра');
  assert.match(ctx.giveaway.statusText(), /приз/);
  assert.match(ctx.giveaway.command(message({ text: '!ga cancel' })), /отменён/);
  assert.equal(ctx.giveaway.active, null);
});

test('snapshot отдаёт активный розыгрыш и последний результат', function () {
  const ctx = makeGiveaway();
  ctx.giveaway.start({ keyword: 'приз', prize: 'игра', winners: 2 });
  ctx.giveaway.join(message({ userId: '1', user: 'Ann' }));

  const running = ctx.giveaway.snapshot();
  assert.equal(running.running, true);
  assert.equal(running.active.keyword, 'приз');
  assert.equal(running.active.entries, 1);
  assert.equal(running.active.winners, 2);

  ctx.giveaway.finish(true);
  const done = ctx.giveaway.snapshot();
  assert.equal(done.running, false);
  assert.equal(done.active, null);
  assert.equal(done.lastResult.prize, 'игра');
});
