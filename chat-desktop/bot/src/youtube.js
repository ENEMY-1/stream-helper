'use strict';

// YouTube Live Chat: чтение (через chat-desktop или напрямую) и отправка (OAuth).

const EventEmitter = require('node:events');
const { requestJson, delay } = require('./net');
const { readJson, writeJson, truncate, ptDay } = require('./fsutil');

const API = 'https://www.googleapis.com/youtube/v3';

function nextPacificMidnight(from) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date(from || Date.now()));

  const values = {};
  parts.forEach(function (part) { values[part.type] = part.value; });

  const hour = Number(values.hour) % 24;
  const minute = Number(values.minute) || 0;
  const second = Number(values.second) || 0;
  const elapsed = ((hour * 60 + minute) * 60 + second) * 1000;
  return Date.now() + (24 * 3600 * 1000 - elapsed) + 5 * 60000;
}

class YouTubeChat extends EventEmitter {
  constructor(options) {
    super();
    this.config = options.config;
    this.cfg = options.config.youtube || {};
    this.store = options.store;
    this.google = options.google;
    this.log = options.log;
    this.quotaFile = options.quotaFile;
    this.dry = !!options.dry;

    this.stopped = true;
    this.mode = 'idle';
    this.relayStatus = 'unknown';
    this.relayInitialized = false;
    this.seq = 0;
    this.pageToken = null;
    this.chatId = null;
    this.videoId = this.cfg.videoId || '';
    this.liveTitle = '';
    this.chatResolvedAt = 0;
    this.resolving = null;
    this.resolveBlockedUntil = 0;
    this.lastResolveError = '';
    this.lastError = '';
    this.lastContactAt = 0;
    this.lastSentAt = 0;
    this.sentCount = 0;
    this.noTokenWarned = false;
    this.budgetWarnedAt = 0;
    this.relayWarned = false;

    this.seen = new Set();
    this.quota = this.loadQuota();
  }

  // -------------------------------------------------------------------
  //  Квота
  // -------------------------------------------------------------------
  loadQuota() {
    const saved = readJson(this.quotaFile, null);
    const today = ptDay();
    if (!saved || saved.date !== today) {
      return { date: today, units: 0, replyUnits: 0, replies: 0 };
    }
    return {
      date: today,
      units: Number(saved.units) || 0,
      replyUnits: Number(saved.replyUnits) || 0,
      replies: Number(saved.replies) || 0
    };
  }

  rollQuota() {
    const today = ptDay();
    if (this.quota.date !== today) {
      this.quota = { date: today, units: 0, replyUnits: 0, replies: 0 };
      this.saveQuota();
    }
  }

  saveQuota() {
    writeJson(this.quotaFile, this.quota);
  }

  spend(units, isReply) {
    this.rollQuota();
    this.quota.units += units;
    if (isReply) {
      this.quota.replyUnits += units;
      this.quota.replies += 1;
    }
    this.saveQuota();
  }

  // -------------------------------------------------------------------
  //  Чтение
  // -------------------------------------------------------------------
  start() {
    if (this.stopped === false) return;
    this.stopped = false;
    this.loop().catch((error) => {
      this.log.error('YouTube loop:', error.stack || error.message);
    });
  }

  stop() {
    this.stopped = true;
  }

  async loop() {
    while (!this.stopped) {
      let relayOk = false;
      if (this.cfg.useRelay && this.cfg.relayUrl) {
        relayOk = await this.relayStep();
      }
      if (this.stopped) break;
      if (!relayOk) await this.directStep();
    }
  }

