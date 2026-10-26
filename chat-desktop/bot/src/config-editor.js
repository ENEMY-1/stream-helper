'use strict';

// Редактор config.js для веб-панели.
// Меняет только нужный раздел, остальные комментарии и настройки остаются как были.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { RESERVED_NAMES } = require('./engine');
const { Moderation } = require('./moderation');
const { Points } = require('./points');
const { Giveaway } = require('./giveaway');
const { Quiz } = require('./quiz');
const { Events } = require('./events');

const SILENT = { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };

const NAME_RE = /^[a-zа-яё0-9_-]{1,32}$/i;
const PLATFORMS = ['twitch', 'youtube'];
const PERMISSIONS = ['everyone', 'mod', 'broadcaster'];
const SOCIAL_KEYS = ['youtube', 'twitch', 'discord', 'telegram', 'vk', 'boosty', 'tiktok', 'instagram'];
const MAX_COMMANDS = 80;
const MAX_ALIASES = 10;
const MAX_REPLY = 480;
const MAX_TIMERS = 20;
const MAX_TIMER_MINUTES = 1440;
const MAX_SOCIAL_LENGTH = 300;

const COMMAND_KEYS = new Set([
  'name', 'aliases', 'reply', 'permission', 'platforms',
  'cooldownMs', 'enabled'
]);
const TIMER_KEYS = new Set(['id', 'text', 'everyMinutes', 'platforms', 'enabled']);

class ValidationError extends Error {
  constructor(message, fields) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.fields = fields || {};
  }
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function trim(value) {
  return String(value == null ? '' : value).trim();
}

