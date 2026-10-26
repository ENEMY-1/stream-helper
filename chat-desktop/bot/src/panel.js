'use strict';

// Мост между веб-панелью, config.js и работающим ботом.

const {
  createConfigEditor,
  SOCIAL_KEYS,
  MAX_COMMANDS,
  MAX_REPLY
} = require('./config-editor');
const { BUILTIN_COMMANDS, SOCIAL_LABELS } = require('./engine');

function clone(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function createPanel(options) {
  const config = options.config;
  const engine = options.engine;
  const timers = options.timers;
  const moderation = options.moderation || null;
  const points = options.points || null;
  const giveaway = options.giveaway || null;
  const quiz = options.quiz || null;
  const events = options.events || null;
  const log = options.log || { info: function () {}, warn: function () {} };

  const editor = createConfigEditor({
    file: config.configFile,
    log: log,
    youtubeEnabled: function () { return config.youtube.enabled !== false; }
  });

  function configTimers() {
    return (config.timers || []).map(function (timer, index) {
      const copy = clone(timer) || {};
      if (!copy.id) copy.id = 'timer-' + (index + 1);
      if (!copy.platforms || !copy.platforms.length) copy.platforms = ['twitch'];
      if (copy.enabled === undefined) copy.enabled = true;
      return copy;
    });
  }

  return {
    getData: function () {
      return {
        commands: clone(config.commands || []),
        timers: configTimers(),
        socials: clone(config.socials || {}),
        moderation: clone(config.moderation || {}),
        points: clone(config.points || {}),
        giveaways: clone(config.giveaways || {}),
        quiz: clone(config.quiz || {}),
        events: clone(config.events || {}),
        meta: {
          channel: config.twitch.channel,
          prefix: (config.bot || {}).prefix || '!',
          youtubeEnabled: config.youtube.enabled !== false,
          activityWindowMinutes: (config.bot || {}).activityWindowMinutes || 10,
          minGapMs: (config.timersSettings || {}).minGapMs || 120000,
          builtins: clone(BUILTIN_COMMANDS),
          socialKeys: SOCIAL_KEYS.slice(),
          socialLabels: clone(SOCIAL_LABELS),
          maxCommands: MAX_COMMANDS,
          maxReply: MAX_REPLY,
          maxAliases: 10,
          maxTimers: 20
        }
      };
    },

    saveCommands: function (commands) {
      const saved = editor.saveCommands(commands);
      config.commands = saved;
      engine.reloadCommands(saved);
      log.info('Команды обновлены через панель: ' + saved.length + ' шт.');
      return saved;
    },

    saveTimers: function (list) {
      const saved = editor.saveTimers(list);
      config.timers = saved;
      timers.reload(saved);
      log.info('Автосообщения обновлены через панель: ' + saved.length + ' шт.');
      return saved;
    },

    saveSocials: function (socials) {
      const saved = editor.saveSocials(socials);
      config.socials = saved;
      log.info('Ссылки обновлены через панель');
      return saved;
    },

    saveModeration: function (raw) {
      const saved = editor.saveModeration(raw);
      config.moderation = saved;
      if (moderation) moderation.reload(saved);
      log.info('Модерация обновлена через панель');
      return saved;
    },

    saveEntertainment: function (raw) {
      const saved = editor.saveEntertainment(raw);
      config.points = saved.points;
      config.giveaways = saved.giveaways;
      config.quiz = saved.quiz;
      config.events = saved.events;
      if (points) points.reload(saved.points);
      if (giveaway) giveaway.reload(saved.giveaways);
      if (quiz) quiz.reload(saved.quiz);
      if (events) events.reload(saved.events);
      log.info('Баллы, розыгрыши, викторина и события обновлены через панель');
      return saved;
    }
  };
}

module.exports = { createPanel: createPanel };
