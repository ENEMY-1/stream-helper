'use strict';

// Движок команд: разбор сообщений, права, задержки, переменные.

const { delay } = require('./net');
const { truncate } = require('./fsutil');

const DEFAULTS = {
  prefix: '!',
  globalCooldownMs: 1200,
  commandCooldownMs: 5000,
  userCooldownMs: 15000,
  maxRepliesPerMinute: 10
};

const SOCIAL_LABELS = {
  youtube: 'YouTube',
  twitch: 'Twitch',
  discord: 'Discord',
  telegram: 'Telegram',
  vk: 'VK',
  boosty: 'Boosty',
  tiktok: 'TikTok',
  instagram: 'Instagram'
};

// Встроенные команды. Панель показывает их отдельно и не даёт занять их имена.
const BUILTIN_COMMANDS = [
  { name: 'help', aliases: ['commands', 'команды', 'помощь', 'хелп', 'cmd'], description: 'Список доступных команд' },
  { name: 'ping', aliases: ['пинг', 'понг'], description: 'Проверка, что бот на месте' },
  { name: 'social', aliases: ['соцсети', 'ссылки', 'links'], description: 'Все ссылки из настроек' },
  { name: 'uptime', aliases: ['аптайм', 'ап'], description: 'Сколько уже идёт стрим' },
  { name: 'youtube', aliases: ['ютуб', 'yt'], description: 'Ссылка на YouTube' },
  { name: 'twitch', aliases: ['твич', 'tw'], description: 'Ссылка на Twitch' },
  { name: 'points', aliases: ['баллы', 'balance', 'баланс', 'очки'], description: 'Сколько у тебя баллов' },
  { name: 'top', aliases: ['топ', 'leaderboard', 'lb'], description: 'Топ зрителей по баллам' },
  { name: 'daily', aliases: ['бонус', 'ежедневка'], description: 'Ежедневный бонус баллов' },
  { name: 'give', aliases: ['перевод', 'pay'], description: 'Перевести баллы зрителю' },
  { name: 'quiz', aliases: ['викторина', 'trivia'], description: 'Викторина в чате' },
  { name: 'giveaway', aliases: ['ga', 'розыгрыш', 'гив'], description: 'Розыгрыш в чате' },
  { name: 'join', aliases: ['участвую', 'участвовать'], description: 'Участвовать в розыгрыше' },
  { name: 'ban', aliases: ['бан'], description: 'Забанить зрителя (модераторы)' },
  { name: 'timeout', aliases: ['мут', 'таймаут'], description: 'Выдать мут (модераторы)' },
  { name: 'unban', aliases: ['разбан'], description: 'Снять бан (модераторы)' },
  { name: 'delete', aliases: ['удалить'], description: 'Удалить сообщение (модераторы)' },
  { name: 'modstats', aliases: ['модстат'], description: 'Статистика модерации (модераторы)' }
];


function builtinAliases(name) {
  const found = BUILTIN_COMMANDS.find(function (item) { return item.name === name; });
  return found ? found.aliases.slice() : [];
}

const RESERVED_NAMES = new Set();
BUILTIN_COMMANDS.forEach(function (command) {
  RESERVED_NAMES.add(command.name);
  command.aliases.forEach(function (alias) { RESERVED_NAMES.add(alias); });
});

function humanDuration(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'меньше минуты';
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return days + ' д ' + (hours % 24) + ' ч';
  if (hours > 0) return hours + ' ч ' + (minutes % 60) + ' мин';
  return minutes + ' мин';
}

function unique(list) {
  const seen = new Set();
  return list.filter(function (item) {
    if (!item || seen.has(item)) return false;
    seen.add(item);
    return true;
  });
}

function formatNumber(value) {
  const number = Number(value) || 0;
  try {
    return new Intl.NumberFormat('ru-RU').format(number);
  } catch (error) {
    return String(number);
  }
}

function commandArgs(message) {
  const text = String((message && message.text) || '').trim();
  const parts = text.split(/\s+/);
  return { parts: parts, args: parts.slice(1), rest: parts.slice(1).join(' ') };
}