function normalizeToken(value) {
  return trim(value).replace(/^[!#]+/, '').toLowerCase();
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return value.split(/[,\s]+/);
  return [];
}

function jsonSafe(value, depth) {
  const level = Number(depth) || 0;
  if (level > 5) return undefined;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map(function (item) { return jsonSafe(item, level + 1); })
      .filter(function (item) { return item !== undefined; });
  }
  if (isPlainObject(value)) {
    const out = {};
    Object.keys(value).forEach(function (key) {
      const item = jsonSafe(value[key], level + 1);
      if (item !== undefined) out[key] = item;
    });
    return out;
  }
  return undefined;
}

function normalizePlatforms(raw, options) {
  const opts = options || {};
  const list = asList(raw).map(function (item) { return trim(item).toLowerCase(); })
    .filter(function (item) { return PLATFORMS.indexOf(item) !== -1; });
  const platforms = Array.from(new Set(list));
  if (!platforms.length) {
    throw new ValidationError('Выбери хотя бы одну платформу', { platforms: 'Нужна хотя бы одна платформа' });
  }
  if (platforms.indexOf('youtube') !== -1 && opts.youtubeEnabled === false) {
    throw new ValidationError(
      'YouTube выключен в config.js — команда не сможет там работать',
      { platforms: 'Сначала включи YouTube в config.js' }
    );
  }
  return platforms;
}

function replyLimitFor(platforms) {
  return platforms.indexOf('youtube') !== -1 ? 200 : MAX_REPLY;
}

function normalizeCommand(raw, index, options) {
  const number = index + 1;
  if (!isPlainObject(raw)) {
    throw new ValidationError('Команда #' + number + ' повреждена', {});
  }

  const name = normalizeToken(raw.name);
  if (!name) {
    throw new ValidationError('Укажи имя команды', { name: 'Введи имя команды' });
  }
  if (!NAME_RE.test(name)) {
    throw new ValidationError(
      'Имя «' + name + '» не подходит',
      { name: 'Только буквы, цифры, _ и -, до 32 символов' }
    );
  }
  if (RESERVED_NAMES.has(name)) {
    throw new ValidationError(
      '«!' + name + '» — встроенная команда, её имя занять нельзя',
      { name: 'Это имя уже занято встроенной командой' }
    );
  }

  const aliases = [];
  asList(raw.aliases).forEach(function (item) {
    const alias = normalizeToken(item);
    if (!alias || alias === name) return;
    if (!NAME_RE.test(alias)) {
      throw new ValidationError(
        'Алиас «' + alias + '» не подходит',
        { aliases: 'Только буквы, цифры, _ и -, до 32 символов' }
      );
    }
    if (RESERVED_NAMES.has(alias)) {
      throw new ValidationError(
        '«!' + alias + '» — встроенная команда, её нельзя использовать как алиас',
        { aliases: 'Этот алиас занят встроенной командой' }
      );
    }
    if (aliases.indexOf(alias) === -1) aliases.push(alias);
  });
  if (aliases.length > MAX_ALIASES) {
    throw new ValidationError('Слишком много алиасов (максимум ' + MAX_ALIASES + ')', {
      aliases: 'Оставь не больше ' + MAX_ALIASES + ' алиасов'
    });
  }

  const platforms = normalizePlatforms(
    (raw.platforms && raw.platforms.length) ? raw.platforms : ['twitch'],
    options
  );
  const limit = replyLimitFor(platforms);

  const reply = trim(raw.reply);
  if (!reply) {
    throw new ValidationError('У команды !' + name + ' пустой ответ', {
      reply: 'Напиши текст ответа'
    });
  }
  if (reply.length > limit) {
    throw new ValidationError(
      'Ответ команды !' + name + ' длиннее ' + limit + ' символов',
      { reply: 'Сократи ответ до ' + limit + ' символов' }
    );
  }

  let permission = trim(raw.permission || 'everyone').toLowerCase();
  if (PERMISSIONS.indexOf(permission) === -1) {
    throw new ValidationError('Неизвестные права доступа: ' + permission, {
      permission: 'Выбери «Все», «Модераторы» или «Стример»'
    });
  }

  let cooldownMs;
  if (raw.cooldownMs !== '' && raw.cooldownMs != null && Number(raw.cooldownMs) !== 0) {
    cooldownMs = Number(raw.cooldownMs);
    if (!Number.isFinite(cooldownMs) || cooldownMs < 1000 || cooldownMs > 3600000) {
      throw new ValidationError('Задержка должна быть от 1 до 3600 секунд', {
        cooldownMs: 'От 1 до 3600 секунд'
      });
    }
    cooldownMs = Math.round(cooldownMs);
  }

  const command = {
    name: name,
    aliases: aliases,
    reply: reply,
    permission: permission,
    platforms: platforms
  };
  if (cooldownMs) command.cooldownMs = cooldownMs;
  command.enabled = raw.enabled !== false;

  Object.keys(raw).forEach(function (key) {
    if (COMMAND_KEYS.has(key)) return;
    const extra = jsonSafe(raw[key]);
    if (extra !== undefined) command[key] = extra;
  });

  return command;
}

function validateCommands(rawList, options) {
  if (!Array.isArray(rawList)) {
    throw new ValidationError('Список команд должен быть массивом', {});
  }
  if (rawList.length > MAX_COMMANDS) {
    throw new ValidationError('Слишком много команд (максимум ' + MAX_COMMANDS + ')', {});
  }

  const commands = rawList.map(function (raw, index) {
    return normalizeCommand(raw, index, options);
  });

  const names = new Map();
  commands.forEach(function (command, index) {
    if (names.has(command.name)) {
      throw new ValidationError(
        'Команда !' + command.name + ' встречается дважды (#' + (index + 1) + ')',
        { name: 'Такая команда уже есть' }
      );
    }
    names.set(command.name, index);
  });

  const tokens = new Map();
  commands.forEach(function (command, index) {
    tokens.set(command.name, { index: index, field: 'name' });
  });
  commands.forEach(function (command, index) {
    command.aliases.forEach(function (alias) {
      if (tokens.has(alias)) {
        throw new ValidationError(
          'Алиас «' + alias + '» у команды !' + command.name + ' уже занят',
          { aliases: 'Алиас «' + alias + '» уже используется' }
        );
      }
      tokens.set(alias, { index: index, field: 'aliases' });
    });
  });

  return commands;
}

function uniqueTimerId(raw, index, used) {
  let base = trim(raw).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!base) base = 'timer-' + (index + 1);
  base = base.slice(0, 40);
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = base + '-' + suffix;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function normalizeTimer(raw, index, options, usedIds) {
  const number = index + 1;
  if (!isPlainObject(raw)) {
    throw new ValidationError('Автосообщение #' + number + ' повреждено', {});
  }

  const platforms = normalizePlatforms(
    (raw.platforms && raw.platforms.length) ? raw.platforms : ['twitch'],
    options
  );
  const limit = replyLimitFor(platforms);

  const text = trim(raw.text);
  if (!text) {
    throw new ValidationError('У автосообщения #' + number + ' пустой текст', {
      text: 'Напиши текст автосообщения'
    });
  }
  if (text.length > limit) {
    throw new ValidationError(
      'Автосообщение #' + number + ' длиннее ' + limit + ' символов',
      { text: 'Сократи текст до ' + limit + ' символов' }
    );
  }

  const everyMinutes = Number(raw.everyMinutes);
  if (!Number.isFinite(everyMinutes) || everyMinutes < 1 || everyMinutes > MAX_TIMER_MINUTES ||
      Math.round(everyMinutes) !== everyMinutes) {
    throw new ValidationError('Интервал должен быть целым числом от 1 до ' + MAX_TIMER_MINUTES + ' минут', {
      everyMinutes: 'От 1 до ' + MAX_TIMER_MINUTES + ' минут'
    });
  }

  const timer = {
    id: uniqueTimerId(raw.id, index, usedIds),
    text: text,
    everyMinutes: everyMinutes,
    platforms: platforms,
    enabled: raw.enabled !== false
  };

  Object.keys(raw).forEach(function (key) {
    if (TIMER_KEYS.has(key)) return;
    const extra = jsonSafe(raw[key]);
    if (extra !== undefined) timer[key] = extra;
  });

  return timer;
}

function validateTimers(rawList, options) {
  if (!Array.isArray(rawList)) {
    throw new ValidationError('Список автосообщений должен быть массивом', {});
  }
  if (rawList.length > MAX_TIMERS) {
    throw new ValidationError('Слишком много автосообщений (максимум ' + MAX_TIMERS + ')', {});
  }

  const used = new Set();
  return rawList.map(function (raw, index) {
    return normalizeTimer(raw, index, options, used);
  });
}

function normalizeUrl(value) {
  let url = trim(value);
  if (!url) return '';
  if (url.length > MAX_SOCIAL_LENGTH) {
    throw new ValidationError('Ссылка длиннее ' + MAX_SOCIAL_LENGTH + ' символов', {
      social: 'Слишком длинная ссылка'
    });
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) url = 'https://' + url;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new ValidationError('Не похоже на ссылку: ' + value, { social: 'Проверь адрес' });
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Ссылка должна начинаться с http:// или https://', {
      social: 'Нужна http(s)-ссылка'
    });
  }
  return parsed.toString();
}

