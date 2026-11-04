'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  readTwitchConfig,
  syncTwitchConfig
} = require('../../bot-sync');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'stream-helper-twitch-'));
}

function sampleConfig() {
  return [
    "'use strict';",
    '',
    'module.exports = {',
    '  // Twitch',
    '  twitch: {',
    "    channel: 'demo_channel',",
    "    clientId: '',",
    "    clientSecret: '',",
    "    botUsername: ''",
    '  },',
    '',
    '  // Other settings',
    '  streamAlerts: {',
    '    enabled: false',
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

test('readTwitchConfig returns current Twitch values', function () {
  const dir = tempDir();
  const source = sampleConfig()
    .replace("clientId: ''", "clientId: 'abc123clientid'")
    .replace("clientSecret: ''", "clientSecret: 'secret-value'")
    .replace("botUsername: ''", "botUsername: 'demo_bot'");
  const file = writeConfig(dir, source);

  const data = readTwitchConfig(file);
  assert.equal(data.ok, true);
  assert.equal(data.values.clientId, 'abc123clientid');
  assert.equal(data.values.clientSecret, 'secret-value');
  assert.equal(data.values.botUsername, 'demo_bot');
});

test('syncTwitchConfig updates only Twitch values and keeps comments', function () {
  const dir = tempDir();
  const file = writeConfig(dir, sampleConfig());

  const result = syncTwitchConfig({
    clientId: 'abc123clientid',
    clientSecret: '',
    botUsername: 'demo_bot'
  }, { file: file });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);

  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /\/\/ Twitch/);
  assert.match(text, /\/\/ Other settings/);
  assert.match(text, /channel: 'demo_channel'/);
  assert.match(text, /enabled: false/);
  assert.match(text, /statusPort: 39001/);

  const data = readTwitchConfig(file);
  assert.equal(data.ok, true);
  assert.equal(data.values.clientId, 'abc123clientid');
  assert.equal(data.values.clientSecret, '');
  assert.equal(data.values.botUsername, 'demo_bot');
});

test('syncTwitchConfig reports no changes for identical values', function () {
  const dir = tempDir();
  const values = { clientId: '', clientSecret: '', botUsername: '' };
  const file = writeConfig(dir, sampleConfig());

  const first = syncTwitchConfig(values, { file: file });
  assert.equal(first.ok, true);
  assert.equal(first.changed, false);

  const before = fs.readFileSync(file, 'utf8');
  const second = syncTwitchConfig(values, { file: file });
  assert.equal(second.ok, true);
  assert.equal(second.changed, false);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('syncTwitchConfig escapes quotes and keeps BOM', function () {
  const dir = tempDir();
  const file = writeConfig(dir, '\ufeff' + sampleConfig());

  const result = syncTwitchConfig({
    clientId: "abc'123",
    clientSecret: '',
    botUsername: ''
  }, { file: file });

  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(fs.readFileSync(file, 'utf8').charCodeAt(0), 0xFEFF);
  assert.equal(readTwitchConfig(file).values.clientId, "abc'123");
});

test('syncTwitchConfig refuses a broken config', function () {
  const dir = tempDir();
  const file = writeConfig(dir, 'module.exports = {\n');

  const result = syncTwitchConfig({ clientId: 'abc' }, { file: file });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'error');
  assert.equal(readTwitchConfig(file).ok, false);
});

test('syncTwitchConfig reports a missing config', function () {
  const result = syncTwitchConfig({ clientId: 'abc' }, {
    file: path.join(tempDir(), 'nope.js')
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-found');
});

test('readTwitchConfig reports a missing config', function () {
  const data = readTwitchConfig(path.join(tempDir(), 'nope.js'));
  assert.equal(data.ok, false);
  assert.equal(data.reason, 'not-found');
});
