'use strict';

// Сводка по прошедшему стриму: пик зрителей, длительность, активность чата
// и сколько сообщений в Telegram получилось отправить.
//
// Объект «StreamStats» живёт, пока идёт стрим: каждый раз, когда бот
// замечает, что эфир ещё идёт, сюда приходит снимок Twitch Helix (зрители,
// игра, название), а счётчики чата берутся из общего состояния бота.

const LOST_GAP_MS = 15 * 60000;
const HISTORY_LIMIT = 20;

function emptySlot(startedAt) {
  return {
    live: true,
    startedAt: Number(startedAt) || 0,
    detectedAt: Date.now(),
    lastSeenAt: 0,
    lastSeenViewers: 0,
    peak: 0,
    peakAt: 0,
    viewersSum: 0,
    samples: 0,
    title: '',
    game: '',
    chat: { messages: 0, replies: 0, commands: 0, moderation: 0, points: 0, quiz: 0, giveaway: 0 }
  };
}

class StreamStats {
  constructor(options) {
    const opts = options || {};
    this.counters = opts.counters || {};
    this.moderation = opts.moderation || null;
    this.settings = opts.settings || {};
  }

  // Twitch сообщил, что эфир идёт.
  observe(stream) {
    const state = this.state || emptySlot(stream && stream.startedAt);
    const now = Date.now();
    const viewers = Number(stream && stream.viewers) || 0;

    state.live = true;
    state.lastSeenAt = now;
    state.lastSeenViewers = viewers;
    state.viewersSum += viewers;
    state.samples += 1;
    if (viewers > state.peak) {
      state.peak = viewers;
      state.peakAt = now;
    }
    if (stream && stream.title) state.title = String(stream.title);
    if (stream && stream.game) state.game = String(stream.game);
    this.state = state;
    return state;
  }

  // Бот увидел сообщение в чате — распределяем по прошедшему стриму.
  noteMessage(message) {
    if (!this.state || !this.state.live) return;
    const chat = this.state.chat;
    const text = String((message && message.text) || '');
    chat.messages += 1;
    if (/^\s*!/.test(text)) chat.commands += 1;
  }

  noteReply(platform) {
    if (!this.state || !this.state.live) return;
    this.state.chat.replies += 1;
  }

  noteModeration() {
    if (!this.state || !this.state.live) return;
    this.state.chat.moderation += 1;
  }

  // Twitch ответил, что эфира нет. Возвращает сводку, если стрим только
  // что закончился, иначе null.
  markOffline() {
    const state = this.state;
    this.state = null;
    if (!state) return null;

    const now = Date.now();
    const endedAt = state.lastSeenAt || now;
    // Если бот не видел эфир давно (был выключен, пропадала сеть) —
    // такие «стримы» только сбивают статистику, их не шлём.
    if (now - endedAt > LOST_GAP_MS) return { state: state, dropped: true };

    return { state: state, endedAt: endedAt };
  }

  // Итоговая сводка: то, что уходит в Telegram и сохраняется в истории.
  summary(state, endedAt) {
    const start = state.startedAt || state.detectedAt;
    const end = Math.max(endedAt || Date.now(), start);
    const moderation = this.moderation && typeof this.moderation.snapshot === 'function'
      ? this.moderation.snapshot()
      : { stats: { total: 0 } };

    return {
      live: false,
      startedAt: start,
      endedAt: end,
      durationMs: end - start,
      peak: state.peak,
      peakAt: state.peakAt,
      average: state.samples ? Math.round(state.viewersSum / state.samples) : 0,
      lastViewers: state.lastSeenViewers,
      samples: state.samples,
      title: state.title || '',
      game: state.game || '',
      chat: Object.assign({}, state.chat),
      moderation: {
        total: Number(moderation.stats && moderation.stats.total) || 0
      }
    };
  }

  snapshot() {
    const state = this.state;
    if (!state) return null;
    return {
      startedAt: state.startedAt,
      peak: state.peak,
      samples: state.samples,
      messages: state.chat.messages,
      replies: state.chat.replies,
      title: state.title,
      game: state.game
    };
  }
}

// Красивая длительность: «1 ч 23 мин», «12 мин 05 с», «48 с».
function humanDurationLong(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return hours + ' ч ' + String(minutes).padStart(2, '0') + ' мин';
  if (minutes > 0) return minutes + ' мин ' + String(seconds).padStart(2, '0') + ' с';
  return seconds + ' с';
}

module.exports = {
  StreamStats: StreamStats,
  humanDurationLong: humanDurationLong,
  HISTORY_LIMIT: HISTORY_LIMIT,
  LOST_GAP_MS: LOST_GAP_MS,
  emptySlot: emptySlot
};