function validateSocials(raw) {
  if (raw != null && !isPlainObject(raw)) {
    throw new ValidationError('Ссылки должны быть объектом', {});
  }
  const input = raw || {};
  const socials = {};
  SOCIAL_KEYS.forEach(function (key) {
    try {
      socials[key] = normalizeUrl(input[key]);
    } catch (error) {
      if (error instanceof ValidationError) {
        error.message = '«' + key + '»: ' + error.message;
        error.fields = { socials: error.message };
      }
      throw error;
    }
  });
  return socials;
}

// --- Модерация и развлечения ---------------------------------------------

function validateModeration(raw) {
  if (raw != null && !isPlainObject(raw)) {
    throw new ValidationError('Настройки модерации должны быть объектом', {});
  }
  try {
    const probe = new Moderation({ config: { moderation: raw || {} }, log: SILENT });
    if (probe.settings.punishment.banAfter > 0 &&
        probe.settings.punishment.banAfter < probe.settings.punishment.timeoutAfter) {
      throw new ValidationError('Бан не может наступать раньше мута', {
        banAfter: 'Бан должен быть позже первого мута'
      });
    }
    return probe.settings;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError('Не удалось проверить модерацию: ' + error.message, {});
  }
}

function validateEntertainment(raw) {
  if (raw != null && !isPlainObject(raw)) {
    throw new ValidationError('Настройки развлечений должны быть объектом', {});
  }
  const input = raw || {};
  try {
    const points = new Points({ config: { points: input.points || {} }, log: SILENT });
    const giveaway = new Giveaway({ config: { giveaways: input.giveaways || {} }, log: SILENT });
    const quiz = new Quiz({ config: { quiz: input.quiz || {} }, log: SILENT });
    const events = new Events({ config: { events: input.events || {} }, log: SILENT });
    return {
      points: points.settings,
      giveaways: giveaway.settings,
      quiz: quiz.settings,
      events: events.settings
    };
  } catch (error) {
    throw new ValidationError('Не удалось проверить настройки: ' + error.message, {});
  }
}

