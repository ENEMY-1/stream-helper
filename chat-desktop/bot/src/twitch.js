'use strict';

// Twitch-чат по IRC-over-WebSocket: чтение и отправка сообщений.
// Без токена работает анонимное чтение (justinfan).

const EventEmitter = require('node:events');
const { delay } = require('./net');
const { fetchCurrentUser } = require('./twitch-auth');

const IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const SEND_INTERVAL_MS = 1600;
const MAX_QUEUE = 12;

function unescapeTag(value) {
  return String(value).replace(/\\([s:r\\n])/g, function (match, code) {
    if (code === 's') return ' ';
    if (code === ':') return ';';
    if (code === 'r') return '\r';
    if (code === 'n') return '\n';
    return '\\';
  });
}

function parseTags(raw) {
  const tags = {};
  raw.split(';').forEach(function (pair) {
    if (!pair) return;
    const index = pair.indexOf('=');
    const key = index === -1 ? pair : pair.slice(0, index);
    const value = index === -1 ? '' : pair.slice(index + 1);
    tags[key] = unescapeTag(value);
  });
  return tags;
}

function parseLine(line) {
  let rest = line;
  let tags = {};
  let prefix = '';

  if (rest.startsWith('@')) {
    const space = rest.indexOf(' ');
    if (space === -1) return null;
    tags = parseTags(rest.slice(1, space));
    rest = rest.slice(space + 1);
  }

  if (rest.startsWith(':')) {
    const space = rest.indexOf(' ');
    if (space === -1) return null;
    prefix = rest.slice(1, space);
    rest = rest.slice(space + 1);
  }

  let trailing = '';
  const trailingIndex = rest.indexOf(' :');
  if (trailingIndex !== -1) {
    trailing = rest.slice(trailingIndex + 2);
    rest = rest.slice(0, trailingIndex);
  }

  const parts = rest.split(' ').filter(Boolean);
  if (!parts.length) return null;

  return {
    tags: tags,
    prefix: prefix,
    command: parts[0].toUpperCase(),
    params: parts.slice(1),
    trailing: trailing
  };
}

function hasBadge(badges, name) {
  return String(badges || '').split(',').some(function (badge) {
    return badge.split('/')[0] === name;
  });
}

