'use strict';

// Синхронизация каналов/аккаунтов со встроенным чат-ботом.
// Аккуратно меняет только значения нужных свойств в bot/config.js,
// сохраняя комментарии и оформление файла.

const fs = require('node:fs');
const vm = require('node:vm');

function quote(value) {
  return "'" + String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') + "'";
}

function skipString(source, start) {
  const quoteChar = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === quoteChar) return i + 1;
    i += 1;
  }
  return i;
}

function skipComment(source, i) {
  if (source[i] === '/' && source[i + 1] === '/') {
    const nl = source.indexOf('\n', i);
    return nl === -1 ? source.length : nl + 1;
  }
  if (source[i] === '/' && source[i + 1] === '*') {
    const end = source.indexOf('*/', i + 2);
    return end === -1 ? source.length : end + 2;
  }
  return -1;
}

function findMatching(source, start) {
  const open = source[start];
  const close = open === '[' ? ']' : (open === '{' ? '}' : ')');
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/') {
      const commentEnd = skipComment(source, i);
      if (commentEnd !== -1) { i = commentEnd; continue; }
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  throw new Error('Не найден конец объекта в config.js');
}

function valueEnd(source, start) {
  const ch = source[start];
  if (ch === "'" || ch === '"' || ch === '`') return skipString(source, start);
  if (ch === '{' || ch === '[' || ch === '(') return findMatching(source, start);

  let i = start;
  while (i < source.length) {
    const current = source[i];
    if (current === '/') {
      const commentEnd = skipComment(source, i);
      if (commentEnd !== -1) { i = commentEnd; continue; }
    }
    if (current === "'" || current === '"' || current === '`') {
      i = skipString(source, i);
      continue;
    }
    if (current === '{' || current === '[' || current === '(') {
      i = findMatching(source, i);
      continue;
    }
    if (current === ',' || current === '}' || current === ']' || current === '\n') break;
    i += 1;
  }
  while (i > start && /\s/.test(source[i - 1])) i -= 1;
  return i;
}

// Ищет свойство прямо в объекте (не внутри вложенных объектов).
function findProperty(source, objectStart, objectEnd, key) {
  let depth = 0;
  let i = objectStart;

  while (i < objectEnd) {
    const ch = source[i];

    if (ch === '/') {
      const commentEnd = skipComment(source, i);
      if (commentEnd !== -1) { i = commentEnd; continue; }
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      depth -= 1;
      i += 1;
      continue;
    }

    if (depth === 1 && /[A-Za-z_$]/.test(ch)) {
      const wordStart = i;
      while (i < objectEnd && /[A-Za-z0-9_$]/.test(source[i])) i += 1;
      const word = source.slice(wordStart, i);
      if (word === key) {
        let j = i;
        while (j < objectEnd && /\s/.test(source[j])) j += 1;
        if (source[j] === ':') {
          j += 1;
          while (j < objectEnd && /\s/.test(source[j])) j += 1;
          return {
            valueStart: j,
            valueEnd: valueEnd(source, j)
          };
        }
      }
      continue;
    }

    i += 1;
  }

  return null;
}