// --- Разбор и аккуратная замена раздела в config.js -----------------------

function skipString(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch === quote) return i + 1;
    if (quote === '`' && ch === '$' && source[i + 1] === '{') {
      i += 2;
      let depth = 1;
      while (i < source.length && depth > 0) {
        const inner = source[i];
        if (inner === '{') depth += 1;
        else if (inner === '}') depth -= 1;
        else if (inner === "'" || inner === '"' || inner === '`') {
          i = skipString(source, i);
          continue;
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return i;
}

function findMatching(source, start) {
  const open = source[start];
  const close = open === '[' ? ']' : (open === '{' ? '}' : ')');
  let depth = 0;
  let i = start;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
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
  throw new Error('Не удалось найти конец раздела');
}

function findTopLevelProperty(source, key) {
  const stack = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(source, i);
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      stack.push(ch);
      i += 1;
      continue;
    }
    if (ch === '}' || ch === ']' || ch === ')') {
      stack.pop();
      i += 1;
      continue;
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const start = i;
      while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) i += 1;
      const word = source.slice(start, i);
      if (stack.length === 1 && stack[0] === '{' && word === key) {
        let j = i;
        while (j < source.length && /\s/.test(source[j])) j += 1;
        if (source[j] === ':') {
          j += 1;
          while (j < source.length && /\s/.test(source[j])) j += 1;
          if (source[j] === '[' || source[j] === '{') {
            const lineStart = source.lastIndexOf('\n', start - 1) + 1;
            const linePrefix = source.slice(lineStart, start);
            const indent = (linePrefix.match(/^[ \t]*/) || [''])[0];
            return {
              valueStart: j,
              valueEnd: findMatching(source, j),
              indent: indent
            };
          }
        }
      }
      continue;
    }
    i += 1;
  }
  return null;
}

function quote(value) {
  return "'" + String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') + "'";
}

function keyLiteral(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quote(key);
}

function serializeValue(value, indent) {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value == null) return 'null';

  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    const flat = value.every(function (item) {
      return typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean';
    });
    if (flat) return '[' + value.map(function (item) { return serializeValue(item, ''); }).join(', ') + ']';
    const pad = indent + '  ';
    return '[\n' + value.map(function (item) {
      return pad + serializeValue(item, pad);
    }).join(',\n') + '\n' + indent + ']';
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value).filter(function (key) {
      return value[key] !== undefined && typeof value[key] !== 'function';
    });
    if (!keys.length) return '{}';
    const pad = indent + '  ';
    return '{\n' + keys.map(function (key) {
      return pad + keyLiteral(key) + ': ' + serializeValue(value[key], pad);
    }).join(',\n') + '\n' + indent + '}';
  }

  return 'null';
}