class Engine {
  constructor(options) {
    this.config = options.config;
    this.botConfig = Object.assign({}, DEFAULTS, this.config.bot || {});
    this.sendReply = options.send;
    this.log = options.log;
    this.now = options.now || Date.now;
    this.uptimeProvider = options.uptime || (async function () { return { live: false, unknown: true }; });
    this.services = options.services || {};

    this.commands = new Map();
    this.aliases = new Map();
    this.commandCooldown = new Map();
    this.userCooldown = new Map();
    this.lastGlobal = 0;
    this.replyTimes = [];

    this.ignore = new Set((this.botConfig.ignore || []).map(function (name) {
      return String(name).toLowerCase();
    }));

    this.addBuiltins();
    (this.config.commands || []).forEach((command) => this.addCommand(command, true));
  }

  addCommand(command, isCustom) {
    if (!command) return;
    const name = String(command.name || '').trim().toLowerCase();
    if (!name || !/^[a-zа-яё0-9_-]+$/i.test(name)) {
      this.log.warn('Пропускаю команду с плохим именем:', command.name);
      return;
    }
    if (name === 'help' && isCustom) {
      this.log.warn('Команда help зарезервирована, пропускаю');
      return;
    }
    if (!command.reply && typeof command.run !== 'function') {
      this.log.warn('У команды !' + name + ' нет reply, пропускаю');
      return;
    }

    const normalized = Object.assign({}, command, {
      name: name,
      aliases: unique((command.aliases || []).map(function (alias) {
        return String(alias || '').trim().toLowerCase().replace(/^!/, '');
      }).filter(Boolean))
    });

    if (this.commands.has(name) && isCustom) {
      this.log.warn('Команда !' + name + ' заменена своей из config.js');
    }
    this.commands.set(name, normalized);

    normalized.aliases.forEach((alias) => {
      if (this.commands.has(alias)) {
        this.log.warn('Алиас «' + alias + '» уже занят командой !' + alias);
        return;
      }
      this.aliases.set(alias, name);
    });
  }

  addBuiltins() {
    const replies = this.config.replies || {};

    this.addCommand({
      name: 'help',
      aliases: builtinAliases('help'),
      cooldownMs: 4000,
      run: (message) => this.helpReply(message)
    });

    this.addCommand({
      name: 'ping',
      aliases: builtinAliases('ping'),
      reply: replies.ping || 'понг 🏓'
    });

    this.addCommand({
      name: 'social',
      aliases: builtinAliases('social'),
      run: () => this.socialReply()
    });

    this.addCommand({
      name: 'uptime',
      aliases: builtinAliases('uptime'),
      run: () => this.uptimeReply()
    });

    this.addCommand({
      name: 'youtube',
      aliases: builtinAliases('youtube'),
      reply: '{youtube}'
    });

    this.addCommand({
      name: 'twitch',
      aliases: builtinAliases('twitch'),
      reply: '{twitch}'
    });

    if (this.services.points) {
      this.addCommand({
        name: 'points',
        aliases: builtinAliases('points'),
        run: (message) => this.pointsReply(message)
      });
      this.addCommand({
        name: 'top',
        aliases: builtinAliases('top'),
        cooldownMs: 10000,
        run: () => this.topReply()
      });
      this.addCommand({
        name: 'daily',
        aliases: builtinAliases('daily'),
        cooldownMs: 5000,
        run: (message) => this.dailyReply(message)
      });
      this.addCommand({
        name: 'give',
        aliases: builtinAliases('give'),
        cooldownMs: 5000,
        run: (message) => this.giveReply(message)
      });
    }

    if (this.services.quiz) {
      this.addCommand({
        name: 'quiz',
        aliases: builtinAliases('quiz'),
        permission: 'mod',
        run: (message) => this.services.quiz.command(message)
      });
    }

    if (this.services.giveaway) {
      this.addCommand({
        name: 'giveaway',
        aliases: builtinAliases('giveaway'),
        permission: 'mod',
        cooldownMs: 3000,
        run: (message) => this.services.giveaway.command(message)
      });
      this.addCommand({
        name: 'join',
        aliases: builtinAliases('join'),
        cooldownMs: 3000,
        run: (message) => this.joinGiveaway(message)
      });
    }

    if (this.services.moderation) {
      ['ban', 'timeout', 'unban', 'delete', 'modstats'].forEach((name) => {
        this.addCommand({
          name: name,
          aliases: builtinAliases(name),
          permission: 'mod',
          cooldownMs: 1500,
          run: (message) => this.services.moderation.manual(message)
        });
      });
    }
  }

