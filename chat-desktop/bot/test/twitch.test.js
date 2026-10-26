'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { TwitchChat } = require('../src/twitch');

function makeChat(store) {
  return new TwitchChat({
    channel: 'demo_channel',
    clientId: 'test-client',
    clientSecret: '',
    botUsername: '',
    store: store,
    log: { debug: function () {}, info: function () {}, warn: function () {}, error: function () {} }
  });
}

test('getLogin запоминает логин из store — иначе бот остаётся read-only', async function () {
  const chat = makeChat({
    getTwitchLogin: function () { return 'demo_channel'; },
    twitch: null
  });

  assert.equal(chat.botLogin, '');
  const login = await chat.getLogin('test-token');

  assert.equal(login, 'demo_channel');
  assert.equal(chat.botLogin, 'demo_channel');
});

test('getLogin не ходит в сеть, если логин уже известен', async function () {
  const chat = makeChat({ getTwitchLogin: function () { return 'demo_channel'; } });
  chat.botLogin = 'demo_channel';

  const login = await chat.getLogin('test-token');
  assert.equal(login, 'demo_channel');
});
