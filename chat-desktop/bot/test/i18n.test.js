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

/* ---------- bot web panel dictionary ---------- */

const fs = require('node:fs');
const path = require('node:path');
const PANEL_EN = require('../src/web/i18n.js');

const WEB_ROOT = path.join(__dirname, '..', 'src', 'web');
const APP_JS = fs.readFileSync(path.join(WEB_ROOT, 'app.js'), 'utf8');
const INDEX_HTML = fs.readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');

function cyrillicStrings(source) {
  const found = new Set();
  const re = /(['"])((?:\\.|(?!\1)[^\\])*?)\1/g;
  source.split(/\r?\n/).forEach(function (line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
    let match;
    while ((match = re.exec(line))) {
      if (/[\u0400-\u04FF]/.test(match[2])) found.add(match[2]);
    }
  });
  return found;
}

test('bot panel dictionary translates every Cyrillic string in app.js', function () {
  const missing = [...cyrillicStrings(APP_JS)].filter(function (text) {
    return !Object.prototype.hasOwnProperty.call(PANEL_EN, text);
  });
  assert.deepEqual(missing, [], 'missing EN translations: ' + missing.join(' | '));
});

test('bot panel dictionary translates every data-i18n key in index.html', function () {
  const missing = [];
  const re = /data-i18n(?:-aria)?="([^"]+)"/g;
  let match;
  while ((match = re.exec(INDEX_HTML))) {
    if (!Object.prototype.hasOwnProperty.call(PANEL_EN, match[1])) missing.push(match[1]);
  }
  assert.deepEqual(missing, [], 'missing EN translations: ' + missing.join(' | '));
});

test('bot panel dictionary has no empty translations', function () {
  Object.keys(PANEL_EN).forEach(function (key) {
    const value = PANEL_EN[key];
    assert.equal(typeof value, 'string', key + ' is not a string');
    assert.ok(value.trim().length > 0, key + ' is empty');
  });
});
