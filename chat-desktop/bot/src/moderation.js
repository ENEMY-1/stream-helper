'use strict';

// Модерация чата: спам, запрещённые слова, сторонние ссылки и капс.
// Наказания выдаются через команды Twitch-чата (/delete, /timeout, /ban),
// поэтому отдельные OAuth-права не нужны — достаточно, чтобы бот был
// модератором канала (или вёл канал сам).

const { truncate } = require('./fsutil');

const DEFAULT_ALLOWED = [
  'twitch.tv', 'youtube.com', 'youtu.be', 'discord.gg', 'discord.com',
  't.me', 'telegram.me', 'vk.com', 'boosty.to', 'tiktok.com', 'instagram.com'
];

const DEFAULTS = {
  enabled: true,
  deleteMessages: true,
  warnInChat: true,
  exempt: {
    mods: true,
    broadcaster: true,
    subscribers: true,
    vips: true,
    users: []
  },
  bannedWords: {
    enabled: true,
    match: 'word',
    words: []
  },
  links: {
    enabled: true,
    allow: DEFAULT_ALLOWED.slice(),
    useSocials: true
  },
  caps: {
    enabled: true,
    minLength: 12,
    percent: 70
  },
  spam: {
    enabled: true,
    maxMessages: 5,
    windowSec: 10,
    duplicateCount: 3,
    duplicateWindowSec: 30,
    maxLength: 400
  },
  punishment: {
    enabled: true,
    timeoutAfter: 2,
    timeoutSec: 300,
    banAfter: 6,
    strikeWindowMin: 30,
    reason: 'нарушение правил чата'
  }
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, extra) {
  const out = isPlainObject(base) ? Object.assign({}, base) : {};
  if (!isPlainObject(extra)) return out;
  Object.keys(extra).forEach(function (key) {
    const value = extra[key];
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = merge(out[key], value);
    else out[key] = value;
  });
  return out;
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function onlyWords(value) {
  return ' ' + normalizeText(value).replace(/[^\p{L}\p{N}_]+/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
}

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[\n,]+/);
  return [];
}

function cleanWords(list, limit) {
  return toArray(list).map(function (item) {
    return String(item == null ? '' : item).trim();
  }).filter(function (item, index, all) {
    return item && item.length <= 60 && all.indexOf(item) === index;
  }).slice(0, limit || 300);
}

function cleanDomains(list) {
  return toArray(list).map(function (item) {
    return String(item == null ? '' : item).trim().toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .split(':')[0]
      .replace(/\.+$/, '');
  }).filter(function (item, index, all) {
    return item && /^[a-zа-яё0-9.-]+$/.test(item) && all.indexOf(item) === index;
  }).slice(0, 300);
}

function userKey(message) {
  return String(message.userId || message.login || message.user || '').toLowerCase();
}

function urlDomains(text) {
  const source = String(text || '');
  const re = /(?:https?:\/\/|www\.)[^\s<>()]+|(?:[a-zа-яё0-9](?:[a-zа-яё0-9-]*[a-zа-яё0-9])?\.)+(?:[a-zа-яё]{2,})(?::\d+)?(?:\/[^\s<>()]*)?/gi;
  const found = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    const value = match[0].toLowerCase()
      .replace(/^[a-z]+:\/\//, '')
      .replace(/^www\./, '');
    const domain = value.split('/')[0].split(':')[0].replace(/[.,;!?]+$/, '');
    if (domain && domain.indexOf('.') !== -1) found.push(domain);
  }
  return found;
}

class Moderation {
  constructor(options) {
    const opts = options || {};
    this.config = opts.config || {};
    this.log = opts.log || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
    this.now = opts.now || Date.now;
    this.actions = opts.actions || {};
    this.state = opts.state || {};
    this.onSave = opts.onSave || function () {};

    this.settings = this.normalize(this.config.moderation);
    this.history = new Map();
    this.lastMessageId = new Map();
    this.warnedAt = new Map();

    if (!this.state.moderation || !isPlainObject(this.state.moderation)) this.state.moderation = {};
    if (!isPlainObject(this.state.moderation.strikes)) this.state.moderation.strikes = {};
    this.strikes = this.state.moderation.strikes;
    this.stats = {
      messages: 0,
      deleted: 0,
      timeouts: 0,
      bans: 0,
      unbans: 0,
      violations: 0,
      warnings: 0,
      lastAction: null
    };
  }

