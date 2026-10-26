'use strict';

// =====================================================================
//  Чтение чата YouTube без Data API v3 и без дневной квоты.
//
//  Data API берёт 5 единиц за один опрос liveChat/messages, поэтому при
//  лимите 10 000 в сутки чат можно опрашивать в среднем раз в 43 секунды
//  (иначе квота кончается за несколько часов стрима). Отсюда задержки.
//
//  Здесь используется тот же запрос, что делает сама страница YouTube:
//    1. /live_chat?v=VIDEO_ID  -> начальный токен (continuation);
//    2. POST /youtubei/v1/live_chat/get_live_chat -> пачка сообщений.
//  Это не расходует квоту Google Cloud, поэтому опрос можно делать
//  каждые 1-2 секунды.
//
//  Модуль не зависит от Electron — его можно запустить из Node:
//    node yt-live.js --test <videoId|@handle|UC...>
// =====================================================================

const YT_BASE = 'https://www.youtube.com';
const DEFAULT_CLIENT_VERSION = '2.20261022.01.00';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const BASE_HEADERS = {
  'user-agent': USER_AGENT,
  'accept-language': 'en-US,en;q=0.9',
  cookie: 'CONSENT=YES+1; SOCS=CAI'
};

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

async function requestText(url, options) {
  const opts = options || {};
  const headers = Object.assign({}, BASE_HEADERS, opts.headers || {});
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: headers,
    body: opts.body,
    redirect: 'follow',
    signal: AbortSignal.timeout(opts.timeoutMs || 15000)
  });
  const text = await res.text();
  if (!res.ok) {
    const error = new Error('HTTP ' + res.status + (text ? ': ' + text.slice(0, 180) : ''));
    error.status = res.status;
    throw error;
  }
  return text;
}

// Достаёт объект ytInitialData из HTML страницы YouTube.
function extractInitialData(html) {
  const markers = ['window["ytInitialData"] = ', 'ytInitialData = '];
  for (let m = 0; m < markers.length; m++) {
    const marker = markers[m];
    const at = html.indexOf(marker);
    if (at < 0) continue;
    const start = at + marker.length;
    const end = html.indexOf(';</script>', start);
    if (end < 0) continue;
    try {
      return JSON.parse(html.slice(start, end));
    } catch (error) {
      continue;
    }
  }
  return null;
}

// Рекурсивный поиск первого объекта под нужным ключом.
function deepFind(node, key, depth) {
  const level = depth || 0;
  if (!node || typeof node !== 'object' || level > 12) return null;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      const found = deepFind(node[i], key, level + 1);
      if (found) return found;
    }
    return null;
  }
  if (Object.prototype.hasOwnProperty.call(node, key)) return node[key];
  const keys = Object.keys(node);
  for (let i = 0; i < keys.length; i++) {
    const found = deepFind(node[keys[i]], key, level + 1);
    if (found) return found;
  }
  return null;
}

// Текст из YouTube-структуры {simpleText} или {runs:[{text}|{emoji}]}.
function textOf(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (value.simpleText != null) return String(value.simpleText);
  if (Array.isArray(value.runs)) {
    return value.runs.map(function (run) {
      if (!run) return '';
      if (run.text != null) return String(run.text);
      if (run.emoji) return run.emoji.emojiId || (run.emoji.shortcuts && run.emoji.shortcuts[0]) || '';
      return '';
    }).join('');
  }
  return '';
}

function chatContinuation(init) {
  const renderer = deepFind(init, 'liveChatRenderer');
  if (!renderer) return '';
  if (renderer.continuation) return renderer.continuation;
  // Начальный токен лежит в continuations[0].invalidationContinuationData.
  return pickContinuation(renderer.continuations).continuation;
}

function pageErrorText(init) {
  if (!init) return '';
  const message = deepFind(init, 'messageRenderer');
  if (message) {
    const text = textOf(message.text) || textOf(message.subtext);
    if (text) return text;
  }
  const error = deepFind(init, 'errorRenderer');
  if (error) {
    const text = textOf(error.text);
    if (text) return text;
  }
  return '';
}

