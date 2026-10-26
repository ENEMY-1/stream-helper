'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ValidationError,
  createConfigEditor,
  validateCommands,
  validateTimers,
  validateSocials,
  _evaluateConfig
} = require('../src/config-editor');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chatbot-config-'));
}

function sampleConfig(lineEnding) {
  const eol = lineEnding || '\n';
  return [
    "'use strict';",
    '',
    '// Шапка файла: этот комментарий должен остаться.',
    'module.exports = {',
    '  twitch: {',
    "    channel: 'demo_channel',",
    "    clientId: 'test-client',",
    "    clientSecret: '',",
    "    botUsername: ''",
    '  },',
    '',
    '  // Свои команды.',
    '  commands: [',
    "    { name: 'lurk', reply: 'Смотрю молча' }",
    '  ],',
    '',
    '  // Автосообщения.',
    '  timers: [],',
    '',
    '  socials: {',
    "    twitch: 'https://twitch.tv/demo_channel'",
    '  },',
    '',
    '  // Этот раздел не должен измениться.',
    "  bot: { prefix: '!', activityWindowMinutes: 10 }",
    '};',
    ''
  ].join(eol);
}

function writeConfig(dir, source) {
  const file = path.join(dir, 'config.js');
  fs.writeFileSync(file, source, 'utf8');
  return file;
}

function makeEditor(file, youtubeEnabled) {
  return createConfigEditor({
    file: file,
    youtubeEnabled: youtubeEnabled === undefined ? false : youtubeEnabled,
    log: { info: function () {}, warn: function () {} }
  });
}

const quiet = { youtubeEnabled: false };

test('validateCommands нормализует команду и сохраняет поля', function () {
  const result = validateCommands([{
    name: ' Discord ',
    aliases: ['ДС', 'dc', 'дс'],
    reply: 'Заходи: {discord}',
    permission: 'mod',
    platforms: ['twitch'],
    cooldownMs: 12000,
    enabled: false
  }], quiet);

  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'discord');
  assert.deepEqual(result[0].aliases, ['дс', 'dc']);
  assert.equal(result[0].reply, 'Заходи: {discord}');
  assert.equal(result[0].permission, 'mod');
  assert.deepEqual(result[0].platforms, ['twitch']);
  assert.equal(result[0].cooldownMs, 12000);
  assert.equal(result[0].enabled, false);
});

test('validateCommands принимает cooldownMs: 0 как «по умолчанию»', function () {
  const result = validateCommands([{
    name: 'hello',
    reply: 'привет',
    platforms: ['twitch'],
    cooldownMs: 0
  }], quiet);
  assert.equal(result[0].cooldownMs, undefined);
});

test('validateCommands не даёт занять встроенные имена и алиасы', function () {
  assert.throws(function () {
    validateCommands([{ name: 'ping', reply: 'x', platforms: ['twitch'] }], quiet);
  }, ValidationError);
  assert.throws(function () {
    validateCommands([{ name: 'hello', aliases: ['соцсети'], reply: 'x', platforms: ['twitch'] }], quiet);
  }, ValidationError);
});

test('validateCommands ловит дубли команд и алиасов', function () {
  assert.throws(function () {
    validateCommands([
      { name: 'one', reply: 'x', platforms: ['twitch'] },
      { name: 'one', reply: 'y', platforms: ['twitch'] }
    ], quiet);
  }, /встречается дважды/);

  assert.throws(function () {
    validateCommands([
      { name: 'one', aliases: ['same'], reply: 'x', platforms: ['twitch'] },
      { name: 'two', aliases: ['same'], reply: 'y', platforms: ['twitch'] }
    ], quiet);
  }, /уже занят/);
});

test('validateCommands проверяет длину, задержку и выключенный YouTube', function () {
  assert.throws(function () {
    validateCommands([{ name: 'long', reply: 'x'.repeat(481), platforms: ['twitch'] }], quiet);
  }, /длиннее 480/);

  assert.throws(function () {
    validateCommands([{ name: 'slow', reply: 'x', platforms: ['twitch'], cooldownMs: 500 }], quiet);
  }, /от 1 до 3600/);

  assert.throws(function () {
    validateCommands([{ name: 'ytdemo', reply: 'x', platforms: ['youtube'] }], quiet);
  }, /YouTube выключен/);
});