  normalize(raw) {
    const merged = merge(DEFAULTS, raw || {});
    const exempt = merged.exempt || {};
    const banned = merged.bannedWords || {};
    const links = merged.links || {};
    const caps = merged.caps || {};
    const spam = merged.spam || {};
    const punishment = merged.punishment || {};

    return {
      enabled: merged.enabled !== false,
      deleteMessages: merged.deleteMessages !== false,
      warnInChat: merged.warnInChat !== false,
      exempt: {
        mods: exempt.mods !== false,
        broadcaster: exempt.broadcaster !== false,
        subscribers: exempt.subscribers !== false,
        vips: exempt.vips !== false,
        users: cleanWords(exempt.users, 200)
      },
      bannedWords: {
        enabled: banned.enabled !== false,
        match: banned.match === 'substring' ? 'substring' : 'word',
        words: cleanWords(banned.words, 500)
      },
      links: {
        enabled: links.enabled !== false,
        allow: cleanDomains(links.allow),
        useSocials: links.useSocials !== false
      },
      caps: {
        enabled: caps.enabled !== false,
        minLength: Math.round(clamp(caps.minLength, 1, 200, 12)),
        percent: Math.round(clamp(caps.percent, 1, 100, 70))
      },
      spam: {
        enabled: spam.enabled !== false,
        maxMessages: Math.round(clamp(spam.maxMessages, 2, 100, 5)),
        windowSec: Math.round(clamp(spam.windowSec, 1, 300, 10)),
        duplicateCount: Math.round(clamp(spam.duplicateCount, 2, 100, 3)),
        duplicateWindowSec: Math.round(clamp(spam.duplicateWindowSec, 1, 600, 30)),
        maxLength: Math.round(clamp(spam.maxLength, 50, 500, 400))
      },
      punishment: {
        enabled: punishment.enabled !== false,
        timeoutAfter: Math.round(clamp(punishment.timeoutAfter, 1, 50, 2)),
        timeoutSec: Math.round(clamp(punishment.timeoutSec, 1, 1209600, 300)),
        banAfter: Math.round(clamp(punishment.banAfter, 0, 100, 6)),
        strikeWindowMin: Math.round(clamp(punishment.strikeWindowMin, 1, 1440, 30)),
        reason: truncate(punishment.reason || 'нарушение правил чата', 60)
      }
    };
  }

  reload(raw) {
    this.settings = this.normalize(raw);
    return this.settings;
  }

  allowedDomains() {
    const list = (this.settings.links.allow || []).slice();
    if (this.settings.links.useSocials) {
      const socials = this.config.socials || {};
      Object.keys(socials).forEach(function (key) {
        const value = String(socials[key] || '');
        if (!value) return;
        const match = value.match(/^[a-z]+:\/\/([^/]+)/i);
        if (match) {
          list.push(match[1].toLowerCase().replace(/^www\./, '').split(':')[0]);
        }
      });
    }
    return cleanDomains(list);
  }

  isDomainAllowed(domain) {
    return this.allowedDomains().some(function (allowed) {
      return domain === allowed || domain.endsWith('.' + allowed);
    });
  }

  isExempt(message) {
    const exempt = this.settings.exempt;
    if (!message) return false;
    if (exempt.broadcaster && message.isBroadcaster) return true;
    if (exempt.mods && message.isMod) return true;
    if (exempt.subscribers && message.isSubscriber) return true;
    if (exempt.vips && message.isVip) return true;
    const users = new Set((exempt.users || []).map(function (item) { return String(item).toLowerCase(); }));
    return users.has(String(message.login || '').toLowerCase()) ||
      users.has(String(message.user || '').toLowerCase());
  }

  pruneHistory(key, now) {
    const list = this.history.get(key) || [];
    const windowMs = Math.max(this.settings.spam.windowSec, this.settings.spam.duplicateWindowSec) * 1000;
    const fresh = list.filter(function (item) { return now - item.at <= windowMs; });
    this.history.set(key, fresh);
    return fresh;
  }

  noteHistory(key, message, now, text) {
    const list = this.pruneHistory(key, now);
    list.push({ at: now, text: normalizeText(text) });
    if (list.length > 60) list.splice(0, list.length - 60);
    this.history.set(key, list);
    return list;
  }

  addStrike(key, message, now) {
    const windowMs = this.settings.punishment.strikeWindowMin * 60000;
    let record = this.strikes[key];
    if (!record || !Number.isFinite(Number(record.lastAt)) || now - Number(record.lastAt) > windowMs) {
      record = { count: 0, firstAt: now, lastAt: now, name: message.user || message.login || '' };
    }
    record.count = (Number(record.count) || 0) + 1;
    record.lastAt = now;
    record.name = message.user || message.login || record.name || '';
    this.strikes[key] = record;
    return record;
  }

  cleanStrikes(now) {
    const windowMs = this.settings.punishment.strikeWindowMin * 60000;
    const strikes = this.strikes;
    Object.keys(strikes).forEach(function (key) {
      const record = strikes[key];
      if (!record || now - Number(record.lastAt || 0) > windowMs) delete strikes[key];
    });
  }