// Ссылка «канал сейчас в эфире» -> id видео.
function extractVideoId(html) {
  const patterns = [
    /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/,
    /<meta property="og:url" content="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/,
    /"canonicalBaseUrl":"\\?\/watch\?v=([\w-]{11})"/,
    /"videoId":"([\w-]{11})"[^}]{0,400}"isLive":true/
  ];
  for (let i = 0; i < patterns.length; i++) {
    const match = patterns[i].exec(html);
    if (match) return match[1];
  }
  return '';
}

function pickContinuation(list) {
  const items = Array.isArray(list) ? list : [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i] || {};
    const data = item.invalidationContinuationData || item.timedContinuationData ||
      item.reloadContinuationData || item.liveChatReplayContinuationData;
    if (data && data.continuation) {
      return { continuation: data.continuation, timeoutMs: Number(data.timeoutMs) || 0 };
    }
  }
  return { continuation: '', timeoutMs: 0 };
}

function isModerator(renderer) {
  const badges = renderer.authorBadges || [];
  return badges.some(function (badge) {
    const data = (badge && badge.liveChatAuthorBadgeRenderer) || {};
    return /moderator/i.test(data.tooltip || '');
  });
}

function isOwner(renderer) {
  const badges = renderer.authorBadges || [];
  return badges.some(function (badge) {
    const data = (badge && badge.liveChatAuthorBadgeRenderer) || {};
    return /owner/i.test(data.tooltip || '');
  });
}

// Одно действие из ответа get_live_chat -> сообщение чата (или null).
function parseAction(action) {
  const item = action && action.addChatItemAction && action.addChatItemAction.item;
  if (!item) return null;

  const key = Object.keys(item).find(function (name) { return /Renderer$/.test(name); });
  if (!key) return null;

  // Системные сообщения (вход в чат, смена режима) в оверлее не нужны.
  if (key === 'liveChatViewerEngagementMessageRenderer') return null;
  if (key === 'liveChatModeChangeMessageRenderer') return null;

  const renderer = item[key] || {};
  const text = textOf(renderer.message);
  if (!text) return null;

  let kind = 'text';
  if (key === 'liveChatPaidMessageRenderer' || key === 'liveChatPaidStickerRenderer') kind = 'paid';
  else if (key === 'liveChatMembershipItemRenderer') kind = 'member';
  else if (/Sponsorships/i.test(key)) kind = 'gift';

  const id = renderer.id || (kind + ':' + String(renderer.timestampUsec || '') + ':' + text.slice(0, 40));
  return {
    id: id,
    user: textOf(renderer.authorName) || 'youtube',
    seed: renderer.authorExternalChannelId || '',
    text: text,
    ts: renderer.timestampUsec ? Math.round(Number(renderer.timestampUsec) / 1000) : Date.now(),
    kind: kind,
    isMod: isModerator(renderer),
    isBroadcaster: isOwner(renderer)
  };
}

class YouTubeWebReader {
  constructor(options) {
    const opts = options || {};
    this.log = opts.log || function () {};
    this.onMessage = opts.onMessage || function () {};
    this.onStatus = opts.onStatus || function () {};
    this.pollMs = clamp(opts.pollMs || 2000, 800, 5000);

    this.stopped = true;
    this.running = false;
    this.channelId = '';
    this.fixedVideoId = '';
    this.videoId = '';
    this.continuation = '';
    this.clientVersion = DEFAULT_CLIENT_VERSION;
    this.failures = 0;
    this.emptyPolls = 0;
    this.status = 'init';
    this.error = '';
    this.seen = new Set();
  }

  configure(cfg) {
    const options = cfg || {};
    this.channelId = String(options.channelId || '').trim();
    this.fixedVideoId = String(options.videoId || '').trim();
    this.videoId = this.fixedVideoId;
    this.continuation = '';
    this.failures = 0;
    this.emptyPolls = 0;
    this.status = 'init';
    this.error = '';
  }

