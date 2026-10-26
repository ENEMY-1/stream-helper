'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readStreamAlerts,
  syncStreamAlerts
} = require('../../bot-sync');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stream-helper-alerts-'));
}

function sampleConfig() {
  return [
    "'use strict';",
    '',
    'module.exports = {',
    "  twitch: { channel: 'demo_channel' },",
    '',
    '  // Telegram alerts',
    '  streamAlerts: {',
    '    enabled: false,',
    '    offlineEnabled: true,',
    '    checkIntervalSec: 60,',
    '',
    '    // Token from BotFather',
    '    telegram: {',
    "      botToken: '',",
    "      chatId: '',",
    "      messageThreadId: ''",
    '    }',
    '  },',
    '',
    '  statusPort: 39001',
    '};',
    ''
  ].join('\n');
}

function writeConfig(dir, source) {
  const file = path.join(dir, 'config.js');
  fs.writeFileSync(file, source, 'utf8');
  return file;
}

test('readStreamAlerts returns current Telegram values', function () {
  const dir = tempDir();
  const source = sampleConfig()
    .replace("botToken: ''", "botToken: '123456789:AAHfake_token-for-test_123'")
    .replace("chatId: ''", "chatId: '@demo_channel'")
    .replace("messageThreadId: ''", "messageThreadId: '7'");
  const file = writeConfig(dir, source);

  const data = readStreamAlerts(file);
  assert.equal(data.ok, true);
  assert.equal(data.values.enabled, false);
  assert.equal(data.values.offlineEnabled, true);
  assert.equal(data.values.botToken, '123456789:AAHfake_token-for-test_123');
  assert.equal(data.values.chatId, '@demo_channel');
  assert.equal(data.values.messageThreadId, '7');
});

test('syncStreamAlerts updates only alert values and keeps comments', function () {
  const dir = tempDir();
  const file = writeConfig(dir, sampleConfig());

  const result = syncStreamAlerts({
    enabled: true,
    offlineEnabled: false,
    botToken: '123456789:AAHfake_token-for-test_123',
    chatId: '@demo_channel',
    messageThreadId: '7'
  }, { file: file });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);

  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /\/\/ Telegram alerts/);
  assert.match(text, /\/\/ Token from BotFather/);
  assert.match(text, /checkIntervalSec: 60/);
  assert.match(text, /twitch: \{ channel: 'demo_channel' \}/);

  const data = readStreamAlerts(file);
  assert.equal(data.ok, true);
  assert.equal(data.values.enabled, true);
  assert.equal(data.values.offlineEnabled, false);
  assert.equal(data.values.botToken, '123456789:AAHfake_token-for-test_123');
  assert.equal(data.values.chatId, '@demo_channel');
  assert.equal(data.values.messageThreadId, '7');
});

test('syncStreamAlerts reports no changes for identical values', function () {
  const dir = tempDir();
  const values = {
    enabled: false,
    offlineEnabled: true,
    botToken: '',
    chatId: '',
    messageThreadId: ''
  };
  const file = writeConfig(dir, sampleConfig());

  const first = syncStreamAlerts(values, { file: file });
  assert.equal(first.ok, true);
  assert.equal(first.changed, false);

  const before = fs.readFileSync(file, 'utf8');
  const second = syncStreamAlerts(values, { file: file });
  assert.equal(second.ok, true);
  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('syncStreamAlerts escapes quotes and keeps BOM', function () {
  const dir = tempDir();
  const file = writeConfig(dir, '\ufeff' + sampleConfig());

  const result = syncStreamAlerts({
    enabled: false,
    offlineEnabled: true,
    botToken: '',
    chatId: "@demo'channel",
    messageThreadId: ''
  }, { file: file });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(fs.readFileSync(file, 'utf8').charCodeAt(0), 0xFEFF);
  assert.equal(readStreamAlerts(file).values.chatId, "@demo'channel");
});

test('syncStreamAlerts refuses a broken config', function () {
  const dir = tempDir();
  const file = writeConfig(dir, 'module.exports = {\n');

  const result = syncStreamAlerts({ enabled: true }, { file: file });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
  assert.equal(readStreamAlerts(file).ok, false);
});

test('syncStreamAlerts reports a missing config', function () {
  const result = syncStreamAlerts({ enabled: true }, { file: path.join(tempDir(), 'nope.js') });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-found');
});
