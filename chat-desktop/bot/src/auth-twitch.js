'use strict';

// Вход в Twitch через device code flow: запусти auth-twitch.bat.

const { loadConfig } = require('./config');
const { TokenStore } = require('./tokens');
const { startDeviceFlow, pollDeviceToken, fetchCurrentUser } = require('./twitch-auth');
const { openBrowser } = require('./open-browser');
const { delay } = require('./net');
const log = require('./log');

function instructions() {
  console.log('');
  console.log('Нужен Client ID приложения Twitch.');
  console.log('');
  console.log('  1. Открой https://dev.twitch.tv/console/apps -> Register Your Application');
  console.log('  2. Name: любое (например, StreamHelperBot)');
  console.log('     OAuth Redirect URLs: http://localhost:3000');
  console.log('     Category: Chat Bot');
  console.log('     Client Type: Public');
  console.log('  3. Нажми Manage -> скопируй Client ID');
  console.log('  4. Вставь его в config.js -> twitch.clientId');
  console.log('  5. Запусти auth-twitch.bat снова.');
  console.log('');
}

async function main() {
  const config = loadConfig();
  log.init(config.paths.log, { debug: false });

  if (!config.twitch.clientId) {
    instructions();
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('Запрашиваю код у Twitch…');
  const device = await startDeviceFlow(config.twitch.clientId);

  const code = device.user_code;
  const uri = device.verification_uri || 'https://www.twitch.tv/activate';
  const expiresIn = Number(device.expires_in) || 1800;

  console.log('');
  console.log('  Код:  ' + code);
  console.log('  Ссылка: ' + uri);
  console.log('');
  console.log('Открываю браузер. Войди тем аккаунтом, от имени которого должен писать бот');
  console.log('(лучше отдельный аккаунт-бот), введи код и подтверди доступ.');
  console.log('');

  openBrowser(uri);

  const interval = Math.max(5, Number(device.interval) || 5);
  const deadline = Date.now() + expiresIn * 1000;
  let wait = interval;

  while (Date.now() < deadline) {
    await delay(wait * 1000);
    try {
      const tokens = await pollDeviceToken(config.twitch.clientId, device.device_code);
      const user = await fetchCurrentUser(config.twitch.clientId, tokens.access_token);

      const store = new TokenStore(config.paths.tokens, log.child('tokens'));
      store.setTwitch({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope || tokens.scopes || ['chat:read', 'chat:edit'],
        token_type: tokens.token_type || 'bearer',
        expires_at: Date.now() + (Number(tokens.expires_in) || 0) * 1000,
        obtained_at: new Date().toISOString(),
        login: user ? user.login : '',
        user_id: user ? user.id : '',
        display_name: user ? user.display_name : ''
      });

      console.log('');
      console.log('Готово! Токен сохранён в data/tokens.json');
      console.log('Бот будет писать как @' + ((user && user.login) || 'неизвестно'));
      console.log('');
      console.log('Теперь запусти start.bat');
      console.log('');
      return;
    } catch (error) {
      const message = String(error.message || '');
      if (/authorization_pending/i.test(message)) {
        process.stdout.write('.');
        continue;
      }
      if (/slow_down/i.test(message)) {
        wait += 5;
        continue;
      }
      if (/expired_token/i.test(message)) {
        console.error('\nКод истёк. Запусти auth-twitch.bat заново.');
        process.exitCode = 1;
        return;
      }
      if (/access_denied/i.test(message)) {
        console.error('\nДоступ отклонён. Запусти auth-twitch.bat и подтверди вход.');
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  }

  console.error('\nВремя ожидания истекло. Запусти auth-twitch.bat заново.');
  process.exitCode = 1;
}

main().catch(function (error) {
  console.error('');
  console.error('Ошибка входа в Twitch:', error.message);
  console.error('');
  console.error('Если пишет 400/404 — проверь Client ID и тип приложения (Public).');
  process.exitCode = 1;
});