  start() {
    if (this.running) return;
    this.stopped = false;
    this.running = true;
    this.loop().catch((error) => {
      this.log('youtube web reader stopped', error && error.message);
    }).finally(() => {
      this.running = false;
    });
  }

  stop() {
    this.stopped = true;
  }

  snapshot() {
    return {
      status: this.status,
      error: this.error,
      videoId: this.videoId,
      failures: this.failures
    };
  }

  setStatus(status, error, extra) {
    this.status = status;
    this.error = error || '';
    const info = Object.assign({
      status: status,
      error: this.error,
      videoId: this.videoId
    }, extra || {});
    this.onStatus(info);
  }

  async loop() {
    while (!this.stopped) {
      try {
        if (!this.continuation) await this.connect();
        const result = await this.poll();
        if (this.stopped) break;
        this.failures = 0;
        this.setStatus('ok');
        const wait = Math.max(this.pollMs, clamp(result.timeoutMs, 0, 1500));
        await sleep(wait);
      } catch (error) {
        if (this.stopped) break;
        this.failures += 1;
        this.handleError(error);
        await sleep(this.retryDelay(error));
      }
    }
  }

  retryDelay(error) {
    if (error && error.status === 429) return Math.min(60000, 5000 * this.failures);
    if (this.status === 'wait') return 30000;
    if (this.failures >= 5) return 60000;
    return Math.min(30000, 1200 * Math.pow(2, Math.min(this.failures, 4)));
  }

  handleError(error) {
    const message = String((error && error.message) || error || 'неизвестная ошибка');
    const status = error && error.status;

    // Чат закрылся / видео закончилось / чат выключен — ждём новый эфир.
    if (/chat is disabled|чат.*отключ|no longer available|not available|not live|не в эфире|нет активного чата|закрыт|заверш/i.test(message)) {
      const repeat = this.status === 'wait' && this.error === message;
      this.continuation = '';
      if (!this.fixedVideoId) this.videoId = '';
      this.setStatus('wait', message);
      if (!repeat) this.log('youtube web: ' + message);
      return;
    }

    // Токен протух — переподключаемся.
    if (status === 400 || status === 403) {
      this.continuation = '';
      if (this.failures >= 2 && !this.fixedVideoId) this.videoId = '';
    }

    if (this.failures >= 5) {
      this.setStatus('blocked', message);
    } else {
      this.setStatus('error', message);
    }
    if (this.failures === 1 || this.failures % 10 === 0) {
      this.log('youtube web: ' + message);
    }
  }

