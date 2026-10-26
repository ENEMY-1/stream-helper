'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { Quiz, normalizeAnswer, cleanQuestions } = require('../src/quiz');
const { Points } = require('../src/points');

const silent = { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} };

const QUESTIONS = [
  { q: 'Сколько будет 2+2?', a: ['4', 'четыре'], hint: 'Это чётное число' }
];

function makeQuiz(options) {
  const opts = options || {};
  let now = opts.now || 1000000;
  const sent = [];
  const quiz = new Quiz({
    config: Object.assign({ quiz: opts.quiz || {} }, opts.config || {}),
    log: silent,
    now: function () { return now; },
    send: function (text) { sent.push(text); return Promise.resolve(); },
    points: opts.points || null
  });
  quiz.advance = function (delta) { now += delta; return Quiz.prototype.tick.call(quiz); };
  return { quiz: quiz, sent: sent };
}

function message(overrides) {
  return Object.assign({
    userId: '42',
    login: 'viewer',
    user: 'Viewer',
    text: '4'
  }, overrides || {});
}

test('normalizeAnswer убирает пунктуацию, регистр и ё', function () {
  assert.equal(normalizeAnswer('  ЁЖИК, ну! '), 'ежик ну');
  assert.equal(normalizeAnswer('2 + 2 = 4'), '2 2 4');
});

test('cleanQuestions отбрасывает пустые вопросы и приводит ответы к массиву', function () {
  const cleaned = cleanQuestions([
    { q: 'Вопрос?', a: 'один|два' },
    { q: '', a: ['нет'] },
    { question: 'Второй?', answer: 'да' },
    { q: 'Без ответа' },
    null
  ]);

  assert.equal(cleaned.length, 2);
  assert.deepEqual(cleaned[0].a, ['один', 'два']);
  assert.equal(cleaned[1].q, 'Второй?');
  assert.deepEqual(cleaned[1].a, ['да']);
});

test('викторина не стартует без вопросов или при выключении', function () {
  const empty = makeQuiz();
  assert.match(empty.quiz.start(), /нет вопросов/);

  const disabled = makeQuiz({ quiz: { enabled: false, questions: QUESTIONS } });
  assert.match(disabled.quiz.start(), /выключена/);
});

test('вопрос задаётся после старта и правильный ответ приносит баллы', function () {
  const points = new Points({ config: { points: {} }, log: silent, now: function () { return 1000000; } });
  const ctx = makeQuiz({ quiz: { questions: QUESTIONS, betweenSeconds: 15 }, points: points });

  assert.match(ctx.quiz.start(), /Викторина началась/);
  assert.equal(ctx.quiz.session.question, null);

  ctx.quiz.advance(1000);
  assert.equal(ctx.quiz.session.asked, 1);
  assert.match(ctx.sent[0], /Вопрос 1/);

  const result = ctx.quiz.check(message({ text: 'ЧЕТЫРЕ!' }));
  assert.equal(result, true);
  assert.equal(ctx.quiz.session.correct, 1);
  assert.equal(points.balance(message()), 25);

  const last = ctx.sent[ctx.sent.length - 1];
  assert.match(last, /Viewer/);
  assert.match(last, /\+25/);
});

test('неправильный ответ, команда и пустой текст не засчитываются', function () {
  const ctx = makeQuiz({ quiz: { questions: QUESTIONS } });
  ctx.quiz.start();
  ctx.quiz.advance(1000);

  assert.equal(ctx.quiz.check(message({ text: '5' })), false);
  assert.equal(ctx.quiz.check(message({ text: '!4' })), false);
  assert.equal(ctx.quiz.check(message({ text: '   ' })), false);
  assert.equal(ctx.quiz.session.answered, false);
});

test('подсказка приходит после заданного времени', function () {
  const ctx = makeQuiz({ quiz: { questions: QUESTIONS, hintAfterSeconds: 20 } });
  ctx.quiz.start();
  ctx.quiz.advance(1000);

  ctx.quiz.advance(19000);
  assert.equal(ctx.quiz.session.hintSent, false);

  ctx.quiz.advance(1000);
  assert.equal(ctx.quiz.session.hintSent, true);
  assert.match(ctx.sent[ctx.sent.length - 1], /Подсказка/);
});

test('после времени ожидания бот показывает ответ и переходит дальше', function () {
  const ctx = makeQuiz({ quiz: { questions: QUESTIONS, questionSeconds: 60, betweenSeconds: 10 } });
  ctx.quiz.start();
  ctx.quiz.advance(1000);

  ctx.quiz.advance(60000);
  assert.match(ctx.sent[ctx.sent.length - 1], /Время вышло/);
  assert.match(ctx.sent[ctx.sent.length - 1], /4/);
  assert.equal(ctx.quiz.session.answered, true);

  ctx.quiz.advance(10000);
  assert.match(ctx.sent[ctx.sent.length - 1], /Вопросы закончились/);
  assert.equal(ctx.quiz.session, null);
});

test('лимит вопросов завершает викторину', function () {
  const two = QUESTIONS.concat([{ q: 'Столица Франции?', a: ['Париж'] }]);
  const ctx = makeQuiz({ quiz: { questions: two, maxQuestions: 1, betweenSeconds: 5 } });
  ctx.quiz.start();
  ctx.quiz.advance(1000);

  assert.equal(ctx.quiz.session.asked, 1);
  // Вопросы перемешиваются, поэтому берём ответ у фактически заданного вопроса.
  ctx.quiz.check(message({ text: ctx.quiz.session.question.a[0] }));
  ctx.quiz.advance(5000);

  assert.equal(ctx.quiz.session, null);
  assert.match(ctx.sent[ctx.sent.length - 1], /Викторина завершена/);
  assert.match(ctx.sent[ctx.sent.length - 1], /1/);
});

test('ручное завершение, пропуск и статус работают', function () {
  const ctx = makeQuiz({ quiz: { questions: QUESTIONS } });

  assert.match(ctx.quiz.command(message({ text: '!quiz stop' })), /не идёт/);
  assert.match(ctx.quiz.command(message({ text: '!quiz start' })), /Викторина началась/);
  assert.match(ctx.quiz.command(message({ text: '!quiz status' })), /Вопрос/);
  assert.equal(ctx.quiz.command(message({ text: '!quiz skip' })), '⏭ Следующий вопрос.');
  assert.match(ctx.sent[ctx.sent.length - 1], /Вопрос 1/);

  const stopped = ctx.quiz.command(message({ text: '!quiz stop' }));
  assert.match(stopped, /завершена/);
  assert.equal(ctx.quiz.session, null);
});

test('snapshot показывает состояние викторины', function () {
  const ctx = makeQuiz({ quiz: { questions: QUESTIONS } });
  assert.equal(ctx.quiz.snapshot().running, false);

  ctx.quiz.start();
  ctx.quiz.advance(1000);
  const snapshot = ctx.quiz.snapshot();
  assert.equal(snapshot.running, true);
  assert.equal(snapshot.asked, 1);
  assert.equal(snapshot.questions, 1);
  assert.match(snapshot.current, /2\+2/);
});