  pointsReply(message) {
    const points = this.services.points;
    const replies = this.config.replies || {};
    if (!points.enabled) return replies.pointsDisabled || 'Система баллов выключена.';
    const summary = points.summary(message);
    return String(replies.points || '{user}, у тебя {points} {currency}.')
      .replace(/\{user\}/g, summary.name || message.user || '')
      .replace(/\{points\}/g, formatNumber(summary.points))
      .replace(/\{currency\}/g, summary.currency)
      .replace(/\{rank\}/g, summary.rank ? String(summary.rank) : '—');
  }

  topReply() {
    const points = this.services.points;
    const replies = this.config.replies || {};
    if (!points.enabled) return replies.pointsDisabled || 'Система баллов выключена.';
    const top = points.top(5);
    if (!top.length) return replies.pointsEmpty || 'Пока ни у кого нет баллов.';
    const line = top.map(function (item, index) {
      return (index + 1) + ') ' + item.name + ' — ' + formatNumber(item.points);
    }).join(' · ');
    return String(replies.pointsTop || 'Топ по баллам: {top}')
      .replace('{top}', line)
      .replace('{currency}', points.currency);
  }

  dailyReply(message) {
    const points = this.services.points;
    const replies = this.config.replies || {};
    if (!points.enabled) return replies.pointsDisabled || 'Система баллов выключена.';
    const result = points.daily(message);
    if (result.ok) {
      return String(replies.pointsDaily || '{user}, ежедневный бонус: +{amount} {currency}. Теперь {points}.')
        .replace(/\{user\}/g, message.user || message.login || '')
        .replace(/\{amount\}/g, formatNumber(result.amount))
        .replace(/\{points\}/g, formatNumber(result.points))
        .replace(/\{currency\}/g, result.currency);
    }
    if (result.reason === 'wait') {
      const hours = Math.max(1, Math.ceil(result.waitMs / 3600000));
      return String(replies.pointsDailyWait || '{user}, бонус уже получен. Следующий через {wait}.')
        .replace(/\{user\}/g, message.user || message.login || '')
        .replace(/\{wait\}/g, hours + ' ч');
    }
    return replies.pointsDailyError || 'Не получилось получить бонус.';
  }

  giveReply(message) {
    const points = this.services.points;
    const replies = this.config.replies || {};
    if (!points.enabled) return replies.pointsDisabled || 'Система баллов выключена.';
    const args = commandArgs(message).args;
    if (args.length < 2) return 'Напиши: !give <ник> <сколько>';

    const target = args[0];
    const amount = Number(String(args[1]).replace(',', '.'));
    const result = points.transfer(message, target, amount);
    if (!result.ok) {
      return String(replies.pointsTransferError || 'Не получилось: {reason}')
        .replace('{reason}', result.reason || 'ошибка');
    }
    return String(replies.pointsTransfer || '{user} перевёл {amount} {currency} игроку {target}.')
      .replace(/\{user\}/g, message.user || message.login || '')
      .replace(/\{target\}/g, result.target)
      .replace(/\{amount\}/g, formatNumber(result.amount))
      .replace(/\{currency\}/g, result.currency);
  }