  checkBannedWords(text) {
    if (!this.settings.bannedWords.enabled) return '';
    const haystack = normalizeText(text);
    const haystackWords = onlyWords(text);
    const words = this.settings.bannedWords.words || [];
    for (let i = 0; i < words.length; i++) {
      const word = normalizeText(words[i]);
      if (!word) continue;
      if (this.settings.bannedWords.match === 'substring') {
        if (haystack.indexOf(word) !== -1) return words[i];
      } else if (haystackWords.indexOf(' ' + word + ' ') !== -1) {
        return words[i];
      }
    }
    return '';
  }

  checkLinks(text) {
    if (!this.settings.links.enabled) return '';
    const domains = urlDomains(text);
    for (let i = 0; i < domains.length; i++) {
      if (!this.isDomainAllowed(domains[i])) return domains[i];
    }
    return '';
  }

  checkCaps(text) {
    if (!this.settings.caps.enabled) return false;
    const clean = String(text || '').replace(/(?:https?:\/\/|www\.)\S+/gi, ' ');
    const letters = clean.match(/\p{L}/gu) || [];
    if (letters.length < this.settings.caps.minLength) return false;
    const upper = clean.match(/\p{Lu}/gu) || [];
    return upper.length / letters.length * 100 >= this.settings.caps.percent;
  }

  checkSpam(key, message, text, now) {
    if (!this.settings.spam.enabled) return '';
    const list = this.noteHistory(key, message, now, text);
    const spam = this.settings.spam;

    if (text.length > spam.maxLength) return 'too-long';
    if (/(?:[\u{1F300}-\u{1FAFF}]\s*){10,}/u.test(text)) return 'emoji-spam';
    if (/([^\s])\1{11,}/u.test(text)) return 'repeat-chars';

    const windowMs = spam.windowSec * 1000;
    const recent = list.filter(function (item) { return now - item.at <= windowMs; });
    if (recent.length >= spam.maxMessages) return 'too-fast';

    const duplicateMs = spam.duplicateWindowSec * 1000;
    const normalized = normalizeText(text);
    const duplicates = list.filter(function (item) {
      return now - item.at <= duplicateMs && item.text === normalized;
    });
    if (duplicates.length >= spam.duplicateCount) return 'duplicate';

    return '';
  }

  inspect(message) {
    if (!this.settings.enabled) return null;
    if (!message || !message.text) return null;
    if (this.isExempt(message)) return null;

    const key = userKey(message);
    if (!key) return null;
    const now = this.now();
    const text = String(message.text);

    const word = this.checkBannedWords(text);
    if (word) return { category: 'banned-word', detail: word, reason: 'запрещённое слово' };

    const domain = this.checkLinks(text);
    if (domain) return { category: 'link', detail: domain, reason: 'сторонняя ссылка' };

    const spam = this.checkSpam(key, message, text, now);
    if (spam) {
      const reason = spam === 'duplicate' || spam === 'repeat-chars' || spam === 'emoji-spam'
        ? 'спам'
        : (spam === 'too-long' ? 'слишком длинное сообщение' : 'флуд');
      return { category: 'spam', detail: spam, reason: reason };
    }

    if (this.checkCaps(text)) return { category: 'caps', detail: '', reason: 'слишком много капса' };

    return null;
  }

  warn(message, text) {
    if (!this.settings.warnInChat || typeof this.actions.reply !== 'function') return;
    const key = userKey(message);
    const now = this.now();
    if (now - (this.warnedAt.get(key) || 0) < 60000) return;
    this.warnedAt.set(key, now);
    this.stats.warnings += 1;
    this.actions.reply(truncate(text, 400));
  }

