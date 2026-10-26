'use strict';

// Уведомления о начале стрима в Telegram-канал.
// Раз в checkIntervalSec проверяет Twitch Helix /streams и при переходе
// offline → live отправляет сообщение через Telegram Bot API.
// В сообщение можно добавить ссылку на YouTube (streamAlerts.youtube):
// канал (…/@ник) превращается в …/@ник/live, готовая ссылка на видео
// подставляется как есть.
// Состояние хранится в data/state.json, поэтому после перезапуска бот
// не пришлёт уведомление о том же стриме повторно.

const DEFAULT_MESSAGE = [
  '🔴 {channel} в эфире!',
  '',
  '🎮 {game}',
  '📝 {title}',
  '👀 Зрителей: {viewers}',
  '',
  '▶️ Twitch: {url}',
  '📺 YouTube: {youtube}'
].join('\n');

// Сообщение о завершении стрима: справка по эфиру.
const DEFAULT_OFFLINE_MESSAGE = [
  '📊 {channel}: стрим закончился',
  '',
  '⏱ Длительность: {duration}',
  '🏆 Пик зрителей: {peak}',
  '👀 Среднее: {average}',
  '',
  '💬 Чат: {messages}',
  '🤖 Сообщений от бота: {replies}',
  '🛡 Действий модерации: {moderation}',
  '',
  '🕘 Начало: {started}',
  '🕘 Конец: {ended}',
  '',
  '▶️ Канал: {url}',
  '📺 YouTube: {youtube}'
].join('\n');

const MAX_CAPTION = 1024;

const { humanDurationLong, HISTORY_LIMIT } = require('./stream-stats');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatNumber(value) {
  const number = Number(value) || 0;
  try {
    return new Intl.NumberFormat('ru-RU').format(number);
  } catch (error) {
    return String(number);
  }
}

function humanDuration(ms) {
  const minutes = Math.max(0, Math.round((Number(ms) || 0) / 60000));
  if (minutes < 60) return minutes + ' мин';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours + ' ч' + (rest ? ' ' + rest + ' мин' : '');
}

function formatTime(ms) {
  const value = Number(ms);
  if (!value) return '—';
  try {
    return new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch (error) {
    return '—';
  }
}

function formatDate(ms) {
  const value = Number(ms);
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch (error) {
    return '—';
  }
}

function clampHtml(html, limit) {
  const text = String(html || '');
  if (text.length <= limit) return text;
  let cut = text.slice(0, limit - 1);
  const amp = cut.lastIndexOf('&');
  if (amp !== -1 && cut.indexOf(';', amp) === -1) cut = cut.slice(0, amp);
  const tag = cut.lastIndexOf('<');
  if (tag !== -1 && cut.indexOf('>', tag) === -1) cut = cut.slice(0, tag);
  return cut.trimEnd() + '…';
}

function normalizeThumbnail(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return value.replace('{width}', '1280').replace('{height}', '720');
}

// Ссылка на YouTube из настроек: канал или конкретное видео.
// Канал (https://youtube.com/@ник) → https://youtube.com/@ник/live —
// YouTube сам перенаправит на текущий эфир.
function normalizeYoutubeUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) {
    return 'https://www.youtube.com/' + value.replace(/^\/+/, '').replace(/^@/, '@');
  }
  if (/\/(live|shorts|watch|embed)\b|youtu\.be\/|v=/i.test(value)) return value;
  return value.replace(/\/+$/, '') + '/live';
}