class TwitchChat extends EventEmitter {
  constructor(options) {
    super();
    this.channel = options.channel;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret || '';
    this.store = options.store;
    this.log = options.log;

    this.ws = null;
    this.status = 'idle';
    this.authed = false;
    this.readOnly = true;
    this.botLogin = options.botUsername || '';
    this.token = null;

    this.stopped = true;
    this.reconnectTimer = null;
    this.retry = 0;
    this.queue = [];
    this.sending = false;
    this.lastAuthWarn = 0;

    this.stats = { connectedAt: null, messages: 0, sent: 0 };
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.queue = [];
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { ws.close(); } catch (e) { /* ignore */ }
    }
    this.setStatus('offline');
  }

  setStatus(status) {
    if (this.status !== status) {
      this.status = status;
      this.emit('status', status);
    }
  }

  async getLogin(token) {
    const configured = this.botLogin || this.store.getTwitchLogin();
    if (configured) {
      this.botLogin = configured;
      return configured;
    }
    if (!token) return '';
    try {
      const me = await fetchCurrentUser(this.clientId, token);
      if (me && me.login) {
        this.botLogin = me.login;
        const twitch = this.store.twitch;
        if (twitch) {
          twitch.login = me.login;
          twitch.user_id = me.id;
          this.store.setTwitch(twitch);
        }
        return me.login;
      }
    } catch (error) {
      this.log.debug('Не удалось узнать логин бота:', error.message);
    }
    return '';
  }

  async connect() {
    clearTimeout(this.reconnectTimer);
    if (this.stopped) return;

    this.setStatus('connecting');

    let token = null;
    try {
      token = await this.store.twitchAccessToken(this.clientId, this.clientSecret);
    } catch (error) {
      this.log.warn('Twitch-токен:', error.message);
    }

    this.token = token;
    const login = await this.getLogin(token);
    const nick = login || ('justinfan' + Math.floor(10000 + Math.random() * 80000));

    let ws;
    try {
      ws = new WebSocket(IRC_URL);
    } catch (error) {
      this.log.error('Не удалось открыть Twitch WebSocket:', error.message);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    this.authed = false;

    ws.addEventListener('open', () => {
      this.log.debug('Twitch WebSocket открыт');
      this.raw('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
      if (token && login) {
        this.raw('PASS oauth:' + token);
        this.raw('NICK ' + login);
      } else {
        this.raw('NICK ' + nick);
      }
      this.raw('JOIN #' + this.channel);
    });

    ws.addEventListener('message', (event) => {
      this.onData(String(event.data));
    });

    ws.addEventListener('error', () => {
      // Подробности придут в близком 'close'.
    });

    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      this.setStatus('offline');
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delays = [2000, 5000, 10000, 20000, 30000, 60000];
    const wait = delays[Math.min(this.retry, delays.length - 1)];
    this.retry += 1;
    this.log.info('Twitch переподключение через ' + Math.round(wait / 1000) + ' с');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, wait);
  }

  raw(line) {
    if (!this.ws || this.ws.readyState !== 1) return false;
    try {
      this.ws.send(line + '\r\n');
      return true;
    } catch (error) {
      this.log.debug('Twitch send failed:', error.message);
      return false;
    }
  }

  onData(chunk) {
    const lines = chunk.split('\r\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line) this.onLine(line);
    }
  }

  onLine(line) {
    if (line === 'PING :tmi.twitch.tv' || line.startsWith('PING')) {
      this.raw('PONG :tmi.twitch.tv');
      return;
    }

    const parsed = parseLine(line);
    if (!parsed) return;

    if (parsed.command === '001') {
      this.authed = !!(this.token && this.botLogin);
      this.readOnly = !this.authed;
      if (this.authed) {
        this.log.info('Twitch: вошли как @' + this.botLogin);
      } else {
        this.log.info('Twitch: анонимное чтение (отправка выключена)');
      }
      return;
    }

    if (parsed.command === '366') {
      this.retry = 0;
      this.stats.connectedAt = Date.now();
      this.setStatus('online');
      this.log.info('Twitch: подключились к #' + this.channel);
      this.emit('online');
      return;
    }

    if (parsed.command === 'NOTICE') {
      this.onNotice(parsed.tags, parsed.trailing);
      return;
    }

    if (parsed.command === 'RECONNECT') {
      this.log.info('Twitch просит переподключиться');
      try { if (this.ws) this.ws.close(); } catch (e) { /* ignore */ }
      return;
    }

    if (parsed.command === 'USERNOTICE') {
      this.onUsernotice(parsed);
      return;
    }

    if (parsed.command === 'CLEARCHAT') {
      this.emit('clearchat', {
        channel: (parsed.params[0] || '').replace(/^#/, ''),
        login: parsed.trailing || '',
        duration: Number(parsed.tags['ban-duration']) || 0,
        reason: parsed.tags['ban-reason'] || ''
      });
      return;
    }

    if (parsed.command === 'CLEARMSG') {
      this.emit('clearmsg', {
        login: parsed.tags.login || '',
        messageId: parsed.tags['target-msg-id'] || '',
        text: parsed.trailing || ''
      });
      return;
    }

    if (parsed.command === 'PRIVMSG') {
      this.onPrivmsg(parsed);
    }
  }

  onNotice(tags, text) {
    const id = tags['msg-id'] || '';
    if (id === 'login_authentication_failed') {
      this.authed = false;
      this.readOnly = true;
      this.log.error('Twitch не принял токен. Запусти auth-twitch.bat.');
      this.emit('auth-error');
      return;
    }
    if (id === 'msg_channel_suspended' || id === 'msg_banned') {
      this.log.error('Twitch:', text);
      return;
    }
    if (id === 'msg_ratelimit') {
      this.log.warn('Twitch: сработал лимит сообщений, притормаживаю');
      return;
    }
    this.log.debug('Twitch NOTICE [' + id + ']', text);
  }

  onPrivmsg(parsed) {
    const channel = (parsed.params[0] || '').replace(/^#/, '').toLowerCase();
    if (channel !== this.channel) return;

    const tags = parsed.tags;
    const login = (parsed.prefix.split('!')[0] || '').toLowerCase();
    if (!login) return;
    if (this.botLogin && login === this.botLogin.toLowerCase()) return;

    const isBroadcaster = login === this.channel || hasBadge(tags.badges, 'broadcaster');
    const isMod = tags.mod === '1' || hasBadge(tags.badges, 'moderator') || isBroadcaster;
    const isSubscriber = tags.subscriber === '1' ||
      hasBadge(tags.badges, 'subscriber') ||
      hasBadge(tags.badges, 'founder');
    const isVip = hasBadge(tags.badges, 'vip');

    this.stats.messages += 1;
    this.emit('message', {
      platform: 'twitch',
      id: tags.id || '',
      user: tags['display-name'] || login,
      login: login,
      userId: tags['user-id'] || '',
      text: parsed.trailing || '',
      isMod: isMod,
      isBroadcaster: isBroadcaster,
      isSubscriber: isSubscriber,
      isVip: isVip,
      bits: Number(tags.bits) || 0,
      color: tags.color || '',
      ts: Number(tags['tmi-sent-ts']) || Date.now()
    });
  }

  // USERNOTICE приходит на подписки, продления, подарочные подписки и рейды.
  onUsernotice(parsed) {
    const tags = parsed.tags || {};
    const type = String(tags['msg-id'] || '').toLowerCase();
    if (!type) return;

    const login = String(tags.login || '').toLowerCase();
    const data = {
      platform: 'twitch',
      id: tags.id || '',
      type: type,
      user: tags['display-name'] || login,
      login: login,
      userId: tags['user-id'] || '',
      systemMsg: tags['system-msg'] || '',
      text: parsed.trailing || '',
      months: Number(tags['msg-param-cumulative-months'] || tags['msg-param-months']) || 0,
      recipient: tags['msg-param-recipient-display-name'] || '',
      recipientLogin: tags['msg-param-recipient-user-name'] || '',
      count: Number(tags['msg-param-mass-gift-count']) || 0,
      viewers: Number(tags['msg-param-viewerCount']) || 0,
      tier: tags['msg-param-sub-plan'] || tags['msg-param-sub-plan-name'] || '',
      ts: Number(tags['tmi-sent-ts']) || Date.now()
    };

    this.emit('usernotice', data);
  }

  say(text) {
    if (!this.authed || this.readOnly) {
      const now = Date.now();
      if (now - this.lastAuthWarn > 60000) {
        this.lastAuthWarn = now;
        this.log.warn('Twitch: нет действующего токена, сообщение не отправлено.');
      }
      return false;
    }

    const clean = String(text == null ? '' : text).replace(/[\r\n]+/g, ' ').trim();
    if (!clean) return false;

    this.queue.push(clean);
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
    this.pump();
    return true;
  }

  // --- команды модерации через чат (работают, если бот — модератор) ------

  deleteMessage(messageId) {
    const id = String(messageId || '').trim();
    if (!/^[a-z0-9-]{8,}$/i.test(id)) return false;
    return this.say('/delete ' + id);
  }

  timeout(login, seconds, reason) {
    const target = String(login || '').replace(/^@/, '').toLowerCase();
    if (!target) return false;
    const duration = Math.max(1, Math.min(1209600, Math.round(Number(seconds) || 300)));
    const why = String(reason || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    return this.say('/timeout ' + target + ' ' + duration + (why ? ' ' + why : ''));
  }

  ban(login, reason) {
    const target = String(login || '').replace(/^@/, '').toLowerCase();
    if (!target) return false;
    const why = String(reason || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
    return this.say('/ban ' + target + (why ? ' ' + why : ''));
  }

  unban(login) {
    const target = String(login || '').replace(/^@/, '').toLowerCase();
    if (!target) return false;
    return this.say('/unban ' + target);
  }

  async pump() {
    if (this.sending) return;
    this.sending = true;
    try {
      while (this.queue.length && this.authed && this.ws && this.ws.readyState === 1) {
        const text = this.queue.shift();
        if (this.raw('PRIVMSG #' + this.channel + ' :' + text)) {
          this.stats.sent += 1;
          this.emit('sent', text);
        }
        await delay(SEND_INTERVAL_MS);
      }
    } finally {
      this.sending = false;
    }
  }
}

module.exports = {
  TwitchChat: TwitchChat,
  parseLine: parseLine
};
