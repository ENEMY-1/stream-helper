'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  LOCALES,
  normalizeLanguage,
  resolveLanguage,
  getLocale
} = require('../../i18n');

test('RU and EN dictionaries have the same keys', function () {
  const ru = Object.keys(LOCALES.ru).sort();
  const en = Object.keys(LOCALES.en).sort();
  assert.deepEqual(en, ru);
});

test('dictionaries have no empty strings', function () {
  ['ru', 'en'].forEach(function (lang) {
    Object.keys(LOCALES[lang]).forEach(function (key) {
      const value = LOCALES[lang][key];
      assert.equal(typeof value, 'string', lang + '.' + key + ' is not a string');
      assert.ok(value.trim().length > 0, lang + '.' + key + ' is empty');
    });
  });
});

test('normalizeLanguage accepts ru, en and falls back to auto', function () {
  assert.equal(normalizeLanguage('ru'), 'ru');
  assert.equal(normalizeLanguage('EN'), 'en');
  assert.equal(normalizeLanguage(' en '), 'en');
  assert.equal(normalizeLanguage('de'), 'auto');
  assert.equal(normalizeLanguage(''), 'auto');
  assert.equal(normalizeLanguage(null), 'auto');
  assert.equal(normalizeLanguage(undefined), 'auto');
});

test('resolveLanguage returns a concrete language', function () {
  assert.equal(resolveLanguage('ru'), 'ru');
  assert.equal(resolveLanguage('en'), 'en');
  assert.ok(['ru', 'en'].indexOf(resolveLanguage('auto')) !== -1);
  assert.ok(['ru', 'en'].indexOf(resolveLanguage('de')) !== -1);
});

test('getLocale returns the matching dictionary', function () {
  assert.equal(getLocale('ru'), LOCALES.ru);
  assert.equal(getLocale('en'), LOCALES.en);
  assert.equal(getLocale('auto'), LOCALES[resolveLanguage('auto')]);
});