class StreamAlerts {
  constructor(options) {
    const opts = options || {};
    this.config = opts.config || {};
    this.settings = (this.config.streamAlerts || {});
    this.telegram = this.settings.telegram || {};
    this.channel = String(this.config.twitch && this.config.twitch.channel || '').toLowerCase();
    this.youtubeUrl = normalizeYoutubeUrl(this.settings.youtube);
    this.twitchApi = opts.twitchApi;
    this.log = opts.log || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
    this.fetch = opts.fetch || globalThis.fetch;
    this.onSave = opts.onSave || function () {};

    this.state = opts.state || {};
    if (!this.state.streamAlerts || typeof this.state.streamAlerts !== 'object') {
      this.state.streamAlerts = {};
    }
    this.alertsState = this.state.streamAlerts;
    if (!this.alertsState.twitch || typeof this.alertsState.twitch !== 'object') {
      this.alertsState.twitch = null;
    }
    this.alertsState.sent = Number(this.alertsState.sent) || 0;
    this.alertsState.ended = Number(this.alertsState.ended) || 0;
    if (!Array.isArray(this.alertsState.history)) this.alertsState.history = [];

    // Сводку по стриму (пик зрителей, длительность, активность чата)
    // ведёт stream-stats.js; бот передаёт его сюда при создании.
    this.stats = opts.stats || null;
    // Подписка на итоги: бот сохраняет их в свою историю стримов.
    this.onStreamEnd = opts.onStreamEnd || function () {};

    this.ready = !!(this.telegram.botToken && this.telegram.chatId);
    this.enabled = this.settings.enabled === true && this.ready;
    this.offlineEnabled = this.settings.offlineEnabled !== false;
    this.checking = false;
    this.timer = null;
    this.firstTimer = null;
    this.lastCheckAt = 0;
    this.lastError = '';
    this.lastOfflineError = '';
  }

  start() {
    if (this.settings.enabled !== true) {
      this.log.info('Уведомления о стриме в Telegram выключены (streamAlerts.enabled = false).');
      return false;
    }
    if (!this.ready) {
      this.log.warn('Уведомления о стриме включены, но не заданы streamAlerts.telegram.botToken и chatId.');
      this.log.warn('Заполни их в config.js и перезапусти бота.');
      return false;
    }
    if (this.timer) return true;

    const intervalMs = Math.max(20, Number(this.settings.checkIntervalSec) || 60) * 1000;
    const self = this;

    this.log.info('Уведомления в Telegram включены: ' + this.channel + ', проверка раз в ' +
      Math.round(intervalMs / 1000) + ' с · ' +
      (this.offlineEnabled ? 'сообщение об итогах стрима — включено' : 'сообщение об итогах стрима — выключено'));

    this.firstTimer = setTimeout(function () {
      self.checkOnce();
    }, 2000);
    this.timer = setInterval(function () {
      self.checkOnce();
    }, intervalMs);
    if (this.timer.unref) this.timer.unref();
    return true;
  }

