'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Moderation, normalizeText, urlDomains, cleanWords, cleanDomains } = require('../src/moderation');

const silent = { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };

function makeModeration(options) {
  const opts = options || {};
  const state = opts.state || {};
  const calls = { deleted: [], timeouts: [], bans: [], unbans: [], replies: [] };

  const moderation = new Moderation({
    config: Object.assign({
      socials: { telegram: 'https://t.me/demo_channel', discord: '' }
    }, opts.config || {}),
    state: state,
    log: silent,
    now: opts.now || function () { return 10000000000; },
    actions: {
      deleteMessage: function (id) { calls.deleted.push(id); },
      timeout: function (login, seconds, reason) { calls.timeouts.push({ login: login, seconds: seconds, reason: reason }); },
      ban: function (login, reason) { calls.bans.push({ login: login, reason: reason }); },
      unban: function (login) { calls.unbans.push(login); },
      reply: function (text) { calls.replies.push(text); }
    }
  });

  return { moderation: moderation, state: state, calls: calls };
}

function message(overrides) {
  return Object.assign({
    id: 'msg-1',
    userId: '42',
    login: 'viewer',
    user: 'Viewer',
    text: 'привет'
  }, overrides || {});
}

test('normalizeText приводит регистр, ё и пробелы', function () {
  assert.equal(normalizeText('  ЁЖИК   В ТУМАНЕ '), 'ежик в тумане');
});

test('urlDomains находит домены и отбрасывает мусор', function () {
  assert.deepEqual(urlDomains('смотри https://www.Example.com/path и test.ru:8080/x'),
    ['example.com', 'test.ru']);
  assert.deepEqual(urlDomains('просто текст без ссылок'), []);
});

test('cleanWords и cleanDomains убирают пустое и дубликаты', function () {
  assert.deepEqual(cleanWords([' спам ', 'спам', '', 'ещё']), ['спам', 'ещё']);
  assert.deepEqual(cleanDomains(['https://www.Twitch.tv/', 'twitch.tv', '']), ['twitch.tv']);
});

test('запрещённое слово ловится целиком, но не внутри другого слова', function () {
  const ctx = makeModeration({ config: { moderation: { bannedWords: { words: ['дурак'] } } } });

  assert.equal(ctx.moderation.inspect(message({ text: 'ты дурак' })).category, 'banned-word');
  assert.equal(ctx.moderation.inspect(message({ text: 'дураки вокруг' })), null);
});

test('режим substring ловит слово внутри текста', function () {
  const ctx = makeModeration({
    config: { moderation: { bannedWords: { match: 'substring', words: ['дур'] } } }
  });

  assert.equal(ctx.moderation.inspect(message({ text: 'дураки вокруг' })).category, 'banned-word');
});

test('сторонние ссылки удаляются, а разрешённые и соцсети проходят', function () {
  const ctx = makeModeration({ config: { moderation: { links: { allow: ['example.com'] } } } });

  assert.equal(ctx.moderation.inspect(message({ text: 'заходи https://evil.tld/x' })).category, 'link');
  assert.equal(ctx.moderation.inspect(message({ text: 'наш сайт example.com' })), null);
  assert.equal(ctx.moderation.inspect(message({ text: 'телега t.me/demo_channel' })), null);
});

test('капс определяется только для достаточно длинного текста', function () {
  const ctx = makeModeration({ config: { moderation: { caps: { minLength: 10, percent: 70 } } } });

  assert.equal(ctx.moderation.inspect(message({ text: 'ПРИВЕТ ВСЕМ ДРУЗЬЯ' })).category, 'caps');
  assert.equal(ctx.moderation.inspect(message({ text: 'Привет всем друзья' })), null);
  assert.equal(ctx.moderation.inspect(message({ text: 'ОК' })), null);
});

test('флуд и повторяющиеся сообщения распознаются', function () {
  let now = 1000;
  const ctx = makeModeration({
    now: function () { return now; },
    config: { moderation: {
      spam: { maxMessages: 3, windowSec: 10, duplicateCount: 2, duplicateWindowSec: 30 },
      caps: { enabled: false }
    } }
  });

  assert.equal(ctx.moderation.handle(message({ id: '1', text: 'раз' })).action, 'none');
  assert.equal(ctx.moderation.handle(message({ id: '2', text: 'два' })).action, 'none');
  const flood = ctx.moderation.handle(message({ id: '3', text: 'три' }));
  assert.equal(flood.category, 'spam');
  assert.equal(flood.detail, 'too-fast');

  now += 60000;
  const duplicate = ctx.moderation.handle(message({ id: '4', text: 'одинаково' }));
  assert.equal(duplicate.action, 'none');
  const again = ctx.moderation.handle(message({ id: '5', text: 'одинаково' }));
  assert.equal(again.detail, 'duplicate');
  assert.equal(again.category, 'spam');
});

test('слишком длинное сообщение и спам эмодзи удаляются', function () {
  const ctx = makeModeration({ config: { moderation: { spam: { maxLength: 50 } } } });

  assert.equal(ctx.moderation.inspect(message({ text: 'а'.repeat(60) })).detail, 'too-long');
  assert.equal(ctx.moderation.inspect(message({ text: '😀'.repeat(12) })).detail, 'emoji-spam');
});