function findExportsObject(source) {
  const match = /module\s*\.\s*exports\s*=\s*\{/.exec(source);
  if (!match) throw new Error('В config.js не найден module.exports = {');
  const start = source.indexOf('{', match.index);
  return { start: start, end: findMatching(source, start) };
}

function evaluateConfig(source, file) {
  const sandbox = {
    module: { exports: {} },
    exports: {},
    require: require,
    console: console
  };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(source, sandbox, { filename: file, timeout: 1000 });
  return sandbox.module.exports;
}

// Ссылка на YouTube для сообщений бота: конкретное видео важнее канала.
function youtubeLinkFromSettings(yt) {
  const videoId = String(yt.videoId == null ? '' : yt.videoId).trim();
  if (videoId) return 'https://www.youtube.com/watch?v=' + videoId;

  let channel = String(yt.channelId == null ? '' : yt.channelId).trim();
  if (!channel) return '';
  if (/^https?:\/\//i.test(channel)) return channel;
  if (/^(www\.)?youtube\.com\//i.test(channel)) return 'https://' + channel.replace(/^\/+/, '');
  if (channel.charAt(0) === '@') return 'https://www.youtube.com/' + channel;
  if (channel.charAt(0) === '/') return 'https://www.youtube.com' + channel;
  if (/^UC[\w-]{20,}$/i.test(channel)) return 'https://www.youtube.com/channel/' + channel;

  channel = channel.replace(/^@+/, '').replace(/^\/+/, '');
  return channel ? 'https://www.youtube.com/@' + channel : '';
}

// --- Уведомления в Telegram ------------------------------------------------
// Живут не в overlay-settings.js, а прямо в bot/config.js: их читает бот,
// а не оверлей. Поэтому для них отдельные чтение и запись.

function alertValues(raw) {
  const source = raw || {};
  return {
    enabled: source.enabled === true,
    offlineEnabled: source.offlineEnabled !== false,
    botToken: String(source.botToken == null ? '' : source.botToken).trim(),
    chatId: String(source.chatId == null ? '' : source.chatId).trim(),
    messageThreadId: String(source.messageThreadId == null ? '' : source.messageThreadId).trim()
  };
}

function readStreamAlerts(file) {
  if (!file || !fs.existsSync(file)) {
    return { ok: false, reason: 'not-found', file: file || '' };
  }

  let source = fs.readFileSync(file, 'utf8');
  if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);

  try {
    const config = evaluateConfig(source, file);
    const alerts = config.streamAlerts || {};
    const telegram = alerts.telegram || {};
    return {
      ok: true,
      file: file,
      values: alertValues({
        enabled: alerts.enabled === true,
        offlineEnabled: alerts.offlineEnabled !== false,
        botToken: telegram.botToken,
        chatId: telegram.chatId,
        messageThreadId: telegram.messageThreadId
      })
    };
  } catch (error) {
    return { ok: false, reason: 'error', file: file, message: 'config.js сейчас некорректен: ' + error.message };
  }
}

function syncStreamAlerts(raw, options) {
  const opts = options || {};
  const file = opts.file;
  const log = opts.log || function () {};

  if (!file || !fs.existsSync(file)) {
    return { ok: false, reason: 'not-found', file: file || '' };
  }

  const values = alertValues(raw);

  let source;
  let hasBom = false;
  try {
    source = fs.readFileSync(file, 'utf8');
    hasBom = source.charCodeAt(0) === 0xFEFF;
    if (hasBom) source = source.slice(1);
  } catch (error) {
    return { ok: false, reason: 'error', file: file, message: 'файл не читается' };
  }

  try {
    const root = findExportsObject(source);
    const alerts = findProperty(source, root.start, root.end, 'streamAlerts');
    if (!alerts || source[alerts.valueStart] !== '{') {
      throw new Error('в config.js не найден блок streamAlerts');
    }
    const telegram = findProperty(source, alerts.valueStart, alerts.valueEnd, 'telegram');
    if (!telegram || source[telegram.valueStart] !== '{') {
      throw new Error('в config.js не найден блок streamAlerts.telegram');
    }

    const replacements = [];

    function replace(object, start, end, key, text) {
      const prop = findProperty(source, start, end, key);
      if (!prop) throw new Error('в config.js не найдено поле ' + object + '.' + key);
      replacements.push({ start: prop.valueStart, end: prop.valueEnd, text: text });
    }

    replace('streamAlerts', alerts.valueStart, alerts.valueEnd, 'enabled', values.enabled ? 'true' : 'false');
    replace('streamAlerts', alerts.valueStart, alerts.valueEnd, 'offlineEnabled', values.offlineEnabled ? 'true' : 'false');
    replace('streamAlerts.telegram', telegram.valueStart, telegram.valueEnd, 'botToken', quote(values.botToken));
    replace('streamAlerts.telegram', telegram.valueStart, telegram.valueEnd, 'chatId', quote(values.chatId));
    replace('streamAlerts.telegram', telegram.valueStart, telegram.valueEnd, 'messageThreadId', quote(values.messageThreadId));

    replacements.sort(function (a, b) { return b.start - a.start; });
    let next = source;
    replacements.forEach(function (replacement) {
      next = next.slice(0, replacement.start) + replacement.text + next.slice(replacement.end);
    });

    const before = evaluateConfig(source, file).streamAlerts || {};
    const after = evaluateConfig(next, file).streamAlerts || {};
    const beforeTelegram = before.telegram || {};
    const afterTelegram = after.telegram || {};
    if (after.enabled !== values.enabled ||
        after.offlineEnabled !== values.offlineEnabled ||
        String(afterTelegram.botToken || '') !== values.botToken ||
        String(afterTelegram.chatId || '') !== values.chatId ||
        String(afterTelegram.messageThreadId || '') !== values.messageThreadId) {
      throw new Error('проверка streamAlerts после записи не прошла');
    }

    const changed = next !== source ||
      before.enabled !== values.enabled ||
      before.offlineEnabled !== values.offlineEnabled ||
      String(beforeTelegram.botToken || '') !== values.botToken ||
      String(beforeTelegram.chatId || '') !== values.chatId ||
      String(beforeTelegram.messageThreadId || '') !== values.messageThreadId;

    if (!changed) {
      return { ok: true, changed: false, file: file, values: values };
    }

    const backup = file + '.bak';
    try { fs.copyFileSync(file, backup); } catch (error) {
      log('bot config backup failed', error.message);
    }

    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, (hasBom ? '\ufeff' : '') + next, 'utf8');
    fs.renameSync(tmp, file);
    log('telegram alerts synced', file);
    return { ok: true, changed: true, file: file, values: values };
  } catch (error) {
    log('telegram alerts sync failed', error.message);
    return { ok: false, reason: 'error', file: file, message: error.message };
  }
}

function syncBotConfig(settings, options) {
  const opts = options || {};
  const file = opts.file;
  const log = opts.log || function () {};

  if (!file || !fs.existsSync(file)) {
    return { ok: false, reason: 'not-found', file: file || '' };
  }

  let source;
  const hasBom = (function () {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      source = raw;
      return raw.charCodeAt(0) === 0xFEFF;
    } catch (error) {
      return false;
    }
  })();

  if (!source) return { ok: false, reason: 'error', file: file, message: 'файл не читается' };
  if (hasBom) source = source.slice(1);

  let before;
  try {
    before = evaluateConfig(source, file);
  } catch (error) {
    return { ok: false, reason: 'error', file: file, message: 'config.js сейчас некорректен: ' + error.message };
  }

  try {
    const root = findExportsObject(source);
    const twitch = findProperty(source, root.start, root.end, 'twitch');
    const youtube = findProperty(source, root.start, root.end, 'youtube');

    const replacements = [];

    // В боте один Twitch-канал: берём первый из настроек оверлея.
    const channel = (settings.twitch || [])[0];
    const beforeTwitch = before.twitch || {};
    if (channel && channel !== beforeTwitch.channel && twitch && source[twitch.valueStart] === '{') {
      const prop = findProperty(source, twitch.valueStart, twitch.valueEnd, 'channel');
      if (prop) replacements.push({ start: prop.valueStart, end: prop.valueEnd, text: quote(channel) });
    }

    const yt = settings.youtube || {};
    const beforeYt = before.youtube || {};
    const ytValues = {
      channelId: String(yt.channelId == null ? '' : yt.channelId),
      videoId: String(yt.videoId == null ? '' : yt.videoId),
      apiKey: String(yt.apiKey == null ? '' : yt.apiKey)
    };
    // Одна и та же ссылка идёт в !social и в уведомления о начале/конце.
    const ytLink = String(yt.link == null ? '' : yt.link).trim() || youtubeLinkFromSettings(yt);

    if (youtube && source[youtube.valueStart] === '{') {
      Object.keys(ytValues).forEach(function (key) {
        if (beforeYt[key] === ytValues[key]) return;
        const prop = findProperty(source, youtube.valueStart, youtube.valueEnd, key);
        if (prop) {
          replacements.push({ start: prop.valueStart, end: prop.valueEnd, text: quote(ytValues[key]) });
        }
      });
    }

    const beforeSocials = before.socials || {};
    const socials = findProperty(source, root.start, root.end, 'socials');
    let socialsYoutube = false;
    if (socials && source[socials.valueStart] === '{') {
      const prop = findProperty(source, socials.valueStart, socials.valueEnd, 'youtube');
      if (prop) {
        socialsYoutube = true;
        if (String(beforeSocials.youtube == null ? '' : beforeSocials.youtube) !== ytLink) {
          replacements.push({ start: prop.valueStart, end: prop.valueEnd, text: quote(ytLink) });
        }
      }
    }

    const beforeAlerts = before.streamAlerts || {};
    const alerts = findProperty(source, root.start, root.end, 'streamAlerts');
    let alertsYoutube = false;
    if (alerts && source[alerts.valueStart] === '{') {
      const prop = findProperty(source, alerts.valueStart, alerts.valueEnd, 'youtube');
      if (prop) {
        alertsYoutube = true;
        if (String(beforeAlerts.youtube == null ? '' : beforeAlerts.youtube) !== ytLink) {
          replacements.push({ start: prop.valueStart, end: prop.valueEnd, text: quote(ytLink) });
        }
      }
    }

    if (!replacements.length) {
      return { ok: true, changed: false, file: file };
    }

    replacements.sort(function (a, b) { return b.start - a.start; });
    replacements.forEach(function (replacement) {
      source = source.slice(0, replacement.start) + replacement.text + source.slice(replacement.end);
    });

    const after = evaluateConfig(source, file);
    if (channel && after.twitch && after.twitch.channel !== channel) {
      throw new Error('проверка twitch.channel не прошла');
    }
    const afterYt = after.youtube || {};
    Object.keys(ytValues).forEach(function (key) {
      if (afterYt[key] !== ytValues[key]) {
        throw new Error('проверка youtube.' + key + ' не прошла');
      }
    });
    if (socialsYoutube && (!after.socials || after.socials.youtube !== ytLink)) {
      throw new Error('проверка socials.youtube не прошла');
    }
    if (alertsYoutube && (!after.streamAlerts || after.streamAlerts.youtube !== ytLink)) {
      throw new Error('проверка streamAlerts.youtube не прошла');
    }

    const backup = file + '.bak';
    try { fs.copyFileSync(file, backup); } catch (error) {
      log('bot config backup failed', error.message);
    }

    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, (hasBom ? '\ufeff' : '') + source, 'utf8');
    fs.renameSync(tmp, file);
    log('bot config synced', file);
    return { ok: true, changed: true, file: file };
  } catch (error) {
    log('bot config sync failed', error.message);
    return { ok: false, reason: 'error', file: file, message: error.message };
  }
}

module.exports = {
  syncBotConfig: syncBotConfig,
  readStreamAlerts: readStreamAlerts,
  syncStreamAlerts: syncStreamAlerts,
  // для тестов
  _findExportsObject: findExportsObject,
  _findProperty: findProperty,
  _evaluateConfig: evaluateConfig
};