  stop() {
    if (this.firstTimer) {
      clearTimeout(this.firstTimer);
      this.firstTimer = null;
    }
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  snapshot() {
    const twitch = this.alertsState.twitch || {};
    const history = this.alertsState.history || [];
    const last = history.length ? history[history.length - 1] : null;
    return {
      enabled: this.enabled,
      ready: this.ready,
      channel: this.channel,
      youtube: this.youtubeUrl,
      checkIntervalSec: Number(this.settings.checkIntervalSec) || 60,
      offlineEnabled: this.offlineEnabled,
      live: twitch.live === true,
      startedAt: Number(twitch.startedAt) || 0,
      notifiedAt: Number(twitch.notifiedAt) || 0,
      sent: Number(this.alertsState.sent) || 0,
      ended: Number(this.alertsState.ended) || 0,
      current: this.stats && typeof this.stats.snapshot === 'function' ? this.stats.snapshot() : null,
      last,
      history: history.slice(-HISTORY_LIMIT),
      lastCheckAt: this.lastCheckAt,
      lastError: this.lastError,
      lastOfflineError: this.lastOfflineError
    };
  }

  async checkOnce() {
    if (!this.enabled) return { skipped: 'disabled' };
    if (this.checking) return { skipped: 'busy' };
    if (!this.twitchApi || typeof this.twitchApi.getStream !== 'function') {
      this.lastError = 'Twitch API не подключён';
      return { skipped: 'no-api' };
    }

    this.checking = true;
    const previous = this.alertsState.twitch || null;

    try {
      const stream = await this.twitchApi.getStream(this.channel);
      this.lastCheckAt = Date.now();

      if (!stream || stream.unknown) {
        this.lastError = 'Twitch не ответил';
        this.log.debug('Проверка стрима: Twitch API не ответил, пропускаю.');
        return { skipped: 'unknown' };
      }

      if (!stream.live) {
        this.lastError = '';
        if (previous && previous.live) {
          this.alertsState.twitch = { live: false, startedAt: 0, offlineAt: Date.now() };
          const ended = this.stats ? this.stats.markOffline() : null;
          this.onSave();
          this.log.info('Стрим закончился — жду следующий.');
          if (ended && !ended.dropped) {
            return { live: false, ended: await this.finishStream(ended.state, ended.endedAt) };
          }
        }
        return { live: false };
      }

      // Стрим идёт — копим данные для сводки (пик зрителей и т.п.).
      if (this.stats && typeof this.stats.observe === 'function') {
        this.stats.observe(stream);
      }

      const startedAt = Number(stream.startedAt) || 0;
      if (previous && previous.live && previous.startedAt === startedAt) {
        return { live: true, skipped: 'already-notified' };
      }

      const maxAgeMinutes = Number(this.settings.maxStartAgeMinutes) || 0;
      if (maxAgeMinutes > 0 && startedAt && Date.now() - startedAt > maxAgeMinutes * 60000) {
        this.alertsState.twitch = { live: true, startedAt: startedAt, notifiedAt: 0 };
        this.onSave();
        this.log.info('Стрим уже идёт ' + humanDuration(Date.now() - startedAt) +
          ' — уведомление пропущено (maxStartAgeMinutes = ' + maxAgeMinutes + ').');
        return { live: true, skipped: 'too-old' };
      }

      await this.sendLive(stream);

      this.alertsState.twitch = { live: true, startedAt: startedAt, notifiedAt: Date.now() };
      this.alertsState.sent = (Number(this.alertsState.sent) || 0) + 1;
      this.onSave();
      this.lastError = '';
      this.log.info('Telegram: уведомление о стриме отправлено' +
        (stream.title ? ' — «' + stream.title + '»' : '') + '.');
      return { live: true, sent: true };
    } catch (error) {
      this.lastError = error.message;
      this.log.warn('Уведомление не отправлено: ' + error.message +
        ' — повторю через ' + (Number(this.settings.checkIntervalSec) || 60) + ' с.');
      return { live: true, sent: false, error: error.message };
    } finally {
      this.checking = false;
    }
  }

  streamUrl(stream) {
    const name = String((stream && stream.userName) || this.channel || '').toLowerCase();
    return 'https://twitch.tv/' + name;
  }

  // Справка по завершившемуся стриму: отправка в Telegram, запись в
  // историю и передача боту (он приложит итоги к своей истории стримов).
  async finishStream(state, endedAt) {
    const info = this.stats && typeof this.stats.summary === 'function'
      ? this.stats.summary(state, endedAt)
      : null;
    if (!info) return null;

    const entry = Object.assign({}, info, {
      channel: this.channel,
      notified: false,
      notifiedAt: 0,
      error: ''
    });

    if (this.offlineEnabled) {
      try {
        await this.sendOffline(info);
        entry.notified = true;
        entry.notifiedAt = Date.now();
        this.alertsState.ended = (Number(this.alertsState.ended) || 0) + 1;
        this.lastOfflineError = '';
        this.log.info('Telegram: справка о завершении стрима отправлена — ' +
          humanDurationLong(info.durationMs) + ', пик ' + info.peak + '.');
      } catch (error) {
        entry.error = error.message;
        this.lastOfflineError = error.message;
        this.log.warn('Справка о завершении стрима не отправлена: ' + error.message);
      }
    }

    this.alertsState.history = (this.alertsState.history || []).concat([entry]).slice(-HISTORY_LIMIT);
    this.onSave();

    try {
      this.onStreamEnd(entry);
    } catch (error) {
      this.log.warn('История стримов: ' + error.message);
    }
    return entry;
  }

  renderOffline(info) {
    const values = {
      channel: escapeHtml(this.channel),
      title: escapeHtml(info.title || 'Без названия'),
      game: escapeHtml(info.game || 'без категории'),
      duration: escapeHtml(humanDurationLong(info.durationMs)),
      durationMinutes: escapeHtml(String(Math.round((Number(info.durationMs) || 0) / 60000))),
      peak: escapeHtml(formatNumber(info.peak)),
      average: escapeHtml(formatNumber(info.average)),
      messages: escapeHtml(formatNumber(info.chat && info.chat.messages)),
      replies: escapeHtml(formatNumber(info.chat && info.chat.replies)),
      commands: escapeHtml(formatNumber(info.chat && info.chat.commands)),
      moderation: escapeHtml(formatNumber(info.moderation && info.moderation.total)),
      url: escapeHtml('https://twitch.tv/' + (this.channel || '')),
      youtube: escapeHtml(this.youtubeUrl),
      started: escapeHtml(formatTime(info.startedAt)),
      ended: escapeHtml(formatTime(info.endedAt)),
      date: escapeHtml(formatDate(info.startedAt))
    };

    let template = String(this.settings.offlineMessage || DEFAULT_OFFLINE_MESSAGE);
    // Канал YouTube берётся из тех же настроек, что и для начала стрима.
    if (this.youtubeUrl && !/\{youtube\}/.test(template)) {
      template = template.trimEnd() + '\n\n📺 YouTube: {youtube}';
    }
    if (!this.youtubeUrl) {
      template = template.replace(/^.*\{youtube\}.*$/gm, '');
    }
    const html = template.replace(
      /\{(channel|title|game|duration|durationMinutes|peak|average|messages|replies|commands|moderation|url|youtube|started|ended|date)\}/g,
      function (match, key) {
        return values[key] === undefined ? match : values[key];
      }
    );

    return clampHtml(html.replace(/\n{3,}/g, '\n\n').trim(), MAX_CAPTION);
  }

  async sendOffline(info) {
    const payload = this.basePayload();
    // Итоги — обычное сообщение в канал, без превью старого эфира.
    return this.callTelegram('sendMessage', Object.assign({}, payload, {
      text: this.renderOffline(info),
      link_preview_options: { is_disabled: true }
    }));
  }

  render(stream) {
    const startedAt = Number(stream.startedAt) || Date.now();
    const values = {
      channel: escapeHtml(stream.userName || this.channel),
      title: escapeHtml(stream.title || 'Без названия'),
      game: escapeHtml(stream.game || 'без категории'),
      viewers: escapeHtml(formatNumber(stream.viewers)),
      url: escapeHtml(this.streamUrl(stream)),
      youtube: escapeHtml(this.youtubeUrl),
      uptime: escapeHtml(humanDuration(Date.now() - startedAt)),
      started: escapeHtml(new Date(startedAt).toLocaleString('ru-RU', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
      }))
    };

    let template = String(this.settings.message || DEFAULT_MESSAGE);
    if (this.youtubeUrl && !/\{youtube\}/.test(template)) {
      template = template.trimEnd() + '\n\n📺 YouTube: {youtube}';
    }
    if (!this.youtubeUrl) {
      template = template.replace(/^.*\{youtube\}.*$/gm, '');
    }

    const html = template.replace(/\{(channel|title|game|viewers|url|youtube|uptime|started)\}/g,
      function (match, key) { return values[key]; });

    return clampHtml(html.replace(/\n{3,}/g, '\n\n').trim(), MAX_CAPTION);
  }