  // Находит текущий эфир канала (без Data API) и открывает его чат.
  async connect() {
    this.setStatus('resolving');
    let videoId = this.fixedVideoId || this.videoId;
    if (!videoId) videoId = await this.resolveVideoId();

    const url = YT_BASE + '/live_chat?v=' + encodeURIComponent(videoId) +
      '&is_popout=1&dark_theme=1';
    const html = await requestText(url, { timeoutMs: 15000 });

    const version = /"INNERTUBE_CLIENT_VERSION":"([^"]+)"/.exec(html);
    if (version) this.clientVersion = version[1];

    const init = extractInitialData(html);
    const continuation = chatContinuation(init);
    if (!continuation) {
      const reason = pageErrorText(init) || 'канал не в эфире (или чат выключен)';
      const error = new Error(reason);
      error.status = 404;
      throw error;
    }

    this.continuation = continuation;
    this.videoId = videoId;
    this.log('youtube web: чат подключён', videoId);
    this.setStatus('ok', '', { videoId: videoId });
  }

  async resolveVideoId() {
    if (this.videoId) return this.videoId;
    if (!this.channelId) throw new Error('не задан youtube.channelId');

    const isId = /^UC[\w-]{20,}$/i.test(this.channelId);
    const handle = this.channelId.charAt(0) === '@' ? this.channelId : '@' + this.channelId;
    const url = isId
      ? YT_BASE + '/channel/' + encodeURIComponent(this.channelId) + '/live'
      : YT_BASE + '/' + handle + '/live';

    const html = await requestText(url, { timeoutMs: 15000 });
    const videoId = extractVideoId(html);
    if (!videoId) {
      const error = new Error('канал не в эфире');
      error.status = 404;
      throw error;
    }
    this.videoId = videoId;
    return videoId;
  }

  async poll() {
    const body = JSON.stringify({
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: this.clientVersion || DEFAULT_CLIENT_VERSION,
          hl: 'en',
          gl: 'US'
        }
      },
      continuation: this.continuation
    });

    const text = await requestText(
      YT_BASE + '/youtubei/v1/live_chat/get_live_chat?prettyPrint=false',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: YT_BASE,
          referer: YT_BASE + '/live_chat',
          'x-youtube-client-name': '1',
          'x-youtube-client-version': this.clientVersion || DEFAULT_CLIENT_VERSION
        },
        body: body,
        timeoutMs: 12000
      }
    );

    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error('YouTube вернул не JSON');
    }

    const chat = data.continuationContents && data.continuationContents.liveChatContinuation;
    if (!chat) {
      const error = new Error('чат закрыт или недоступен');
      error.status = 400;
      throw error;
    }

    const messages = [];
    (chat.actions || []).forEach((action) => {
      const message = parseAction(action);
      if (!message) return;
      if (this.seen.has(message.id)) return;
      this.seen.add(message.id);
      if (this.seen.size > 2000) {
        const first = this.seen.values().next().value;
        this.seen.delete(first);
      }
      messages.push(message);
    });

    const next = pickContinuation(chat.continuations);
    if (next.continuation) this.continuation = next.continuation;

    if (messages.length) {
      this.emptyPolls = 0;
      try {
        this.onMessage(messages);
      } catch (error) {
        this.log('youtube web: onMessage error', error && error.message);
      }
    } else {
      this.emptyPolls = (this.emptyPolls || 0) + 1;
      // Долго тихо — возможно, эфир закончился, а токен остался живым.
      // Переподключаемся, чтобы не зависнуть на мёртвом чате.
      if (this.emptyPolls > 150) {
        this.emptyPolls = 0;
        this.continuation = '';
        if (!this.fixedVideoId) this.videoId = '';
      }
    }

    return { timeoutMs: next.timeoutMs };
  }
}

module.exports = {
  YouTubeWebReader: YouTubeWebReader,
  _parseAction: parseAction,
  _textOf: textOf,
  _extractInitialData: extractInitialData,
  _extractVideoId: extractVideoId
};

// ---------------------------------------------------------------------
//  Ручная проверка без приложения:
//    node yt-live.js --test <videoId|@handle|UC...>
// ---------------------------------------------------------------------
if (require.main === module) {
  const args = process.argv.slice(2);
  const target = args[1] || '';
  const testVideo = /^[\w-]{11}$/.test(target) ? target : '';
  const testChannel = testVideo ? '' : target;

  const reader = new YouTubeWebReader({
    channelId: testChannel,
    videoId: testVideo,
    pollMs: 2000,
    log: function () {
      console.log.apply(console, Array.prototype.slice.call(arguments));
    },
    onStatus: function (info) {
      console.log('[' + new Date().toLocaleTimeString('ru-RU') + '] status:', info.status,
        info.error ? '(' + info.error + ')' : '', info.videoId || '');
    },
    onMessage: function (list) {
      list.forEach(function (m) {
        console.log('  ' + (m.user) + ': ' + m.text);
      });
    }
  });

  reader.configure({ channelId: testChannel, videoId: testVideo });
  reader.start();
  setTimeout(function () {
    reader.stop();
    setTimeout(function () { process.exit(0); }, 100);
  }, 20000);
}