  async relayStep() {
    try {
      const feed = await requestJson(
        this.cfg.relayUrl + '/yt/feed?since=' + this.seq,
        { timeoutMs: 6000 }
      );

      this.mode = 'relay';
      this.relayStatus = feed.status || 'unknown';
      this.lastError = feed.error || '';
      this.lastContactAt = Date.now();

      if (!this.relayInitialized) {
        // Не отвечаем на сообщения, которые висели в чате до запуска бота.
        this.relayInitialized = true;
        this.seq = Number(feed.seq) || 0;
      } else {
        const messages = feed.messages || [];
        this.seq = Number(feed.seq) || this.seq;
        messages.forEach((message) => this.emitRelayMessage(message));
      }

      if (this.relayWarned) {
        this.relayWarned = false;
        this.log.info('YouTube-ретранслятор снова доступен');
      }

      // Ретранслятор отдаёт готовые сообщения локально и без квоты API,
      // поэтому отвечаем на команды почти сразу (а не через 3.5 секунды).
      await delay(1000);
      return true;
    } catch (error) {
      if (!this.relayWarned) {
        this.relayWarned = true;
        this.log.warn('YouTube-ретранслятор недоступен, читаю через API:', error.message);
      }
      this.mode = 'direct';
      return false;
    }
  }

  emitRelayMessage(message) {
    if (!message || !message.text || !message.id) return;
    if (this.seen.has(message.id)) return;
    this.remember(message.id);
    this.emit('message', {
      platform: 'youtube',
      id: message.id,
      user: message.user || 'YouTube',
      userId: message.seed || '',
      text: message.text,
      isMod: false,
      isBroadcaster: false,
      ts: Date.now()
    });
  }

  emitApiItem(item) {
    const snippet = item.snippet || {};
    const author = item.authorDetails || {};
    const text = snippet.displayMessage || '';
    if (!text || !item.id) return;
    if (this.seen.has(item.id)) return;
    this.remember(item.id);

    const publishedAt = snippet.publishedAt ? Date.parse(snippet.publishedAt) : Date.now();
    this.emit('message', {
      platform: 'youtube',
      id: item.id,
      user: author.displayName || 'YouTube',
      userId: author.channelId || '',
      text: text,
      isMod: !!author.isChatModerator,
      isBroadcaster: !!author.isChatOwner,
      ts: publishedAt
    });
  }

  remember(id) {
    this.seen.add(id);
    if (this.seen.size > 1200) {
      const first = this.seen.values().next().value;
      this.seen.delete(first);
    }
  }

  async directStep() {
    if (!this.cfg.apiKey) {
      this.lastError = 'не задан youtube.apiKey';
      await delay(60000);
      return;
    }

    try {
      if (!this.chatId) await this.resolveLive();

      const params = {
        liveChatId: this.chatId,
        part: 'snippet,authorDetails',
        maxResults: 200
      };
      if (this.pageToken) params.pageToken = this.pageToken;

      const data = await this.apiRequest('liveChat/messages', params, 5);
      const firstPoll = !this.relayInitialized && !this.pageToken;
      this.relayInitialized = true;
      this.pageToken = data.nextPageToken || this.pageToken;

      this.relayStatus = 'ok';
      this.lastError = '';
      this.lastContactAt = Date.now();

      const cutoff = Date.now() - 120000;
      (data.items || []).forEach((item) => {
        if (firstPoll) {
          const published = item.snippet && item.snippet.publishedAt;
          if (!published || Date.parse(published) < cutoff) return;
        }
        this.emitApiItem(item);
      });

      const wait = Math.max(Number(data.pollingIntervalMillis) || 0, 12000);
      await delay(wait);
    } catch (error) {
      this.lastError = error.message;

      if (error.code === 'BUDGET') {
        if (Date.now() - this.budgetWarnedAt > 600000) {
          this.budgetWarnedAt = Date.now();
          this.log.warn('YouTube:', error.message, '— читаю только через ретранслятор.');
        }
        await delay(600000);
        return;
      }

      if (/не в эфире|нет активного чата|канал не найден|нет видео|у этого видео/i.test(error.message)) {
        this.relayStatus = 'wait';
        this.chatId = null;
        this.pageToken = null;
        this.log.info('YouTube: ' + error.message);
        await delay(60000);
        return;
      }

      this.log.warn('YouTube:', error.message);
      await delay(30000);
    }
  }