  basePayload() {
    const payload = {
      chat_id: this.telegram.chatId,
      parse_mode: 'HTML',
      disable_notification: this.settings.silent === true,
      link_preview_options: { is_disabled: true }
    };
    const thread = Number(this.telegram.messageThreadId);
    if (Number.isFinite(thread) && thread > 0) payload.message_thread_id = thread;
    return payload;
  }

  keyboard(stream) {
    const row = [{ text: '▶️ Смотреть стрим', url: this.streamUrl(stream) }];
    if (this.youtubeUrl) row.push({ text: '📺 YouTube', url: this.youtubeUrl });
    return { inline_keyboard: [row] };
  }

  async sendLive(stream) {
    const caption = this.render(stream);
    const payload = this.basePayload();
    const keyboard = this.keyboard(stream);
    const thumbnail = this.settings.sendPreview !== false ? normalizeThumbnail(stream.thumbnail) : '';
    let sent = null;

    if (thumbnail) {
      try {
        sent = await this.callTelegram('sendPhoto', Object.assign({}, payload, {
          photo: thumbnail,
          caption: caption,
          reply_markup: keyboard
        }));
      } catch (error) {
        this.log.warn('Telegram: фото не отправилось (' + error.message + '), отправляю текстом.');
      }
    }

    if (!sent) {
      sent = await this.callTelegram('sendMessage', Object.assign({}, payload, {
        text: caption,
        reply_markup: keyboard
      }));
    }

    return sent;
  }

