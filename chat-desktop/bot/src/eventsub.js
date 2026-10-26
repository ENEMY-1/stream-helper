'use strict';

// EventSub по WebSocket — нужен только для событий, которых нет в IRC:
// в первую очередь новых фоллоу. Если у токена нет права
// moderator:read:followers, модуль тихо выключается и бот работает дальше.

const { fetchCurrentUser } = require('./twitch-auth');

const WS_URL = 'wss://eventsub.wss.twitch.tv/ws';
const SUBSCRIPTIONS_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';

class EventSub {
  constructor(options) {
    const opts = options || {};
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret || '';
    this.store = opts.store;
    this.channel = String(opts.channel || '').toLowerCase();
    this.onEvent = opts.onEvent || function () {};
    this.log = opts.log || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
    this.enabled = opts.enabled !== false;

    this.ws = null;
    this.stopped = true;
    this.retry = 0;
    this.reconnectTimer = null;
    this.watchdog = null;
    this.sessionId = '';
    this.broadcasterId = '';
    this.stats = { events: 0, connectedAt: 0, lastError: '' };
  }

  async start() {
    if (!this.enabled) return false;
    if (this.stopped === false) return true;

    const twitch = this.store && this.store.twitch;
    if (!twitch || !twitch.access_token) {
      this.log.info('EventSub: нет токена Twitch — фоллоу-уведомления выключены.');
      return false;
    }
    const scopes = Array.isArray(twitch.scope) ? twitch.scope : [];
    if (scopes.indexOf('moderator:read:followers') === -1) {
      this.log.info('EventSub: для уведомлений о фоллоу перезапусти auth-twitch.bat ' +
        '(нужно право moderator:read:followers).');
      return false;
    }

    this.broadcasterId = String(twitch.user_id || '');
    if (!this.broadcasterId) {
      try {
        const token = await this.store.twitchAccessToken(this.clientId, this.clientSecret);
        const me = token ? await fetchCurrentUser(this.clientId, token) : null;
        this.broadcasterId = me ? String(me.id) : '';
      } catch (error) {
        this.log.debug('EventSub: не удалось узнать user_id:', error.message);
      }
    }
    if (!this.broadcasterId) {
      this.log.warn('EventSub: не удалось определить id канала — фоллоу-уведомления выключены.');
      return false;
    }

    this.stopped = false;
    this.connect(WS_URL);
    return true;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    clearTimeout(this.watchdog);
    this.watchdog = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      try { ws.close(); } catch (error) { /* ignore */ }
    }
  }

  connect(url) {
    if (this.stopped) return;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch (error) {
      this.stats.lastError = error.message;
      this.log.warn('EventSub: не удалось открыть сокет:', error.message);
      this.scheduleReconnect();
      return;
    }

    this.ws = ws;
    ws.addEventListener('open', () => {
      this.log.debug('EventSub: сокет открыт');
    });
    ws.addEventListener('message', (event) => {
      this.onData(String(event.data));
    });
    ws.addEventListener('error', () => {
      // подробности придут в close
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      clearTimeout(this.watchdog);
      this.watchdog = null;
      if (!this.stopped) this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    const delays = [2000, 5000, 10000, 20000, 30000, 60000];
    const wait = delays[Math.min(this.retry, delays.length - 1)];
    this.retry += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(WS_URL);
    }, wait);
    if (this.reconnectTimer.unref) this.reconnectTimer.unref();
  }

  armWatchdog(seconds) {
    clearTimeout(this.watchdog);
    const timeout = Math.max(10, Number(seconds) || 10);
    this.watchdog = setTimeout(() => {
      this.log.warn('EventSub: нет пинга ' + timeout + ' с — переподключаюсь.');
      try { if (this.ws) this.ws.close(); } catch (error) { /* ignore */ }
    }, (timeout + 10) * 1000);
    if (this.watchdog.unref) this.watchdog.unref();
  }

  onData(raw) {
    let message;
    try { message = JSON.parse(raw); } catch (error) { return; }
    if (!message || !message.metadata) return;
    const type = message.metadata.message_type;
    const payload = message.payload || {};

    if (type === 'session_welcome') {
      const session = payload.session || {};
      this.sessionId = session.id || '';
      this.retry = 0;
      this.stats.connectedAt = Date.now();
      this.armWatchdog(session.keepalive_timeout_seconds);
      this.log.info('EventSub: подключились, подписываюсь на фоллоу #' + this.channel);
      this.subscribeFollow().catch((error) => {
        this.stats.lastError = error.message;
        this.log.warn('EventSub: подписка на фоллоу не удалась — ' + error.message);
      });
      return;
    }

    if (type === 'session_keepalive') {
      this.armWatchdog(payload.session && payload.session.keepalive_timeout_seconds);
      return;
    }

    if (type === 'session_reconnect') {
      const url = payload.session && payload.session.reconnect_url;
      if (url) {
        this.log.info('EventSub: Twitch просит переподключиться');
        try { if (this.ws) this.ws.close(); } catch (error) { /* ignore */ }
        this.connect(url);
      }
      return;
    }

    if (type === 'revocation') {
      const subscription = payload.subscription || {};
      this.log.warn('EventSub: подписка «' + (subscription.type || '?') + '» отозвана: ' +
        (subscription.status || ''));
      return;
    }

    if (type === 'notification') {
      const subscription = message.metadata.subscription_type;
      const event = payload.event || {};
      this.stats.events += 1;
      if (subscription === 'channel.follow') {
        this.onEvent('follow', event);
      }
      return;
    }
  }

  async subscribeFollow() {
    if (!this.sessionId || !this.broadcasterId) return;
    const token = await this.store.twitchAccessToken(this.clientId, this.clientSecret);
    if (!token) throw new Error('нет действующего токена');

    const body = {
      type: 'channel.follow',
      version: '2',
      condition: {
        broadcaster_user_id: this.broadcasterId,
        moderator_user_id: this.broadcasterId
      },
      transport: {
        method: 'websocket',
        session_id: this.sessionId
      }
    };

    const response = await fetch(SUBSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        'Client-Id': this.clientId,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });

    if (response.ok) {
      this.log.info('EventSub: уведомления о новых фоллоу включены.');
      return;
    }
    const text = await response.text();
    if (response.status === 409) {
      this.log.debug('EventSub: подписка на фоллоу уже существует.');
      return;
    }
    throw new Error('HTTP ' + response.status + ': ' + text.slice(0, 200));
  }

  snapshot() {
    return {
      enabled: this.enabled,
      connected: !!(this.ws && this.ws.readyState === 1),
      connectedAt: this.stats.connectedAt,
      events: this.stats.events,
      lastError: this.stats.lastError
    };
  }
}

module.exports = { EventSub: EventSub };
