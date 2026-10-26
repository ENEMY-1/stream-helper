'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJson(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    return false;
  }
}

function truncate(text, limit) {
  const clean = String(text == null ? '' : text)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (clean.length <= limit) return clean;
  return clean.slice(0, Math.max(1, limit - 1)).trimEnd() + '…';
}

function ptDay(timestamp) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(timestamp || Date.now()));
}

module.exports = {
  readJson: readJson,
  writeJson: writeJson,
  truncate: truncate,
  ptDay: ptDay
};