  async sendTest(options) {
    if (!this.ready) {
      throw new Error('заполни streamAlerts.telegram.botToken и chatId в config.js');
    }
    const opts = options || {};
    const now = Date.now();

    if (opts.offline) {
      // Пробное сообщение об итогах стрима — с примерными цифрами.
      const example = {
        startedAt: now - 2 * 3600000 - 15 * 60000,
        endedAt: now,
        durationMs: 2 * 3600000 + 15 * 60000,
        peak: 128,
        average: 74,
        title: 'Тестовое сообщение об итогах',
        game: 'Тест',
        chat: { messages: 342, replies: 27, commands: 41 },
        moderation: { total: 3 }
      };
      await this.sendOffline(example);
      return true;
    }

    const fake = {
      live: true,
      userName: this.channel,
      title: 'Тестовое уведомление — всё работает',
      game: 'Тест',
      viewers: 0,
      startedAt: now,
      thumbnail: ''
    };
    const text = clampHtml('✅ <b>Тест уведомления</b>\n\n' + this.render(fake), MAX_CAPTION);
    await this.callTelegram('sendMessage', Object.assign(this.basePayload(), {
      text: text,
      reply_markup: this.keyboard(fake)
    }));
    return true;
  }

  async telegramRequest(method, payload) {
    const token = String(this.telegram.botToken || '');
    if (!token) throw new Error('не задан telegram.botToken');

    let response;
    try {
      response = await this.fetch('https://api.telegram.org/bot' + token + '/' + method, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {}),
        signal: AbortSignal.timeout(15000)
      });
    } catch (error) {
      throw new Error('сеть: ' + error.message);
    }

    const bodyText = await response.text();
    let data = null;
    try { data = bodyText ? JSON.parse(bodyText) : null; } catch (error) { /* not json */ }

    if (!response.ok || !data || data.ok !== true) {
      const detail = (data && (data.description || data.error)) ||
        String(bodyText || '').slice(0, 200) ||
        ('HTTP ' + response.status);
      throw new Error(detail);
    }

    return data.result || {};
  }

  async callTelegram(method, payload) {
    if (!String(this.telegram.chatId || '')) throw new Error('не задан telegram.chatId');
    return this.telegramRequest(method, payload);
  }
}

