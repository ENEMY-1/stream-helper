'use strict';

// Розыгрыши в чате: вход по ключевому слову или команде !join,
// случайный выбор победителей, опциональная стоимость в баллах.

const { truncate } = require('./fsutil');

const DEFAULTS = {
  enabled: true,
  defaultMinutes: 5,
  defaultWinners: 1,
  entryCost: 0,
  allowMultiple: false,
  messages: {
    start: '🎁 Розыгрыш: {prize}! Напиши в чат «{keyword}» — осталось {minutes} мин. Победителей: {winners}.',
    winner: '🎉 Победитель розыгрыша «{prize}»: {winners}! Поздравляем!',
    noEntries: 'Розыгрыш «{prize}» завершён: никто не участвовал.',
    join: '{user} участвует в розыгрыше!',
    already: '{user}, ты уже участвуешь.',
    cost: 'Участие стоит {cost} {currency}. Не хватает баллов.',
    stopped: 'Розыгрыш «{prize}» остановлен.'
  }
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, extra) {
  const out = Object.assign({}, base);
  if (!isPlainObject(extra)) return out;
  Object.keys(extra).forEach(function (key) {
    const value = extra[key];
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = merge(out[key], value);
    else out[key] = value;
  });
  return out;
}

function normalizeText(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/ё/g, 'е').trim();
}