  async apiRequest(pathname, params, units, withAuth) {
    this.rollQuota();
    if (this.quota.units + units > Number(this.cfg.allBudgetUnits || 0)) {
      const error = new Error('дневной лимит YouTube API исчерпан (' + this.quota.units + '/' + this.cfg.allBudgetUnits + ')');
      error.code = 'BUDGET';
      throw error;
    }

    const url = new URL(API + '/' + pathname);
    Object.keys(params || {}).forEach(function (key) {
      const value = params[key];
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });

    const headers = {};
    if (withAuth) {
      headers.Authorization = 'Bearer ' + await this.google.accessToken();
    } else {
      if (!this.cfg.apiKey) throw new Error('не задан youtube.apiKey');
      url.searchParams.set('key', this.cfg.apiKey);
    }

    this.spend(units, false);
    return requestJson(url.toString(), { headers: headers, timeoutMs: 15000 });
  }

  async resolveLive() {
    if (this.chatId) return this.chatId;
    if (this.resolving) return this.resolving;

    if (this.resolveBlockedUntil > Date.now()) {
      throw new Error(this.lastResolveError || 'канал не в эфире');
    }

    this.resolving = this.resolveLiveNow().finally(() => {
      this.resolving = null;
    });
    return this.resolving;
  }

  async resolveLiveNow() {
    try {
      const videoId = this.cfg.videoId;

      if (videoId) {
        const data = await this.apiRequest('videos', {
          part: 'liveStreamingDetails,snippet',
          id: videoId
        }, 1);
        const item = (data.items || [])[0];
        const chatId = item && item.liveStreamingDetails && item.liveStreamingDetails.activeLiveChatId;
        if (!chatId) throw new Error('у этого видео нет активного чата');
        this.chatId = chatId;
        this.videoId = videoId;
        this.liveTitle = (item.snippet && item.snippet.title) || '';
      } else {
        let channelId = this.cfg.channelId;
        if (!channelId) throw new Error('не задан youtube.channelId');

        if (channelId.startsWith('@')) {
          const data = await this.apiRequest('channels', { part: 'id', forHandle: channelId }, 1);
          const found = (data.items || [])[0];
          if (!found) throw new Error('канал не найден: ' + channelId);
          channelId = found.id;
        }

        const channel = await this.apiRequest('channels', {
          part: 'contentDetails',
          id: channelId
        }, 1);
        const details = channel.items && channel.items[0] && channel.items[0].contentDetails;
        const uploads = details && details.relatedPlaylists && details.relatedPlaylists.uploads;
        if (!uploads) throw new Error('не удалось получить список видео канала');

        const playlist = await this.apiRequest('playlistItems', {
          part: 'contentDetails',
          playlistId: uploads,
          maxResults: 10
        }, 1);
        const ids = (playlist.items || []).map(function (item) {
          return item.contentDetails && item.contentDetails.videoId;
        }).filter(Boolean);
        if (!ids.length) throw new Error('на канале нет видео');

        const videos = await this.apiRequest('videos', {
          part: 'liveStreamingDetails,snippet',
          id: ids.join(','),
          maxResults: 50
        }, 1);

        const live = (videos.items || []).find(function (item) {
          const liveDetails = item.liveStreamingDetails || {};
          return liveDetails.activeLiveChatId && liveDetails.actualStartTime && !liveDetails.actualEndTime;
        });
        if (!live) throw new Error('канал не в эфире');

        this.chatId = live.liveStreamingDetails.activeLiveChatId;
        this.videoId = live.id;
        this.liveTitle = (live.snippet && live.snippet.title) || '';
      }

      this.chatResolvedAt = Date.now();
      this.resolveBlockedUntil = 0;
      this.lastResolveError = '';
      this.log.info('YouTube: эфир найден', this.videoId, this.liveTitle ? '— ' + this.liveTitle : '');
      return this.chatId;
    } catch (error) {
      if (/не в эфире|нет активного чата|у этого видео/i.test(error.message)) {
        this.lastResolveError = error.message;
        this.resolveBlockedUntil = Date.now() + 5 * 60000;
      }
      throw error;
    }
  }

