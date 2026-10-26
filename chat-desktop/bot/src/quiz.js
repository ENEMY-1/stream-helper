'use strict';

// Викторина: бот задаёт вопрос в чат, первый правильный ответ получает баллы.

const { truncate } = require('./fsutil');

const DEFAULTS = {
  enabled: true,
  questionSeconds: 60,
  betweenSeconds: 15,
  hintAfterSeconds: 30,
  rewardPoints: 25,
  maxQuestions: 0,
  questions: []
};

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function merge(base, extra) {
  const out = Object.assign({}, base);
  if (!isPlainObject(extra)) return out;
  Object.keys(extra).forEach(function (key) {
    const value = extra[key];
    if (isPlainObject(value) && isPlainObject(out[key])) out[key] = merge(out[key], value);
    else out[key] = value;
  });
  return out;
}

function normalizeAnswer(value) {
  return String(value == null ? '' : value)
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanQuestions(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (item) {
    if (!isPlainObject(item)) return null;
    const q = String(item.q || item.question || '').trim();
    const raw = Array.isArray(item.a) ? item.a : item.a || item.answer || item.answers;
    const answers = (Array.isArray(raw) ? raw : String(raw || '').split('|'))
      .map(function (answer) { return String(answer).trim(); })
      .filter(Boolean);
    if (!q || !answers.length) return null;
    return {
      q: truncate(q, 300),
      a: answers.slice(0, 20).map(function (answer) { return truncate(answer, 100); }),
      hint: truncate(item.hint || '', 200)
    };
  }).filter(Boolean).slice(0, 200);
}

function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = result[i];
    result[i] = result[j];
    result[j] = tmp;
  }
  return result;
}

class Quiz {
  constructor(options) {
    const opts = options || {};
    this.config = opts.config || {};
    this.log = opts.log || { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };
    this.now = opts.now || Date.now;
    this.send = opts.send || function () { return Promise.resolve(); };
    this.points = opts.points || null;
    this.settings = this.normalize(this.config.quiz);
    this.session = null;
    this.deck = [];
  }

  normalize(raw) {
    const merged = merge(DEFAULTS, raw || {});
    return {
      enabled: merged.enabled !== false,
      questionSeconds: Math.round(clamp(merged.questionSeconds, 10, 600, 60)),
      betweenSeconds: Math.round(clamp(merged.betweenSeconds, 3, 600, 15)),
      hintAfterSeconds: Math.round(clamp(merged.hintAfterSeconds, 1, 600, 30)),
      rewardPoints: Math.round(clamp(merged.rewardPoints, 0, 100000, 25)),
      maxQuestions: Math.round(clamp(merged.maxQuestions, 0, 100, 0)),
      questions: cleanQuestions(merged.questions)
    };
  }

  reload(raw) {
    this.settings = this.normalize(raw);
    return this.settings;
  }

  start() {
    if (!this.settings.enabled) return 'Викторина выключена в настройках.';
    if (!this.settings.questions.length) return 'В настройках нет вопросов для викторины.';
    if (this.session) return 'Викторина уже идёт. Остановить: !quiz stop';

    this.session = {
      asked: 0,
      correct: 0,
      startedAt: this.now(),
      question: null,
      askedAt: 0,
      endsAt: 0,
      answered: true,
      hintSent: false,
      nextAt: this.now() + 1000
    };
    this.deck = shuffle(this.settings.questions);
    this.log.info('Викторина запущена, вопросов в наборе: ' + this.deck.length);
    return '🧠 Викторина началась! ' + this.settings.questionSeconds + ' сек. на вопрос.';
  }

  askNext() {
    if (!this.session) return false;
    if (this.settings.maxQuestions > 0 && this.session.asked >= this.settings.maxQuestions) {
      this.finish('Все вопросы закончились.');
      return false;
    }
    if (!this.deck.length) {
      this.finish('Вопросы закончились.');
      return false;
    }

    const question = this.deck.shift();
    const now = this.now();
    this.session.question = question;
    this.session.asked += 1;
    this.session.askedAt = now;
    this.session.endsAt = now + this.settings.questionSeconds * 1000;
    this.session.answered = false;
    this.session.hintSent = false;
    this.session.nextAt = 0;

    const header = '❓ Вопрос ' + this.session.asked +
      (this.settings.maxQuestions > 0 ? '/' + this.settings.maxQuestions : '') + ': ';
    this.send(truncate(header + question.q, 480)).catch(function () {});
    return true;
  }