test('validateTimers выдаёт стабильные id и проверяет интервал', function () {
  const result = validateTimers([
    { text: 'Первое', everyMinutes: 30, platforms: ['twitch'] },
    { id: 'custom', text: 'Второе', everyMinutes: 45, platforms: ['twitch'] }
  ], quiet);

  assert.equal(result[0].id, 'timer-1');
  assert.equal(result[1].id, 'custom');
  assert.equal(result[0].everyMinutes, 30);

  assert.throws(function () {
    validateTimers([{ text: 'x', everyMinutes: 0, platforms: ['twitch'] }], quiet);
  }, /Интервал/);
});

test('validateSocials добавляет https и отклоняет мусор', function () {
  const result = validateSocials({
    twitch: 'twitch.tv/demo_channel',
    discord: 'https://discord.gg/test',
    youtube: ''
  });
  assert.equal(result.twitch, 'https://twitch.tv/demo_channel');
  assert.equal(result.discord, 'https://discord.gg/test');
  assert.equal(result.youtube, '');

  assert.throws(function () {
    validateSocials({ twitch: 'not a url at all' });
  }, ValidationError);
});

test('редактор меняет только commands и сохраняет комментарии и backup', function () {
  const dir = tempDir();
  const source = sampleConfig();
  const file = writeConfig(dir, source);
  const editor = makeEditor(file);

  const saved = editor.saveCommands([
    { name: 'hello', aliases: ['привет'], reply: 'Привет, {user}!', platforms: ['twitch'] },
    { name: 'lurk', reply: 'Смотрю молча', platforms: ['twitch'], enabled: false }
  ]);

  const after = fs.readFileSync(file, 'utf8');
  assert.match(after, /Шапка файла/);
  assert.match(after, /Этот раздел не должен измениться/);
  assert.match(after, /Свои команды/);
  assert.ok(fs.existsSync(file + '.bak'));
  assert.equal(fs.readFileSync(file + '.bak', 'utf8'), source);

  const evaluated = _evaluateConfig(after, file);
  assert.deepEqual(
    JSON.parse(JSON.stringify(evaluated.commands)),
    JSON.parse(JSON.stringify(saved))
  );
  assert.deepEqual(JSON.parse(JSON.stringify(evaluated.twitch)), {
    channel: 'demo_channel',
    clientId: 'test-client',
    clientSecret: '',
    botUsername: ''
  });
  assert.equal(evaluated.bot.prefix, '!');
});

test('редактор сохраняет CRLF в config.js', function () {
  const dir = tempDir();
  const file = writeConfig(dir, sampleConfig('\r\n'));
  const editor = makeEditor(file);

  editor.saveTimers([
    { text: 'Таймер', everyMinutes: 15, platforms: ['twitch'] }
  ]);

  const after = fs.readFileSync(file, 'utf8');
  assert.equal((after.match(/\r\n/g) || []).length, (after.match(/\n/g) || []).length);
  assert.match(after, /Таймер/);
  assert.doesNotMatch(after, /[^\r]\n/);
});

test('редактор сохраняет socials, не трогая другие разделы', function () {
  const dir = tempDir();
  const file = writeConfig(dir, sampleConfig());
  const editor = makeEditor(file);

  const saved = editor.saveSocials({
    twitch: 'twitch.tv/demo_channel',
    youtube: 'youtube.com/@demo_channel'
  });

  assert.equal(saved.twitch, 'https://twitch.tv/demo_channel');
  assert.equal(saved.youtube, 'https://youtube.com/@demo_channel');

  const evaluated = _evaluateConfig(fs.readFileSync(file, 'utf8'), file);
  assert.deepEqual(
    JSON.parse(JSON.stringify(evaluated.socials)),
    JSON.parse(JSON.stringify(saved))
  );
  assert.deepEqual(JSON.parse(JSON.stringify(evaluated.commands)), [{ name: 'lurk', reply: 'Смотрю молча' }]);
});

test('редактор не пишет файл, если валидация не прошла', function () {
  const dir = tempDir();
  const source = sampleConfig();
  const file = writeConfig(dir, source);
  const editor = makeEditor(file);

  assert.throws(function () {
    editor.saveCommands([{ name: 'ping', reply: 'x', platforms: ['twitch'] }]);
  }, ValidationError);

  assert.equal(fs.readFileSync(file, 'utf8'), source);
});