  joinGiveaway(message) {
    const giveaway = this.services.giveaway;
    const result = giveaway.join(message, false);
    if (result.ok) {
      const replies = this.config.replies || {};
      return String(replies.giveawayJoined || '{user}, ты в розыгрыше! Участников: {entries}.')
        .replace(/\{user\}/g, message.user || message.login || '')
        .replace(/\{entries\}/g, String(result.entries));
    }
    if (result.reason === 'no-giveaway') return 'Сейчас розыгрыша нет.';
    if (result.reason === 'ended') return 'Розыгрыш уже завершился.';
    if (result.reason === 'points' || result.reason === 'already') return result.text || 'Не получилось участвовать.';
    return 'Не получилось участвовать в розыгрыше.';
  }

  // Горячая перезагрузка команд из панели: встроенные остаются, свои заменяются.
  reloadCommands(commands) {
    this.config.commands = Array.isArray(commands) ? commands : [];
    this.commands = new Map();
    this.aliases = new Map();
    this.addBuiltins();
    this.config.commands.forEach((command) => this.addCommand(command, true));
  }

  socialsLine() {
    const socials = this.config.socials || {};
    const parts = Object.keys(socials)
      .filter(function (key) { return socials[key] && typeof socials[key] === 'string'; })
      .map(function (key) { return (SOCIAL_LABELS[key] || key) + ': ' + socials[key]; });
    return parts.join(' · ');
  }

  socialReply() {
    const line = this.socialsLine();
    return line || (this.config.replies || {}).noSocials || 'Ссылки скоро появятся';
  }

  isMod(message) {
    return !!(message.isBroadcaster || message.isMod);
  }

  helpReply(message) {
    const prefix = this.botConfig.prefix;
    const visible = [];
    this.commands.forEach(function (command, name) {
      if (command.enabled === false) return;
      if (command.platforms && command.platforms.indexOf(message.platform) === -1) return;
      const permission = command.permission || 'everyone';
      if (permission !== 'everyone' && !message.isMod && !message.isBroadcaster) return;
      visible.push(prefix + name);
    });
    const template = (this.config.replies || {}).help || 'Команды: {commands}';
    return template.replace('{commands}', visible.join(' '))
      .replace('{count}', String(visible.length));
  }

  async getUptime() {
    try {
      const result = await Promise.race([
        this.uptimeProvider(),
        delay(4000).then(function () { return { live: false, unknown: true }; })
      ]);
      return result || { live: false, unknown: true };
    } catch (error) {
      return { live: false, unknown: true };
    }
  }

  async uptimeReply() {
    const replies = this.config.replies || {};
    const uptime = await this.getUptime();
    if (uptime && uptime.live) {
      return String(replies.uptime || 'В эфире уже {uptime}')
        .replace('{uptime}', uptime.text || humanDuration(uptime.ms || 0));
    }
    if (uptime && uptime.unknown) {
      return replies.uptimeUnknown || 'Не могу проверить аптайм: нет доступа к Twitch API.';
    }
    return replies.uptimeOffline || 'Стрим сейчас не идёт — но чат на месте 🙂';
  }

  async renderText(text, message) {
    const socials = this.config.socials || {};
    const values = {
      user: message.user || '',
      channel: (this.config.twitch && this.config.twitch.channel) || '',
      platform: message.platform || '',
      youtube: socials.youtube || '',
      twitch: socials.twitch || '',
      discord: socials.discord || '',
      socials: this.socialsLine(),
      date: new Date(this.now()).toLocaleDateString('ru-RU'),
      time: new Date(this.now()).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    };

    if (/\{(uptime|game|title|viewers)\}/i.test(String(text))) {
      const uptime = await this.getUptime();
      values.uptime = uptime && uptime.live
        ? (uptime.text || humanDuration(uptime.ms || 0))
        : (uptime && uptime.unknown ? 'нет данных' : 'не в эфире');
      values.game = uptime && uptime.game ? uptime.game : 'не в эфире';
      values.title = uptime && uptime.title ? uptime.title : '';
      values.viewers = formatNumber(uptime && uptime.viewers ? uptime.viewers : 0);
    }

    return String(text).replace(/\{([a-zа-яё_]+)\}/gi, function (match, key) {
      const normalized = key.toLowerCase();
      return Object.prototype.hasOwnProperty.call(values, normalized)
        ? String(values[normalized])
        : match;
    });
  }

