'use strict';

// Благодарности за события канала: подписки, продления, подарочные подписки,
// рейды, битсы и фоллоу (фоллоу приходят через EventSub, если есть права).

const { truncate } = require('./fsutil');

const DEFAULTS = {
  enabled: true,
  minCheerBits: 100,
  minRaidViewers: 0,
  messages: {
    sub: '💜 {user} подписался на канал! Спасибо за поддержку!',
    resub: '💜 {user} продлил подписку на {months} мес.! Спасибо!',
    gift: '🎁 {user} подарил подписку {recipient}! Спасибо!',
    massGift: '🎁 {user} подарил {count} подписок сообществу! Спасибо!',
    raid: '🚀 {user} привёл рейд из {viewers} зрителей! Добро пожаловать!',
    cheer: '💎 Спасибо за {bits} битсов, {user}!',
    follow: '👋 Спасибо за фоллоу, {user}!'
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

function formatNumber(value) {
  try { return new Intl.NumberFormat('ru-RU').format(Number(value) || 0); }
  catch (error) { return String(Number(value) || 0); }
}

class Events {
  constructor(options) {
    const opts = options || {};
    this.config = opts.config || {};
    this.log = opts.log || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
    this.send = opts.send || function () { return Promise.resolve(); };
    this.settings = this.normalize(this.config.events);
    this.stats = { subs: 0, resubs: 0, gifts: 0, raids: 0, cheers: 0, follows: 0, last: null };
  }

  normalize(raw) {
    const merged = merge(DEFAULTS, raw || {});
    return {
      enabled: merged.enabled !== false,
      minCheerBits: Math.round(clamp(merged.minCheerBits, 1, 1000000, 100)),
      minRaidViewers: Math.round(clamp(merged.minRaidViewers, 0, 1000000, 0)),
      messages: Object.assign({}, DEFAULTS.messages, isPlainObject(merged.messages) ? merged.messages : {})
    };
  }

  reload(raw) {
    this.settings = this.normalize(raw);
    return this.settings;
  }

  render(template, values) {
    return String(template || '').replace(/\{([a-z_]+)\}/gi, function (match, key) {
      const value = values[key.toLowerCase()];
      return value == null ? match : String(value);
    });
  }

  emit(name, values) {
    if (!this.settings.enabled) return null;
    const template = this.settings.messages[name];
    if (!template) return null;
    const text = truncate(this.render(template, values), 480);
    if (!text) return null;
    this.send(text).catch(function () {});
    this.stats.last = { type: name, at: Date.now(), text: text };
    return text;
  }

  handleUserNotice(data) {
    if (!data) return null;
    const type = String(data.type || '').toLowerCase();
    const user = data.user || data.login || '';
    const values = {
      user: user,
      login: data.login || '',
      months: data.months || 1,
      recipient: data.recipient || '',
      count: data.count || 1,
      viewers: formatNumber(data.viewers),
      tier: data.tier || ''
    };

    if (type === 'sub') {
      this.stats.subs += 1;
      return this.emit('sub', values);
    }
    if (type === 'resub') {
      this.stats.resubs += 1;
      return this.emit('resub', values);
    }
    if (type === 'subgift' || type === 'giftpaidupgrade') {
      this.stats.gifts += 1;
      return this.emit('gift', values);
    }
    if (type === 'submysterygift') {
      this.stats.gifts += Number(data.count) || 1;
      return this.emit('massGift', values);
    }
    if (type === 'raid') {
      if (Number(data.viewers) < this.settings.minRaidViewers) return null;
      this.stats.raids += 1;
      return this.emit('raid', values);
    }
    return null;
  }

  handleCheer(message) {
    const bits = Number(message && message.bits) || 0;
    if (bits < this.settings.minCheerBits) return null;
    this.stats.cheers += 1;
    return this.emit('cheer', {
      user: (message && (message.user || message.login)) || '',
      bits: formatNumber(bits)
    });
  }

  handleFollow(data) {
    if (!data) return null;
    this.stats.follows += 1;
    return this.emit('follow', {
      user: data.user_name || data.user_login || data.user || '',
      login: data.user_login || ''
    });
  }

  snapshot() {
    return {
      enabled: this.settings.enabled,
      stats: Object.assign({}, this.stats)
    };
  }
}

module.exports = {
  Events: Events,
  DEFAULTS: DEFAULTS
};