function evaluateConfig(source, file) {
  const body = source.charCodeAt(0) === 0xFEFF ? source.slice(1) : source;
  const moduleObject = { exports: {} };
  const sandbox = {
    module: moduleObject,
    exports: moduleObject.exports,
    require: require,
    __dirname: path.dirname(file),
    __filename: file,
    console: console
  };
  vm.runInNewContext(body, sandbox, { filename: file, timeout: 1000 });
  return moduleObject.exports;
}

function replaceSection(source, key, literal) {
  const found = findTopLevelProperty(source, key);
  if (!found) throw new Error('В config.js не найден раздел «' + key + '»');
  return source.slice(0, found.valueStart) + literal + source.slice(found.valueEnd);
}

function createConfigEditor(options) {
  const file = path.resolve(options.file);
  const log = options.log || { info: function () {}, warn: function () {} };
  const isYouTubeEnabled = typeof options.youtubeEnabled === 'function'
    ? options.youtubeEnabled
    : function () { return options.youtubeEnabled !== false; };

  function readValue(key) {
    const source = fs.readFileSync(file, 'utf8');
    const config = evaluateConfig(source, file);
    return config[key];
  }

  function writeSection(key, value) {
    let source = fs.readFileSync(file, 'utf8');
    const hasBom = source.charCodeAt(0) === 0xFEFF;
    if (hasBom) source = source.slice(1);

    const before = evaluateConfig(source, file);
    const found = findTopLevelProperty(source, key);
    if (!found) throw new Error('В config.js не найден раздел «' + key + '»');

    let literal = serializeValue(value, found.indent);
    if (source.indexOf('\r\n') !== -1) literal = literal.replace(/\n/g, '\r\n');
    const next = replaceSection(source, key, literal);

    let after;
    try {
      after = evaluateConfig(next, file);
    } catch (error) {
      throw new Error('Не сохранил: config.js стал бы некорректным — ' + error.message);
    }

    Object.keys(before).forEach(function (otherKey) {
      if (otherKey === key) return;
      if (JSON.stringify(before[otherKey]) !== JSON.stringify(after[otherKey])) {
        throw new Error('Не сохранил: изменился посторонний раздел «' + otherKey + '»');
      }
    });

    const backup = file + '.bak';
    try {
      fs.copyFileSync(file, backup);
    } catch (error) {
      log.warn('Не удалось сделать резервную копию config.js:', error.message);
    }

    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, (hasBom ? '\ufeff' : '') + next, 'utf8');
    fs.renameSync(tmp, file);
    log.info('config.js: раздел «' + key + '» сохранён через панель');
    return after[key];
  }

  return {
    file: file,
    read: readValue,
    saveCommands: function (commands) {
      const normalized = validateCommands(commands, { youtubeEnabled: isYouTubeEnabled() });
      return writeSection('commands', normalized);
    },
    saveTimers: function (timers) {
      const normalized = validateTimers(timers, { youtubeEnabled: isYouTubeEnabled() });
      return writeSection('timers', normalized);
    },
    saveSocials: function (socials) {
      const normalized = validateSocials(socials);
      return writeSection('socials', normalized);
    },
    saveModeration: function (moderation) {
      const normalized = validateModeration(moderation);
      return writeSection('moderation', normalized);
    },
    saveEntertainment: function (raw) {
      const normalized = validateEntertainment(raw);
      writeSection('points', normalized.points);
      writeSection('giveaways', normalized.giveaways);
      writeSection('quiz', normalized.quiz);
      writeSection('events', normalized.events);
      return normalized;
    }
  };
}

module.exports = {
  ValidationError: ValidationError,
  createConfigEditor: createConfigEditor,
  validateCommands: validateCommands,
  validateTimers: validateTimers,
  validateSocials: validateSocials,
  validateModeration: validateModeration,
  validateEntertainment: validateEntertainment,
  // для тестов
  _findTopLevelProperty: findTopLevelProperty,
  _serializeValue: serializeValue,
  _evaluateConfig: evaluateConfig,
  SOCIAL_KEYS: SOCIAL_KEYS,
  MAX_COMMANDS: MAX_COMMANDS,
  MAX_REPLY: MAX_REPLY
};