function containsKeyword(text, keyword) {
  const hay = ' ' + normalizeText(text).replace(/[^\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
  return hay.indexOf(' ' + normalizeText(keyword) + ' ') !== -1;
}

function formatNumber(value) {
  try { return new Intl.NumberFormat('ru-RU').format(Number(value) || 0); }
  catch (error) { return String(Number(value) || 0); }
}

class Giveaway {
  constructor(options) {
    const opts = options || {};
    this.config = opts.config || {};
    this.log = opts.log || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
    this.now = opts.now || Date.now;
    this.send = opts.send || function () { return Promise.resolve(); };
    this.points = opts.points || null;
    this.state = opts.state || {};
    this.onSave = opts.onSave || function () {};
    this.settings = this.normalize(this.config.giveaways);

    if (!isPlainObject(this.state.giveaway)) this.state.giveaway = null;
    this.active = this.state.giveaway ? this.restore(this.state.giveaway) : null;
    this.lastResult = null;
  }

  normalize(raw) {
    const merged = merge(DEFAULTS, raw || {});
    return {
      enabled: merged.enabled !== false,
      defaultMinutes: Math.round(clamp(merged.defaultMinutes, 1, 120, 5)),
      defaultWinners: Math.round(clamp(merged.defaultWinners, 1, 20, 1)),
      entryCost: Math.round(clamp(merged.entryCost, 0, 100000, 0)),
      allowMultiple: merged.allowMultiple === true,
      messages: Object.assign({}, DEFAULTS.messages, isPlainObject(merged.messages) ? merged.messages : {})
    };
  }

  reload(raw) {
    this.settings = this.normalize(raw);
    return this.settings;
  }

  restore(saved) {
    if (!isPlainObject(saved) || !saved.keyword) return null;
    const participants = new Map();
    (Array.isArray(saved.participants) ? saved.participants : []).forEach(function (item) {
      if (!isPlainObject(item) || !item.key) return;
      participants.set(String(item.key), {
        key: String(item.key),
        name: String(item.name || item.key),
        at: Number(item.at) || 0
      });
    });
    return {
      id: String(saved.id || ('ga-' + this.now())),
      keyword: String(saved.keyword),
      prize: String(saved.prize || 'приз'),
      startedAt: Number(saved.startedAt) || this.now(),
      endsAt: Number(saved.endsAt) || (this.now() + this.settings.defaultMinutes * 60000),
      winnersCount: Math.max(1, Number(saved.winnersCount) || this.settings.defaultWinners),
      participants: participants
    };
  }

  persist() {
    if (this.active) {
      this.state.giveaway = {
        id: this.active.id,
        keyword: this.active.keyword,
        prize: this.active.prize,
        startedAt: this.active.startedAt,
        endsAt: this.active.endsAt,
        winnersCount: this.active.winnersCount,
        participants: Array.from(this.active.participants.values())
      };
    } else {
      this.state.giveaway = null;
    }
    this.onSave();
  }

  get running() {
    return !!(this.active && this.now() < this.active.endsAt);
  }

  statusText() {
    if (!this.active) return 'Сейчас розыгрыша нет. Запустить: !ga start <слово> <минут> [победителей] <приз>';
    const leftMs = Math.max(0, this.active.endsAt - this.now());
    const left = Math.ceil(leftMs / 60000);
    return '🎁 Розыгрыш «' + this.active.prize + '» · слово «' + this.active.keyword +
      '» · участников: ' + this.active.participants.size +
      ' · осталось ~' + left + ' мин.';
  }

  start(options) {
    if (!this.settings.enabled) return 'Розыгрыши выключены в настройках.';
    if (this.active) {
      return 'Уже идёт розыгрыш «' + this.active.prize + '». Сначала заверши его: !ga stop';
    }

    const opts = options || {};
    const keyword = String(opts.keyword || '').trim();
    if (!keyword || keyword.length < 2 || keyword.length > 32 || /\s/.test(keyword)) {
      return 'Ключевое слово: от 2 до 32 символов, без пробелов.';
    }
    const minutes = Math.round(clamp(opts.minutes, 1, 120, this.settings.defaultMinutes));
    const winners = Math.round(clamp(opts.winners, 1, 20, this.settings.defaultWinners));
    const prize = truncate(opts.prize || 'приз', 120);
    const now = this.now();

    this.active = {
      id: 'ga-' + now,
      keyword: keyword,
      prize: prize,
      startedAt: now,
      endsAt: now + minutes * 60000,
      winnersCount: winners,
      participants: new Map()
    };
    this.persist();

    const text = String(this.settings.messages.start || DEFAULTS.messages.start)
      .replace(/\{prize\}/g, prize)
      .replace(/\{keyword\}/g, keyword)
      .replace(/\{minutes\}/g, String(minutes))
      .replace(/\{winners\}/g, String(winners));
    this.log.info('Розыгрыш запущен: «' + prize + '», слово «' + keyword + '», ' + minutes + ' мин.');
    return truncate(text, 480);
  }

  join(message, silent) {
    if (!this.active) return { ok: false, reason: 'no-giveaway' };
    if (this.now() >= this.active.endsAt) return { ok: false, reason: 'ended' };

    const key = String((message && (message.userId || message.login || message.user)) || '').toLowerCase();
    if (!key) return { ok: false, reason: 'no-user' };
    if (this.active.participants.has(key) && !this.settings.allowMultiple) {
      return { ok: false, reason: 'already', text: this.message('already', message) };
    }

    if (this.settings.entryCost > 0 && this.points) {
      const spent = this.points.spend(message, this.settings.entryCost);
      if (!spent.ok) {
        return {
          ok: false,
          reason: 'points',
          text: String(this.settings.messages.cost || DEFAULTS.messages.cost)
            .replace(/\{cost\}/g, formatNumber(this.settings.entryCost))
            .replace(/\{currency\}/g, this.points.currency)
        };
      }
    }

    this.active.participants.set(key, {
      key: key,
      name: String((message && (message.user || message.login)) || key),
      at: this.now()
    });
    this.persist();
    this.log.info('Розыгрыш: участник ' + key + ' (' + this.active.participants.size + ')');

    const announce = String(this.settings.messages.join || '');
    if (!silent && announce) {
      this.send(truncate(this.message('join', message), 480)).catch(function () {});
    }

    return { ok: true, entries: this.active.participants.size };
  }

  message(name, message) {
    const template = String(this.settings.messages[name] || DEFAULTS.messages[name] || '');
    const user = String((message && (message.user || message.login)) || '');
    const currency = this.points ? this.points.currency : 'балл';
    return template
      .replace(/\{user\}/g, user)
      .replace(/\{cost\}/g, formatNumber(this.settings.entryCost))
      .replace(/\{currency\}/g, currency)
      .replace(/\{prize\}/g, this.active ? this.active.prize : '')
      .replace(/\{keyword\}/g, this.active ? this.active.keyword : '');
  }

  noteMessage(message) {
    if (!this.active || this.now() >= this.active.endsAt) return false;
    if (!containsKeyword(message.text, this.active.keyword)) return false;
    if (String(message.text || '').trim().startsWith('!')) return false;
    const result = this.join(message, true);
    if (result.ok) {
      const announce = String(this.settings.messages.join || '');
      if (announce) {
        this.send(truncate(this.message('join', message), 480)).catch(function () {});
      }
    }
    return result.ok;
  }

  finish(manual) {
    if (!this.active) return { text: 'Сейчас розыгрыша нет.' };
    const active = this.active;
    const participants = Array.from(active.participants.values());

    if (!participants.length) {
      this.active = null;
      this.lastResult = { prize: active.prize, winners: [], entries: 0, at: this.now() };
      this.persist();
      const text = String(this.settings.messages.noEntries || DEFAULTS.messages.noEntries)
        .replace(/\{prize\}/g, active.prize);
      this.send(truncate(text, 480)).catch(function () {});
      return { text: text, winners: [] };
    }

    const pool = participants.slice();
    const winners = [];
    const count = Math.min(active.winnersCount, pool.length);
    for (let i = 0; i < count; i++) {
      const index = Math.floor(Math.random() * pool.length);
      winners.push(pool.splice(index, 1)[0]);
    }

    this.active = null;
    this.lastResult = {
      prize: active.prize,
      winners: winners.map(function (item) { return item.name; }),
      entries: participants.length,
      at: this.now()
    };
    this.persist();

    const names = winners.map(function (item) { return item.name; }).join(', ');
    const text = String(this.settings.messages.winner || DEFAULTS.messages.winner)
      .replace(/\{prize\}/g, active.prize)
      .replace(/\{winners\}/g, names)
      .replace(/\{count\}/g, String(winners.length));
    this.log.info('Розыгрыш завершён: ' + names + ' (участников: ' + participants.length + ')' +
      (manual ? ' — вручную' : ''));
    this.send(truncate(text, 480)).catch(function () {});
    return { text: text, winners: winners.map(function (item) { return item.name; }) };
  }

  command(message) {
    const parts = String((message && message.text) || '').trim().split(/\s+/);
    const args = parts.slice(1);
    const sub = String(args[0] || '').toLowerCase();

    if (!sub || sub === 'status' || sub === 'статус') return this.statusText();

    if (sub === 'stop' || sub === 'стоп' || sub === 'roll' || sub === 'ролл' || sub === 'finish') {
      return this.finish(true).text;
    }

    if (sub === 'cancel' || sub === 'отмена') {
      if (!this.active) return 'Сейчас розыгрыша нет.';
      const prize = this.active.prize;
      this.active = null;
      this.persist();
      return truncate('Розыгрыш «' + prize + '» отменён.', 480);
    }

    if (sub === 'start' || sub === 'старт') {
      const keyword = args[1];
      const minutes = args[2];
      let winners = this.settings.defaultWinners;
      let prizeStart = 3;
      if (args[3] && /^\d+$/.test(args[3])) {
        winners = Number(args[3]);
        prizeStart = 4;
      }
      const prize = args.slice(prizeStart).join(' ') || 'приз';
      return this.start({
        keyword: keyword,
        minutes: minutes,
        winners: winners,
        prize: prize
      });
    }

    return 'Команды: !ga start <слово> <минут> [победителей] <приз> · !ga stop · !ga status';
  }

  tick(nowValue) {
    const now = nowValue || this.now();
    if (this.active && now >= this.active.endsAt) return this.finish(false);
    return null;
  }

  snapshot() {
    const leftMs = this.active ? Math.max(0, this.active.endsAt - this.now()) : 0;
    return {
      enabled: this.settings.enabled,
      running: this.running,
      active: this.active ? {
        keyword: this.active.keyword,
        prize: this.active.prize,
        entries: this.active.participants.size,
        winners: this.active.winnersCount,
        endsInSec: Math.ceil(leftMs / 1000)
      } : null,
      lastResult: this.lastResult
    };
  }
}

module.exports = {
  Giveaway: Giveaway,
  DEFAULTS: DEFAULTS,
  containsKeyword: containsKeyword,
  formatNumber: formatNumber
};
