'use strict';

// Вход в YouTube (Google OAuth) для отправки сообщений в чат.
// Запусти auth-youtube.bat после того, как положишь OAuth client JSON
// в data/google-oauth.json.

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');

const { loadConfig } = require('./config');
const { TokenStore } = require('./tokens');
const { GoogleAuth } = require('./google');
const { openBrowser } = require('./open-browser');
const { requestJson } = require('./net');
const log = require('./log');

const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';

function page(title, text) {
  return '<!doctype html><html lang="ru"><head><meta charset="utf-8">' +
    '<title>' + title + '</title>' +
    '<style>body{font:16px/1.5 "Segoe UI",system-ui,sans-serif;background:#0d0e13;color:#eef0f6;' +
    'display:flex;align-items:center;justify-content:center;height:100vh;margin:0}' +
    'div{max-width:560px;background:#171922;border:1px solid #262a37;border-radius:14px;padding:28px 32px}' +
    'h1{font-size:20px;margin:0 0 12px}p{margin:0;color:#b9c0d0}</style></head>' +
    '<body><div><h1>' + title + '</h1><p>' + text + '</p></div></body></html>';
}

function instructions(config) {
  const target = config.paths.google;
  console.log('');
  console.log('Нужен OAuth client JSON от Google Cloud.');
  console.log('');
  console.log('  1. https://console.cloud.google.com/ -> создай проект');
  console.log('  2. APIs & Services -> Library -> включи "YouTube Data API v3"');
  console.log('  3. APIs & Services -> OAuth consent screen:');
  console.log('     User type: External, заполни название и e-mail,');
  console.log('     в Test users добавь свой Google-аккаунт (владельца канала).');
  console.log('  4. APIs & Services -> Credentials -> Create credentials -> OAuth client ID');
  console.log('     Application type: Desktop app');
  console.log('  5. Нажми Download JSON и сохрани файл как:');
  console.log('     ' + target);
  console.log('  6. Запусти auth-youtube.bat снова.');
  console.log('');
}

function exchangeCode(credentials, code, redirectUri) {
  const body = new URLSearchParams({
    code: code,
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  return requestJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
}

async function verifyChannel(accessToken) {
  const data = await requestJson(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: 'Bearer ' + accessToken }, timeoutMs: 15000 }
  );
  return (data.items && data.items[0]) || null;
}

async function main() {
  const config = loadConfig();
  log.init(config.paths.log, { debug: false });

  if (!fs.existsSync(config.paths.google)) {
    instructions(config);
    process.exitCode = 1;
    return;
  }

  const store = new TokenStore(config.paths.tokens, log.child('tokens'));
  const google = new GoogleAuth({
    store: store,
    credentialsFile: config.paths.google,
    log: log.child('google')
  });

  let credentials;
  try {
    credentials = google.credentials();
  } catch (error) {
    console.error('');
    console.error(error.message);
    console.error('Скачай JSON типа «Desktop app» и сохрани как data/google-oauth.json');
    process.exitCode = 1;
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  let redirectUri = '';
  let finish;
  const done = new Promise(function (resolve) { finish = resolve; });

  const server = http.createServer(async function (request, response) {
    const url = new URL(request.url, 'http://127.0.0.1');

    if (url.pathname !== '/oauth2callback') {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('not found');
      return;
    }

    if (url.searchParams.get('state') !== state) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page('Ошибка', 'Не совпал state. Попробуй войти заново.'));
      return;
    }

    const error = url.searchParams.get('error');
    if (error) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page('Доступ не выдан', 'Google вернул: ' + error));
      finish({ ok: false, error: error });
      return;
    }

    const code = url.searchParams.get('code');
    if (!code) {
      response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page('Ошибка', 'Google не прислал код авторизации.'));
      return;
    }

    try {
      const tokens = await exchangeCode(credentials, code, redirectUri);
      const next = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope || SCOPE,
        token_type: tokens.token_type || 'Bearer',
        expires_at: Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
        obtained_at: new Date().toISOString()
      };

      if (!next.refresh_token) {
        throw new Error('Google не выдал refresh_token. Удали доступ приложения в аккаунте Google и повтори вход.');
      }

      store.setGoogle(next);

      let channelName = '';
      try {
        const channel = await verifyChannel(next.access_token);
        channelName = (channel && channel.snippet && channel.snippet.title) || '';
      } catch (verifyError) {
        log.warn('Токен сохранён, но канал не проверился:', verifyError.message);
      }

      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page('Готово', channelName
        ? 'Доступ к YouTube-каналу «' + channelName + '» получен. Можешь закрыть вкладку и запустить start.bat.'
        : 'Токен сохранён. Можешь закрыть вкладку и запустить start.bat.'));

      finish({ ok: true, channelName: channelName });
    } catch (exchangeError) {
      response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(page('Ошибка', 'Не удалось обменять код на токен: ' + exchangeError.message));
      finish({ ok: false, error: exchangeError.message });
    }
  });

  await new Promise(function (resolve) {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;
  redirectUri = 'http://127.0.0.1:' + port + '/oauth2callback';

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id: credentials.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state: state
  }).toString();

  console.log('');
  console.log('Открываю браузер. Войди Google-аккаунтом, у которого есть доступ');
  console.log('к каналу (владелец или менеджер), и разреши управление YouTube.');
  console.log('');
  console.log('Если браузер не открылся, скопируй ссылку вручную:');
  console.log(authUrl);
  console.log('');

  openBrowser(authUrl);

  const timeout = setTimeout(function () {
    finish({ ok: false, error: 'timeout' });
  }, 10 * 60000);

  const result = await done;
  clearTimeout(timeout);
  server.close();

  if (!result.ok) {
    console.error('');
    console.error('Вход не завершён' + (result.error === 'timeout' ? ': истекло время ожидания.' : ': ' + result.error));
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('Готово! Токен сохранён в data/tokens.json');
  if (result.channelName) console.log('Канал: ' + result.channelName);
  console.log('');
  console.log('Теперь запусти start.bat');
  console.log('');
}

main().catch(function (error) {
  console.error('');
  console.error('Ошибка входа в YouTube:', error.message);
  console.error('');
  process.exitCode = 1;
});