test('модераторы, стример и подписчики не проверяются', function () {
  const ctx = makeModeration({ config: { moderation: { bannedWords: { words: ['дурак'] } } } });

  assert.equal(ctx.moderation.inspect(message({ text: 'дурак', isBroadcaster: true })), null);
  assert.equal(ctx.moderation.inspect(message({ text: 'дурак', isMod: true })), null);
  assert.equal(ctx.moderation.inspect(message({ text: 'дурак', isSubscriber: true })), null);
  assert.equal(ctx.moderation.inspect(message({ text: 'дурак', isVip: true })), null);
});

test('пользователь из списка исключений не проверяется', function () {
  const ctx = makeModeration({
    config: { moderation: { exempt: { users: ['Friend'] }, bannedWords: { words: ['дурак'] } } }
  });

  assert.equal(ctx.moderation.inspect(message({ login: 'friend', text: 'дурак' })), null);
});

test('наказания нарастают: удаление, мут, бан', function () {
  const ctx = makeModeration({
    config: { moderation: {
      bannedWords: { words: ['дурак'] },
      punishment: { timeoutAfter: 2, timeoutSec: 60, banAfter: 3, strikeWindowMin: 30 },
      warnInChat: false
    } }
  });

  const first = ctx.moderation.handle(message({ id: '1', text: 'дурак' }));
  assert.equal(first.action, 'delete');
  assert.equal(first.strikes, 1);
  assert.deepEqual(ctx.calls.deleted, ['1']);

  const second = ctx.moderation.handle(message({ id: '2', text: 'дурак' }));
  assert.equal(second.action, 'timeout');
  assert.equal(second.durationSec, 60);
  assert.equal(ctx.calls.timeouts[0].login, 'viewer');

  const third = ctx.moderation.handle(message({ id: '3', text: 'дурак' }));
  assert.equal(third.action, 'ban');
  assert.equal(ctx.calls.bans[0].login, 'viewer');
  assert.equal(ctx.state.moderation.strikes['42'].count, 3);
});

test('повторный мут увеличивает длительность', function () {
  const ctx = makeModeration({
    config: { moderation: {
      bannedWords: { words: ['дурак'] },
      punishment: { timeoutAfter: 1, timeoutSec: 60, banAfter: 0, strikeWindowMin: 30 },
      warnInChat: false
    } }
  });

  ctx.moderation.handle(message({ id: '1', text: 'дурак' }));
  assert.equal(ctx.calls.timeouts[0].seconds, 60);
  ctx.moderation.handle(message({ id: '2', text: 'дурак' }));
  assert.equal(ctx.calls.timeouts[1].seconds, 120);
});

test('страйки сбрасываются по окну времени', function () {
  let now = 1000;
  const ctx = makeModeration({
    now: function () { return now; },
    config: { moderation: {
      bannedWords: { words: ['дурак'] },
      punishment: { timeoutAfter: 2, banAfter: 3, strikeWindowMin: 10 },
      warnInChat: false
    } }
  });

  ctx.moderation.handle(message({ id: '1', text: 'дурак' }));
  now += 11 * 60000;
  const result = ctx.moderation.handle(message({ id: '2', text: 'дурак' }));
  assert.equal(result.strikes, 1);
  assert.equal(result.action, 'delete');
});

test('предупреждение отправляется не чаще раза в минуту', function () {
  let now = 10000000000;
  const ctx = makeModeration({
    now: function () { return now; },
    config: { moderation: { bannedWords: { words: ['дурак'] }, punishment: { enabled: false } } }
  });

  ctx.moderation.handle(message({ id: '1', text: 'дурак' }));
  ctx.moderation.handle(message({ id: '2', text: 'дурак' }));
  assert.equal(ctx.calls.replies.length, 1);

  now += 61000;
  ctx.moderation.handle(message({ id: '3', text: 'дурак' }));
  assert.equal(ctx.calls.replies.length, 2);
  assert.match(ctx.calls.replies[1], /Viewer/);
});

test('ручные команды модерации выполняют действия', function () {
  const ctx = makeModeration();
  ctx.moderation.lastMessageId.set('viewer', '777');

  assert.match(ctx.moderation.manual(message({ text: '!ban troll спам' })), /Забанен @troll/);
  assert.deepEqual(ctx.calls.bans[0], { login: 'troll', reason: 'спам' });

  assert.match(ctx.moderation.manual(message({ text: '!unban troll' })), /Разбанен/);
  assert.deepEqual(ctx.calls.unbans, ['troll']);

  assert.match(ctx.moderation.manual(message({ text: '!timeout troll 90 флуд' })), /90/);
  assert.deepEqual(ctx.calls.timeouts[0], { login: 'troll', seconds: 90, reason: 'флуд' });

  assert.match(ctx.moderation.manual(message({ text: '!delete viewer' })), /удалено/);
  assert.deepEqual(ctx.calls.deleted, ['777']);

  assert.match(ctx.moderation.manual(message({ text: '!modstats' })), /Удалено/);
  assert.match(ctx.moderation.manual(message({ text: '!ban' })), /Напиши ник/);
});

test('snapshot отдаёт статистику и включённость', function () {
  const ctx = makeModeration({ config: { moderation: { bannedWords: { words: ['дурак'] } } } });
  ctx.moderation.handle(message({ text: 'дурак' }));

  const snapshot = ctx.moderation.snapshot();
  assert.equal(snapshot.enabled, true);
  assert.equal(snapshot.words, 1);
  assert.equal(snapshot.stats.deleted, 1);
  assert.equal(snapshot.stats.violations, 1);
});