// --- CLI: тест, проверка и поиск chat_id --------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const mode = argv.indexOf('--test') !== -1 ? 'test'
    : argv.indexOf('--check') !== -1 ? 'check'
      : argv.indexOf('--chats') !== -1 ? 'chats'
        : 'help';

  if (mode === 'help') {
    console.log('');
    console.log('  Уведомления о стриме в Telegram');
    console.log('');
    console.log('  node src/stream-alerts.js --test           тест: начало стрима');
    console.log('  node src/stream-alerts.js --test --end     тест: справка об итогах стрима');
    console.log('  node src/stream-alerts.js --check          проверить стрим и настройки');
    console.log('  node src/stream-alerts.js --chats          показать chat_id из getUpdates');
    console.log('');
    return;
  }

  const { loadConfig } = require('./config');
  const { readJson, writeJson } = require('./fsutil');
  const log = require('./log');
  const { TokenStore } = require('./tokens');
  const { TwitchApi } = require('./twitch-api');

  let config;
  try {
    config = loadConfig({});
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  log.init(config.paths.log, { debug: argv.indexOf('--verbose') !== -1 });

  const store = new TokenStore(config.paths.tokens, log.child('tokens'));
  const twitchApi = new TwitchApi({
    clientId: config.twitch.clientId,
    clientSecret: config.twitch.clientSecret,
    store: store,
    log: log.child('twitch-api')
  });
  const state = readJson(config.paths.state, {}) || {};
  const alerts = new StreamAlerts({
    config: config,
    twitchApi: twitchApi,
    state: state,
    log: log.child('alerts'),
    onSave: function () { writeJson(config.paths.state, state); }
  });

  if (mode === 'test') {
    const offline = argv.indexOf('--end') !== -1;
    try {
      await alerts.sendTest({ offline: offline });
      console.log('');
      console.log('Готово: тестовое сообщение (' +
        (offline ? 'справка об итогах стрима' : 'начало стрима') +
        ') отправлено в ' + config.streamAlerts.telegram.chatId + '.');
      console.log('Проверь Telegram-канал.');
      console.log('');
    } catch (error) {
      console.error('');
      console.error('Не получилось: ' + error.message);
      console.error('Проверь botToken, chatId и что бот добавлен в канал администратором.');
      console.error('');
      process.exitCode = 1;
    }
    return;
  }

  if (mode === 'check') {
    const stream = await twitchApi.getStream(config.twitch.channel);
    console.log('');
    console.log('Канал: ' + config.twitch.channel);
    console.log('Уведомления: ' + (config.streamAlerts.enabled ? 'включены' : 'выключены') +
      (alerts.ready ? '' : ' (не заданы botToken/chatId)'));
    console.log('Справка об итогах стрима: ' +
      (config.streamAlerts.offlineEnabled !== false ? 'включена' : 'выключена (streamAlerts.offlineEnabled)'));
    console.log('В эфире: ' + (stream.unknown ? 'не удалось проверить' : (stream.live ? 'да' : 'нет')));
    if (stream.live) {
      console.log('Название: ' + (stream.title || '—'));
      console.log('Категория: ' + (stream.game || '—'));
      console.log('Зрителей: ' + (stream.viewers || 0));
    }
    const past = alerts.alertsState.history || [];
    if (past.length) {
      const last = past[past.length - 1];
      console.log('Последний стрим: ' + new Date(last.startedAt).toLocaleString('ru-RU') +
        ', ' + humanDurationLong(last.durationMs) + ', пик ' + last.peak +
        ', сообщений чата ' + last.chat.messages);
    }
    console.log('YouTube: ' + (alerts.youtubeUrl || '— (streamAlerts.youtube не задан)'));
    console.log('');
    return;
  }

  if (!String(config.streamAlerts.telegram.botToken || '')) {
    console.error('Сначала заполни streamAlerts.telegram.botToken в config.js.');
    process.exitCode = 1;
    return;
  }

  try {
    const updates = await alerts.telegramRequest('getUpdates', { limit: 100, timeout: 0 });
    const chats = new Map();
    (updates || []).forEach(function (update) {
      const message = update.message || update.channel_post ||
        update.edited_message || update.edited_channel_post;
      const chat = message && message.chat;
      if (!chat) return;
      chats.set(chat.id, {
        id: chat.id,
        type: chat.type,
        title: chat.title || chat.username || chat.first_name || ''
      });
    });

    console.log('');
    if (!chats.size) {
      console.log('Ничего не найдено.');
      console.log('Добавь бота администратором в канал и опубликуй там сообщение,');
      console.log('или напиши боту в личку, затем повтори --chats.');
    } else {
      chats.forEach(function (chat) {
        console.log('chat_id: ' + chat.id + '  (' + chat.type + (chat.title ? ', ' + chat.title : '') + ')');
      });
      console.log('');
      console.log('Скопируй нужный chat_id в config.js → streamAlerts.telegram.chatId.');
    }
    console.log('');
  } catch (error) {
    console.error('Не получилось: ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  StreamAlerts: StreamAlerts,
  DEFAULT_MESSAGE: DEFAULT_MESSAGE,
  DEFAULT_OFFLINE_MESSAGE: DEFAULT_OFFLINE_MESSAGE,
  escapeHtml: escapeHtml
};

if (require.main === module) {
  main().catch(function (error) {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
  });
}
