'use strict';

// Система баллов (внутренняя валюта канала).
// Баллы начисляются за сообщения с задержкой, за ежедневный вход,
// передаются между зрителями и тратятся на участие в розыгрышах.

const { readJson, writeJson } = require('./fsutil');

const DEFAULTS = {
  enabled: true,
  currency: 'балл',
  perMessage: 1,
  messageCooldownSec: 60,
  dailyBonus: 50,
  transferMin: 10,
  maxBalance: 1000000
};

const SAVE_INTERVAL_MS = 10000;

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

function keyOf(message) {
  return String((message && (message.userId || message.login || message.user)) || '').toLowerCase();
}

function displayName(message) {
  return String((message && (message.user || message.login)) || '').trim();
}

function formatNumber(value) {
  const number = Number(value) || 0;
  try {
    return new Intl.NumberFormat('ru-RU').format(number);
  } catch (error) {
    return String(number);
  }
}

class Points {
  constructor(options) {
    const opts = options || {};
    this.file = opts.file;
    this.config = opts.config || {};
    this.log = opts.log || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
    this.now = opts.now || Date.now;
    this.settings = this.normalize(this.config.points);
    this.ignore = new Set(((this.config.bot || {}).ignore || []).map(function (name) {
      return String(name).toLowerCase();
    }));

    const data = this.file ? readJson(this.file, {}) : {};
    this.data = isPlainObject(data) ? data : {};
    if (!isPlainObject(this.data.users)) this.data.users = {};
    this.lastSaveAt = 0;
    this.dirty = false;
  }

  normalize(raw) {
    const merged = merge(DEFAULTS, raw || {});
    return {
      enabled: merged.enabled !== false,
      currency: String(merged.currency || 'балл').slice(0, 24),
      perMessage: Math.round(clamp(merged.perMessage, 0, 1000, 1)),
      messageCooldownSec: Math.round(clamp(merged.messageCooldownSec, 1, 3600, 60)),
      dailyBonus: Math.round(clamp(merged.dailyBonus, 0, 100000, 50)),
      transferMin: Math.round(clamp(merged.transferMin, 1, 100000, 10)),
      maxBalance: Math.round(clamp(merged.maxBalance, 1, 100000000, 1000000))
    };
  }

  reload(raw) {
    this.settings = this.normalize(raw);
    return this.settings;
  }

  get enabled() {
    return this.settings.enabled;
  }

  get currency() {
    return this.settings.currency;
  }

  ensure(key, name) {
    let record = this.data.users[key];
    if (!record || typeof record !== 'object') {
      record = {
        key: key,
        name: name || key,
        points: 0,
        earned: 0,
        spent: 0,
        joinedAt: this.now(),
        lastMessageAt: 0,
        lastDailyAt: 0
      };
      this.data.users[key] = record;
    }
    if (name) record.name = name;
    record.points = Math.max(0, Math.round(Number(record.points) || 0));
    return record;
  }

  maybeSave(force) {
    if (!this.file) return;
    const now = this.now();
    if (!force && now - this.lastSaveAt < SAVE_INTERVAL_MS) return;
    if (!this.dirty) return;
    this.dirty = false;
    this.lastSaveAt = now;
    this.data.updatedAt = now;
    if (!writeJson(this.file, this.data)) this.log.warn('Не удалось сохранить баллы в', this.file);
  }

  flush() {
    if (this.dirty) this.maybeSave(true);
  }

  noteMessage(message) {
    if (!this.enabled || !message) return 0;
    const login = String(message.login || '').toLowerCase();
    if (this.ignore.has(login)) return 0;

    const key = keyOf(message);
    if (!key) return 0;
    const now = this.now();
    const record = this.ensure(key, displayName(message));
    const cooldown = this.settings.messageCooldownSec * 1000;
    if (now - Number(record.lastMessageAt || 0) < cooldown) return 0;

    const amount = this.settings.perMessage;
    record.lastMessageAt = now;
    if (amount <= 0) return 0;

    const before = record.points;
    record.points = Math.min(this.settings.maxBalance, before + amount);
    record.earned = Math.max(0, Number(record.earned) || 0) + (record.points - before);
    this.dirty = true;
    this.maybeSave();
    return record.points - before;
  }

  balance(message) {
    const key = keyOf(message);
    if (!key) return 0;
    const record = this.data.users[key];
    return record ? Math.max(0, Number(record.points) || 0) : 0;
  }