  check(message) {
    if (!this.session || !this.session.question || this.session.answered) return false;
    const text = String((message && message.text) || '').trim();
    if (!text) return false;
    if (text.startsWith('!')) return false;

    const answer = normalizeAnswer(text);
    if (!answer) return false;
    const accepted = this.session.question.a.map(normalizeAnswer);
    if (accepted.indexOf(answer) === -1) return false;

    this.session.answered = true;
    this.session.correct += 1;

    let reward = '';
    if (this.points && this.settings.rewardPoints > 0) {
      this.points.add(message, this.settings.rewardPoints);
      reward = ' +' + this.settings.rewardPoints + ' ' + this.points.currency;
    }

    const winner = String((message && (message.user || message.login)) || '');
    this.send(truncate('✅ ' + winner + ' ответил первым: ' + this.session.question.a[0] + '!' + reward, 480))
      .catch(function () {});
    this.session.nextAt = this.now() + this.settings.betweenSeconds * 1000;
    return true;
  }

  tick(nowValue) {
    const now = nowValue || this.now();
    if (!this.session) return;

    if (this.session.question && !this.session.answered) {
      if (!this.session.hintSent && this.session.question.hint &&
          now - this.session.askedAt >= this.settings.hintAfterSeconds * 1000) {
        this.session.hintSent = true;
        this.send(truncate('💡 Подсказка: ' + this.session.question.hint, 480)).catch(function () {});
      }
      if (now >= this.session.endsAt) {
        this.session.answered = true;
        const answer = this.session.question.a[0];
        this.send(truncate('⌛ Время вышло. Правильный ответ: ' + answer, 480)).catch(function () {});
        this.session.nextAt = now + this.settings.betweenSeconds * 1000;
      }
      return;
    }

    if (this.session.answered && this.session.nextAt && now >= this.session.nextAt) {
      this.session.nextAt = 0;
      this.askNext();
    }
  }

  finish(reason) {
    if (!this.session) return 'Викторина сейчас не идёт.';
    const summary = '🏁 Викторина завершена. Вопросов: ' + this.session.asked +
      ' · правильных ответов: ' + this.session.correct +
      (reason ? ' · ' + reason : '');
    this.session = null;
    this.deck = [];
    this.send(truncate(summary, 480)).catch(function () {});
    return summary;
  }

  command(message) {
    const parts = String((message && message.text) || '').trim().split(/\s+/);
    const sub = String(parts[1] || '').toLowerCase();

    if (sub === 'stop' || sub === 'стоп') return this.finish('остановлено вручную.');
    if (sub === 'skip' || sub === 'пропуск' || sub === 'дальше') {
      if (!this.session) return 'Викторина сейчас не идёт.';
      if (!this.session.question || this.session.answered) {
        this.session.nextAt = 0;
        this.askNext();
        return '⏭ Следующий вопрос.';
      }
      this.session.answered = true;
      this.session.nextAt = this.now() + this.settings.betweenSeconds * 1000;
      this.send('⏭ Пропускаю вопрос. Правильный ответ: ' + this.session.question.a[0]).catch(function () {});
      return '';
    }
    if (!sub || sub === 'start' || sub === 'старт') return this.start();
    if (sub === 'status' || sub === 'статус') {
      if (!this.session) return 'Викторина не идёт.';
      return '🧠 Вопрос ' + this.session.asked + ', правильных ответов: ' + this.session.correct + '.';
    }
    return 'Команды: !quiz start · !quiz stop · !quiz skip · !quiz status';
  }

  snapshot() {
    return {
      enabled: this.settings.enabled,
      questions: this.settings.questions.length,
      running: !!this.session,
      asked: this.session ? this.session.asked : 0,
      correct: this.session ? this.session.correct : 0,
      current: this.session && this.session.question ? this.session.question.q : ''
    };
  }
}

module.exports = {
  Quiz: Quiz,
  DEFAULTS: DEFAULTS,
  normalizeAnswer: normalizeAnswer,
  cleanQuestions: cleanQuestions
};
