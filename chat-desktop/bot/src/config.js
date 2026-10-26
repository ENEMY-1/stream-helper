'use strict';

// Загрузка config.js, значения по умолчанию и проверка настроек.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const DEFAULTS = {
  twitch: {
    channel: '',
    clientId: '',
    clientSecret: '',
    botUsername: ''
  },
  youtube: {
    enabled: true,
    channelId: '',
    videoId: '',
    apiKey: '',
    useRelay: true,
    relayUrl: 'http://127.0.0.1:38999',
    allBudgetUnits: 8500,
    replyBudgetUnits: 1000,
    minReplyIntervalMs: 6000
  },
  bot: {
    prefix: '!',
    globalCooldownMs: 1200,
    commandCooldownMs: 5000,
    userCooldownMs: 15000,
    maxRepliesPerMinute: 10,
    maxReplyLength: { twitch: 480, youtube: 200 },
    ignore: ['nightbot', 'streamelements', 'moobot', 'fossabot', 'sery_bot', 'soundalerts'],
    activityWindowMinutes: 10
  },
  replies: {},
  socials: {},
  commands: [],
  timers: [],
  timersSettings: { minGapMs: 120000 },
  moderation: {
    enabled: true,
    deleteMessages: true,
    warnInChat: true,
    exempt: { mods: true, broadcaster: true, subscribers: true, vips: true, users: [] },
    bannedWords: { enabled: true, match: 'word', words: [] },
    links: { enabled: true, allow: [], useSocials: true },
    caps: { enabled: true, minLength: 12, percent: 70 },
    spam: {
      enabled: true, maxMessages: 5, windowSec: 10,
      duplicateCount: 3, duplicateWindowSec: 30, maxLength: 400
    },
    punishment: {
      enabled: true, timeoutAfter: 2, timeoutSec: 300,
      banAfter: 6, strikeWindowMin: 30, reason: 'нарушение правил чата'
    }
  },
  points: {
    enabled: true,
    currency: 'балл',
    perMessage: 1,
    messageCooldownSec: 60,
    dailyBonus: 50,
    transferMin: 10,
    maxBalance: 1000000
  },
  giveaways: {
    enabled: true,
    defaultMinutes: 5,
    defaultWinners: 1,
    entryCost: 0,
    allowMultiple: false,
    messages: {}
  },
  quiz: {
    enabled: true,
    questionSeconds: 60,
    betweenSeconds: 15,
    hintAfterSeconds: 30,
    rewardPoints: 25,
    maxQuestions: 0,
    questions: []
  },
  events: {
    enabled: true,
    minCheerBits: 100,
    minRaidViewers: 0,
    messages: {}
  },
  streamAlerts: {
    enabled: false,
    offlineEnabled: true,
    checkIntervalSec: 60,
    maxStartAgeMinutes: 0,
    silent: false,
    sendPreview: true,
    youtube: '',
    message: '',
    offlineMessage: '',
    telegram: { botToken: '', chatId: '', messageThreadId: '' }
  }
};

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, extra) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  if (!isPlainObject(extra)) return out;
  Object.keys(extra).forEach(function (key) {
    const value = extra[key];
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = merge(out[key], value);
    } else {
      out[key] = value;
    }
  });
  return out;
}

function normalizeChannel(value) {
  return String(value || '').trim().replace(/^[#@]+/, '').toLowerCase();
}

function loadConfig(options) {
  const opts = options || {};
  const file = opts.file ? path.resolve(opts.file) : path.join(ROOT, 'config.js');

  if (!fs.existsSync(file)) {
    throw new Error('Не найден файл настроек: ' + file);
  }

  delete require.cache[require.resolve(file)];
  const userConfig = require(file);
  const config = merge(DEFAULTS, userConfig);

  config.twitch.channel = normalizeChannel(config.twitch.channel);
  config.twitch.clientId = String(config.twitch.clientId || '').trim();
  config.twitch.clientSecret = String(config.twitch.clientSecret || '').trim();
  config.twitch.botUsername = normalizeChannel(config.twitch.botUsername);
  config.youtube.channelId = String(config.youtube.channelId || '').trim();
  config.youtube.videoId = String(config.youtube.videoId || '').trim();
  config.youtube.apiKey = String(config.youtube.apiKey || '').trim();
  config.youtube.relayUrl = String(config.youtube.relayUrl || '').replace(/\/+$/, '');
  config.youtube.enabled = config.youtube.enabled !== false;
  config.youtube.useRelay = config.youtube.useRelay !== false;

  ['moderation', 'points', 'giveaways', 'quiz', 'events'].forEach(function (key) {
    if (!isPlainObject(config[key])) config[key] = merge(DEFAULTS[key], {});
  });

  if (!config.streamAlerts || typeof config.streamAlerts !== 'object') {
    config.streamAlerts = merge(DEFAULTS.streamAlerts, {});
  }
  const alerts = config.streamAlerts;
  if (!alerts.telegram || typeof alerts.telegram !== 'object') {
    alerts.telegram = merge(DEFAULTS.streamAlerts.telegram, {});
  }
  alerts.enabled = alerts.enabled === true;
  alerts.offlineEnabled = alerts.offlineEnabled !== false;
  const interval = Number(alerts.checkIntervalSec);
  alerts.checkIntervalSec = Number.isFinite(interval)
    ? Math.min(600, Math.max(20, Math.round(interval)))
    : 60;
  const maxAge = Number(alerts.maxStartAgeMinutes);
  alerts.maxStartAgeMinutes = Number.isFinite(maxAge) && maxAge > 0 ? Math.round(maxAge) : 0;
  alerts.silent = alerts.silent === true;
  alerts.sendPreview = alerts.sendPreview !== false;
  alerts.youtube = String(alerts.youtube || '').trim();
  alerts.message = String(alerts.message || '').trim();
  alerts.offlineMessage = String(alerts.offlineMessage || '').trim();
  alerts.telegram.botToken = String(alerts.telegram.botToken || '').trim();
  alerts.telegram.chatId = String(alerts.telegram.chatId || '').trim();
  alerts.telegram.messageThreadId = String(alerts.telegram.messageThreadId || '').trim();
  if (process.env.TELEGRAM_BOT_TOKEN) alerts.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN.trim();
  if (process.env.TELEGRAM_CHAT_ID) alerts.telegram.chatId = process.env.TELEGRAM_CHAT_ID.trim();

  config.paths = {
    root: ROOT,
    data: path.join(ROOT, 'data'),
    tokens: path.join(ROOT, 'data', 'tokens.json'),
    google: path.join(ROOT, 'data', 'google-oauth.json'),
    state: path.join(ROOT, 'data', 'state.json'),
    points: path.join(ROOT, 'data', 'points.json'),
    quota: path.join(ROOT, 'data', 'quota.json'),
    log: path.join(ROOT, 'data', 'bot.log')
  };
  config.configFile = file;

  const problems = [];
  if (!config.twitch.channel) problems.push('не задан twitch.channel');
  if (config.youtube.enabled && !config.youtube.channelId && !config.youtube.videoId) {
    problems.push('не задан youtube.channelId или youtube.videoId');
  }
  if (alerts.enabled && !alerts.telegram.botToken) {
    problems.push('не задан streamAlerts.telegram.botToken');
  }
  if (alerts.enabled && !alerts.telegram.chatId) {
    problems.push('не задан streamAlerts.telegram.chatId');
  }
  config.problems = problems;

  return config;
}

module.exports = {
  ROOT: ROOT,
  DEFAULTS: DEFAULTS,
  loadConfig: loadConfig,
  merge: merge
};