  summary(message) {
    const key = keyOf(message);
    const record = this.data.users[key];
    const balance = record ? Math.max(0, Number(record.points) || 0) : 0;
    const sorted = this.top(1000000);
    let rank = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].key === key) { rank = i + 1; break; }
    }
    return {
      key: key,
      name: displayName(message) || (record && record.name) || '',
      points: balance,
      rank: rank,
      currency: this.currency
    };
  }

  add(message, amount, options) {
    const key = keyOf(message);
    if (!key) return 0;
    const record = this.ensure(key, displayName(message));
    const delta = Math.round(Number(amount) || 0);
    const before = record.points;
    record.points = Math.max(0, Math.min(this.settings.maxBalance, before + delta));
    if (delta >= 0) record.earned = Math.max(0, Number(record.earned) || 0) + (record.points - before);
    else record.spent = Math.max(0, Number(record.spent) || 0) + (before - record.points);
    this.dirty = true;
    this.maybeSave(true);
    return record.points - before;
  }

  spend(message, amount) {
    const key = keyOf(message);
    if (!key) return { ok: false, reason: 'нет игрока' };
    const record = this.ensure(key, displayName(message));
    const cost = Math.round(Number(amount) || 0);
    if (cost <= 0) return { ok: true, points: record.points };
    if (record.points < cost) {
      return { ok: false, reason: 'не хватает баллов', need: cost, points: record.points };
    }
    record.points -= cost;
    record.spent = Math.max(0, Number(record.spent) || 0) + cost;
    this.dirty = true;
    this.maybeSave(true);
    return { ok: true, points: record.points };
  }

  daily(message) {
    if (!this.enabled) return { ok: false, reason: 'disabled' };
    const key = keyOf(message);
    if (!key) return { ok: false, reason: 'no-user' };
    const now = this.now();
    const record = this.ensure(key, displayName(message));
    const dayMs = 24 * 60 * 60 * 1000;
    if (now - Number(record.lastDailyAt || 0) < dayMs) {
      return {
        ok: false,
        reason: 'wait',
        waitMs: dayMs - (now - Number(record.lastDailyAt || 0))
      };
    }
    record.lastDailyAt = now;
    const before = record.points;
    record.points = Math.min(this.settings.maxBalance, before + this.settings.dailyBonus);
    record.earned = Math.max(0, Number(record.earned) || 0) + (record.points - before);
    this.dirty = true;
    this.maybeSave(true);
    return {
      ok: true,
      amount: record.points - before,
      points: record.points,
      currency: this.currency
    };
  }

  find(name) {
    const needle = String(name || '').replace(/^@/, '').toLowerCase();
    if (!needle) return null;
    const users = this.data.users;
    const keys = Object.keys(users);
    for (let i = 0; i < keys.length; i++) {
      const record = users[keys[i]];
      if (keys[i] === needle ||
          String(record.name || '').toLowerCase() === needle) return record;
    }
    return null;
  }

  transfer(fromMessage, targetName, amount) {
    if (!this.enabled) return { ok: false, reason: 'система баллов выключена' };
    const fromKey = keyOf(fromMessage);
    if (!fromKey) return { ok: false, reason: 'нет отправителя' };
    const target = this.find(targetName);
    if (!target) return { ok: false, reason: 'зритель @' + String(targetName || '').replace(/^@/, '') + ' ещё не писал в чат' };
    if (target.key === fromKey) return { ok: false, reason: 'нельзя перевести самому себе' };

    const sum = Math.round(Number(amount) || 0);
    if (sum < this.settings.transferMin) {
      return { ok: false, reason: 'минимум ' + formatNumber(this.settings.transferMin) + ' ' + this.currency };
    }
    const from = this.ensure(fromKey, displayName(fromMessage));
    if (from.points < sum) {
      return { ok: false, reason: 'не хватает ' + formatNumber(sum - from.points) + ' ' + this.currency };
    }
    from.points -= sum;
    from.spent = Math.max(0, Number(from.spent) || 0) + sum;
    target.points = Math.min(this.settings.maxBalance, target.points + sum);
    target.earned = Math.max(0, Number(target.earned) || 0) + sum;
    this.dirty = true;
    this.maybeSave(true);
    return {
      ok: true,
      amount: sum,
      target: target.name,
      points: from.points,
      currency: this.currency
    };
  }

  top(limit) {
    const users = this.data.users;
    return Object.keys(users).map(function (key) {
      const record = users[key];
      return {
        key: key,
        name: record.name || key,
        points: Math.max(0, Number(record.points) || 0)
      };
    }).filter(function (item) {
      return item.points > 0;
    }).sort(function (a, b) {
      return b.points - a.points || a.name.localeCompare(b.name);
    }).slice(0, Math.max(1, Number(limit) || 5));
  }

  total() {
    const users = this.data.users;
    return Object.keys(users).reduce(function (sum, key) {
      return sum + Math.max(0, Number(users[key].points) || 0);
    }, 0);
  }

  snapshot() {
    return {
      enabled: this.enabled,
      currency: this.currency,
      users: this.top(10),
      totalUsers: Object.keys(this.data.users).length,
      totalPoints: this.total()
    };
  }
}

module.exports = {
  Points: Points,
  DEFAULTS: DEFAULTS,
  keyOf: keyOf,
  formatNumber: formatNumber,
  merge: merge
};