  limitFor(platform) {
    const limits = this.botConfig.maxReplyLength || {};
    return Number(limits[platform]) || (platform === 'youtube' ? 200 : 480);
  }

  checkPermission(command, message) {
    const permission = command.permission || 'everyone';
    if (permission === 'broadcaster') return !!message.isBroadcaster;
    if (permission === 'mod') return this.isMod(message);
    return true;
  }

  recentReplies(now) {
    this.replyTimes = this.replyTimes.filter(function (time) { return now - time < 60000; });
    return this.replyTimes.length;
  }

  async handle(message) {
    const text = String((message && message.text) || '').trim();
    if (!text) return { handled: false, reason: 'empty' };
    if (message.isSelf) return { handled: false, reason: 'self' };
    if (this.ignore.has(String(message.user || '').toLowerCase())) {
      return { handled: false, reason: 'ignored-user' };
    }

    const prefix = this.botConfig.prefix;
    if (!text.startsWith(prefix)) return { handled: false, reason: 'not-command' };

    const body = text.slice(prefix.length).trim();
    if (!body) return { handled: false, reason: 'not-command' };

    const word = body.split(/\s+/)[0].toLowerCase();
    const name = this.commands.has(word) ? word : this.aliases.get(word);
    if (!name) {
      const hint = (this.config.replies || {}).unknown;
      if (hint) {
        await this.sendReply(message.platform, hint, { command: 'unknown', replyTo: message });
      }
      return { handled: false, reason: 'unknown' };
    }

    const command = this.commands.get(name);
    if (!command || command.enabled === false) return { handled: false, reason: 'disabled' };
    if (command.platforms && command.platforms.indexOf(message.platform) === -1) {
      return { handled: false, reason: 'platform' };
    }
    if (!this.checkPermission(command, message)) {
      return { handled: false, reason: 'permission' };
    }

    const now = this.now();

    if (now - this.lastGlobal < this.botConfig.globalCooldownMs) {
      return { handled: false, reason: 'global-cooldown' };
    }
    if (this.recentReplies(now) >= this.botConfig.maxRepliesPerMinute) {
      return { handled: false, reason: 'minute-limit' };
    }

    const commandCooldown = Number(command.cooldownMs) || this.botConfig.commandCooldownMs;
    if (now - (this.commandCooldown.get(name) || 0) < commandCooldown) {
      return { handled: false, reason: 'command-cooldown' };
    }

    const userKey = name + ':' + message.platform + ':' + String(message.userId || message.user || '').toLowerCase();
    const userCooldown = Number(command.userCooldownMs) || this.botConfig.userCooldownMs;
    if (now - (this.userCooldown.get(userKey) || 0) < userCooldown) {
      return { handled: false, reason: 'user-cooldown' };
    }

    let reply;
    if (typeof command.run === 'function') {
      reply = await command.run(message);
    } else {
      reply = await this.renderText(command.reply, message);
    }

    if (!reply) return { handled: false, reason: 'no-reply' };

    const limit = this.limitFor(message.platform);
    reply = truncate(reply, limit);
    if (!reply) return { handled: false, reason: 'no-reply' };

    this.lastGlobal = now;
    this.commandCooldown.set(name, now);
    this.userCooldown.set(userKey, now);
    this.replyTimes.push(now);

    try {
      await this.sendReply(message.platform, reply, { command: name, replyTo: message });
    } catch (error) {
      this.log.warn('Не удалось отправить ответ в ' + message.platform + ':', error.message);
      return { handled: true, command: name, reply: reply, error: error.message };
    }

    return { handled: true, command: name, reply: reply };
  }
}

module.exports = {
  Engine: Engine,
  humanDuration: humanDuration,
  SOCIAL_LABELS: SOCIAL_LABELS,
  BUILTIN_COMMANDS: BUILTIN_COMMANDS,
  RESERVED_NAMES: RESERVED_NAMES
};