  handle(message) {
    this.stats.messages += 1;
    if (!message) return { action: 'none' };
    const key = userKey(message);
    if (key && message.id) this.lastMessageId.set(key, message.id);
    if (!key) return { action: 'none' };

    const verdict = this.inspect(message);
    if (!verdict) return { action: 'none' };

    const now = this.now();
    const punishment = this.settings.punishment;
    const strike = this.addStrike(key, message, now);
    this.cleanStrikes(now);
    this.stats.violations += 1;

    if (this.settings.deleteMessages && message.id && typeof this.actions.deleteMessage === 'function') {
      this.actions.deleteMessage(message.id);
      this.stats.deleted += 1;
    }

    let action = 'delete';
    let durationSec = 0;
    const login = String(message.login || message.user || '').toLowerCase();

    if (punishment.enabled && login) {
      if (punishment.banAfter > 0 && strike.count >= punishment.banAfter) {
        if (typeof this.actions.ban === 'function') {
          this.actions.ban(login, punishment.reason);
          this.stats.bans += 1;
          action = 'ban';
        }
      } else if (punishment.timeoutAfter > 0 && strike.count >= punishment.timeoutAfter) {
        const extra = Math.max(0, strike.count - punishment.timeoutAfter);
        durationSec = Math.min(1209600, punishment.timeoutSec * (extra + 1));
        if (typeof this.actions.timeout === 'function') {
          this.actions.timeout(login, durationSec, punishment.reason);
          this.stats.timeouts += 1;
          action = 'timeout';
        }
      }
    }

    if (action !== 'ban') {
      const template = action === 'timeout'
        ? '⚠️ {user}, {reason}. Мут на {seconds} сек.'
        : '⚠️ {user}, {reason}. Сообщение удалено.';
      this.warn(message, template
        .replace('{user}', message.user || message.login || '')
        .replace('{reason}', verdict.reason)
        .replace('{seconds}', String(durationSec)));
    }

    this.stats.lastAction = {
      at: now,
      user: message.user || message.login || '',
      action: action,
      category: verdict.category,
      detail: verdict.detail || '',
      reason: verdict.reason,
      strikes: strike.count,
      seconds: durationSec
    };

    this.state.moderation.lastAction = this.stats.lastAction;
    this.state.moderation.stats = Object.assign({}, this.state.moderation.stats || {}, this.stats);
    this.onSave();

    this.log.info('Модерация: ' + action + ' — ' + (message.user || login) +
      ' (' + verdict.category + '), страйк ' + strike.count + '/' + punishment.banAfter);

    return {
      action: action,
      category: verdict.category,
      reason: verdict.reason,
      detail: verdict.detail || '',
      strikes: strike.count,
      durationSec: durationSec
    };
  }

  manual(message) {
    const parts = String((message && message.text) || '').trim().split(/\s+/);
    const command = String(parts[0] || '').replace(/^[!#/]+/, '').toLowerCase();
    const args = parts.slice(1);
    const target = String(args[0] || '').replace(/^@/, '').toLowerCase();
    const reason = args.slice(1).join(' ').slice(0, 200);

    if (command === 'modstats') {
      return '🛡 Удалено: ' + this.stats.deleted + ' · таймаутов: ' + this.stats.timeouts +
        ' · банов: ' + this.stats.bans + ' · нарушений: ' + this.stats.violations;
    }

    if (!target) return 'Напиши ник: !' + command + ' <ник> [причина]';

    if (command === 'ban') {
      if (typeof this.actions.ban !== 'function') return 'Наказания сейчас недоступны.';
      this.actions.ban(target, reason || this.settings.punishment.reason);
      this.stats.bans += 1;
      this.onSave();
      return 'Забанен @' + target + (reason ? ': ' + reason : '');
    }

    if (command === 'unban') {
      if (typeof this.actions.unban !== 'function') return 'Наказания сейчас недоступны.';
      this.actions.unban(target);
      this.stats.unbans += 1;
      this.onSave();
      return 'Разбанен @' + target;
    }

    if (command === 'timeout') {
      const seconds = Math.min(1209600, Math.max(1, Number(args[1]) || this.settings.punishment.timeoutSec));
      const why = args.slice(2).join(' ').slice(0, 200) || this.settings.punishment.reason;
      if (typeof this.actions.timeout !== 'function') return 'Наказания сейчас недоступны.';
      this.actions.timeout(target, seconds, why);
      this.stats.timeouts += 1;
      this.onSave();
      return 'Мут @' + target + ' на ' + seconds + ' сек.: ' + why;
    }

    if (command === 'delete') {
      const id = /^\d+$/.test(target) ? target : this.lastMessageId.get(target);
      if (!id) return 'Не нашёл сообщение @' + target + ' для удаления.';
      if (typeof this.actions.deleteMessage !== 'function') return 'Удаление сейчас недоступно.';
      this.actions.deleteMessage(id);
      this.stats.deleted += 1;
      this.onSave();
      return 'Сообщение @' + target + ' удалено.';
    }

    return 'Команды модерации: !ban, !timeout, !unban, !delete, !modstats';
  }

  snapshot() {
    return {
      enabled: this.settings.enabled,
      stats: Object.assign({}, this.stats),
      words: this.settings.bannedWords.words.length,
      allowed: this.settings.links.allow.length
    };
  }
}

module.exports = {
  Moderation: Moderation,
  DEFAULTS: DEFAULTS,
  DEFAULT_ALLOWED: DEFAULT_ALLOWED,
  normalizeText: normalizeText,
  urlDomains: urlDomains,
  cleanWords: cleanWords,
  cleanDomains: cleanDomains
};
