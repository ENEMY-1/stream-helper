'use strict';

// Автосообщения: пишутся по расписанию, но только пока чат живой.

class Timers {
  constructor(options) {
    this.config = options.config;
    this.send = options.send;
    this.render = options.render || ((text) => Promise.resolve(text));
    this.log = options.log;
    this.now = options.now || Date.now;
    this.onSave = options.onSave || function () {};
    this.saved = options.saved || {};

    const botConfig = this.config.bot || {};
    this.activityWindowMs = Math.max(1, Number(botConfig.activityWindowMinutes) || 10) * 60000;
    this.minGapMs = Number((this.config.timersSettings || {}).minGapMs) || 120000;

    this.lastActivityAt = 0;
    this.lastSentAt = Number(this.saved.lastSentAt) || 0;
    this.interval = null;
    this.sending = false;

    this.timers = this.buildTimers(this.config.timers || []);
  }

  buildTimers(list) {
    return (list || []).filter(function (timer) {
      return timer && timer.text && timer.enabled !== false;
    }).map((timer, index) => {
      const id = String(timer.id || 'timer-' + (index + 1));
      const everyMs = Math.max(1, Number(timer.everyMinutes) || 30) * 60000;
      const nextAt = Number(this.saved.nextAt && this.saved.nextAt[id]) || 0;
      return {
        id: id,
        text: timer.text,
        everyMs: everyMs,
        platforms: (timer.platforms && timer.platforms.length) ? timer.platforms : ['twitch'],
        nextAt: nextAt > this.now() ? nextAt : this.now() + everyMs
      };
    });
  }

  // Горячая перезагрузка после сохранения в панели.
  reload(list) {
    this.saved = this.exportState();
    this.config.timers = Array.isArray(list) ? list : [];
    this.timers = this.buildTimers(this.config.timers);
    this.onSave(this.exportState());
  }

  start() {
    this.stop();
    this.interval = setInterval(() => this.tick(), 15000);
    if (this.interval.unref) this.interval.unref();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  noteActivity(timestamp) {
    this.lastActivityAt = timestamp || this.now();
  }

  isChatActive(now) {
    return this.lastActivityAt > 0 && now - this.lastActivityAt <= this.activityWindowMs;
  }

  async fire(timer, now) {
    if (this.sending) return;
    this.sending = true;
    try {
      for (let i = 0; i < timer.platforms.length; i++) {
        const platform = timer.platforms[i];
        try {
          const text = await this.render(timer.text, platform);
          await this.send(platform, text, { timer: timer.id });
        } catch (error) {
          this.log.warn('Автосообщение ' + timer.id + ' не отправлено:', error.message);
        }
      }
      this.onSave(this.exportState());
    } finally {
      this.sending = false;
    }
  }

  tick(nowValue) {
    const now = nowValue || this.now();
    const fired = [];

    this.timers.forEach((timer) => {
      if (now < timer.nextAt) return;

      if (!this.isChatActive(now)) {
        // В чате тихо — попробуем позже, не сдвигая полный интервал.
        timer.nextAt = now + 60000;
        return;
      }

      if (this.lastSentAt && now - this.lastSentAt < this.minGapMs) {
        return; // подождём, nextAt не трогаем
      }

      if (this.sending) return; // предыдущее автосообщение ещё отправляется

      timer.nextAt = now + timer.everyMs;
      this.lastSentAt = now;
      fired.push(timer);
      this.fire(timer, now).catch((error) => {
        this.log.warn('Автосообщение:', error.message);
      });
    });

    if (fired.length) this.onSave(this.exportState());
    return fired;
  }

  exportState() {
    const nextAt = {};
    this.timers.forEach(function (timer) {
      nextAt[timer.id] = timer.nextAt;
    });
    return { nextAt: nextAt, lastSentAt: this.lastSentAt };
  }

  snapshot() {
    const now = this.now();
    return this.timers.map(function (timer) {
      return {
        id: timer.id,
        text: timer.text,
        platforms: timer.platforms,
        nextInSec: Math.max(0, Math.round((timer.nextAt - now) / 1000))
      };
    });
  }
}

module.exports = { Timers: Timers };
