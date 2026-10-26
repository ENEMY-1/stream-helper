'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { StreamStats, humanDurationLong, LOST_GAP_MS } = require('../src/stream-stats');

function makeStats(options) {
  return new StreamStats(Object.assign({}, options || {}));
}

test('humanDurationLong: часы, минуты, секунды', function () {
  assert.equal(humanDurationLong(48 * 1000), '48 с');
  assert.equal(humanDurationLong(12 * 60000 + 5000), '12 мин 05 с');
  assert.equal(humanDurationLong(2 * 3600000 + 15 * 60000), '2 ч 15 мин');
  assert.equal(humanDurationLong(3600000), '1 ч 00 мин');
  assert.equal(humanDurationLong(0), '0 с');
});

test('observe считает пик, среднее и последнее значение', function () {
  const stats = makeStats();
  const startedAt = Date.now() - 60000;

  stats.observe({ startedAt: startedAt, viewers: 10, title: 'A', game: 'G1' });
  stats.observe({ startedAt: startedAt, viewers: 70, title: 'B', game: 'G2' });
  stats.observe({ startedAt: startedAt, viewers: 30 });

  const snapshot = stats.snapshot();
  assert.equal(snapshot.peak, 70);
  assert.equal(snapshot.samples, 3);
  assert.equal(snapshot.title, 'B');
  assert.equal(snapshot.game, 'G2');
});

test('noteMessage до и после стрима не ломает счётчики', function () {
  const stats = makeStats();
  // Пока стрим не начался — сообщения не учитываются.
  stats.noteMessage({ text: '!help' });
  assert.equal(stats.state, undefined);

  stats.observe({ startedAt: Date.now(), viewers: 1 });
  stats.noteMessage({ text: 'привет' });
  stats.noteMessage({ text: ' !social' });
  stats.noteReply('twitch');
  assert.equal(stats.snapshot().messages, 2);
  assert.equal(stats.snapshot().replies, 1);
});

test('markOffline возвращает сводку и очищает текущий стрим', function () {
  const stats = makeStats({
    moderation: { snapshot: function () { return { stats: { total: 2 } }; } }
  });
  const startedAt = Date.now() - 90 * 60000;
  stats.observe({ startedAt: startedAt, viewers: 20 });
  stats.noteModeration();

  const ended = stats.markOffline();
  assert.ok(ended && !ended.dropped);
  assert.equal(stats.state, null);

  const info = stats.summary(ended.state, ended.endedAt);
  assert.equal(info.peak, 20);
  assert.equal(info.moderation.total, 2);
  assert.ok(info.durationMs >= 90 * 60000);
  assert.equal(info.chat.moderation, 1);
});

test('markOffline без активного стрима ничего не возвращает', function () {
  const stats = makeStats();
  assert.equal(stats.markOffline(), null);
});

test('потерянный стрим (бот долго не видел эфир) помечается dropped', function () {
  const stats = makeStats();
  stats.observe({ startedAt: Date.now() - 3600000, viewers: 5 });
  stats.state.lastSeenAt = Date.now() - LOST_GAP_MS - 1000;

  const ended = stats.markOffline();
  assert.equal(ended.dropped, true);
});

test('статистика нового стрима начинается с нуля', function () {
  const stats = makeStats();
  stats.observe({ startedAt: 1000, viewers: 500 });
  stats.markOffline();
  stats.observe({ startedAt: 2000, viewers: 3 });

  assert.equal(stats.snapshot().peak, 3);
  assert.equal(stats.snapshot().samples, 1);
});