  // -------------------------------------------------------------------
  //  Отправка
  // -------------------------------------------------------------------
  canSpendReply() {
    this.rollQuota();
    return this.quota.replyUnits + 20 <= Number(this.cfg.replyBudgetUnits || 0);
  }

  async say(text) {
    const clean = truncate(text, 200);
    if (!clean) return { ok: false, reason: 'empty' };

    if (this.dry) {
      this.log.info('[dry] youtube: ' + clean);
      return { ok: true, dry: true };
    }

    if (!this.google || !this.google.hasToken()) {
      if (!this.noTokenWarned) {
        this.noTokenWarned = true;
        this.log.warn('YouTube: нет OAuth-токена, бот только читает. Запусти auth-youtube.bat.');
      }
      return { ok: false, reason: 'no-token' };
    }

    if (!this.canSpendReply()) {
      if (Date.now() - this.budgetWarnedAt > 600000) {
        this.budgetWarnedAt = Date.now();
        this.log.warn('YouTube: бюджет ответов на сегодня исчерпан (' + this.quota.replyUnits + '/' + this.cfg.replyBudgetUnits + ' единиц).');
      }
      return { ok: false, reason: 'reply-budget' };
    }

    const wait = this.cfg.minReplyIntervalMs - (Date.now() - this.lastSentAt);
    if (wait > 0) await delay(wait);

    let chatId;
    try {
      chatId = await this.resolveLive();
    } catch (error) {
      this.log.debug('YouTube: некуда писать —', error.message);
      return { ok: false, reason: 'not-live', error: error.message };
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const token = await this.google.accessToken();
        this.rollQuota();
        if (this.quota.replyUnits + 20 > Number(this.cfg.replyBudgetUnits || 0)) {
          return { ok: false, reason: 'reply-budget' };
        }
        await requestJson(API + '/liveChat/messages?part=snippet', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            snippet: {
              liveChatId: chatId,
              type: 'textMessageEvent',
              textMessageDetails: { messageText: clean }
            }
          }),
          timeoutMs: 15000
        });
        this.spend(20, true);
        this.lastSentAt = Date.now();
        this.sentCount += 1;
        this.emit('sent', clean);
        return { ok: true };
      } catch (error) {
        this.lastError = error.message;

        if (error.status === 401 && attempt === 0) {
          try { await this.google.refresh(); } catch (e) { /* handled below */ }
          continue;
        }

        if (error.status === 403 && /quota/i.test(error.message)) {
          const until = nextPacificMidnight();
          this.budgetWarnedAt = Date.now();
          this.log.error('YouTube: квота API закончилась до полуночи по Тихоокеанскому времени (' +
            new Date(until).toLocaleString('ru-RU') + ').');
          return { ok: false, reason: 'quota', error: error.message };
        }

        if (error.status === 403 && /liveChatEnded|liveChatNotFound|liveChatDisabled/i.test(error.message)) {
          this.chatId = null;
          this.pageToken = null;
          return { ok: false, reason: 'chat-closed', error: error.message };
        }

        if ((error.status === 429 || /rateLimitExceeded/i.test(error.message)) && attempt === 0) {
          await delay(6000);
          continue;
        }

        this.log.warn('YouTube: сообщение не отправлено —', error.message);
        return { ok: false, reason: 'error', error: error.message };
      }
    }

    return { ok: false, reason: 'error' };
  }

  snapshot() {
    this.rollQuota();
    return {
      mode: this.mode,
      status: this.relayStatus,
      chat: this.chatId ? this.videoId || 'активен' : '',
      error: this.lastError,
      lastContactAt: this.lastContactAt,
      sent: this.sentCount,
      quota: {
        date: this.quota.date,
        units: this.quota.units,
        allBudget: Number(this.cfg.allBudgetUnits) || 0,
        replyUnits: this.quota.replyUnits,
        replyBudget: Number(this.cfg.replyBudgetUnits) || 0,
        replies: this.quota.replies
      }
    };
  }
}

module.exports = {
  YouTubeChat: YouTubeChat,
  nextPacificMidnight: nextPacificMidnight
};
