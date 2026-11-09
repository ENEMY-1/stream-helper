'use strict';

// Локальная панель: статус бота и визуальный редактор команд.
// http://127.0.0.1:39001

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const WEB_ROOT = path.join(__dirname, 'web');
const BODY_LIMIT = 256 * 1024;

// Язык интерфейса берётся из общих настроек оверлея: окно настроек пишет
// туда «auto», «ru» или «en», а панель бота читает и применяет его сама.
//
// Настройки могут лежать в двух местах — так же, как их ищет main.js:
// сначала папка OBS-оверлея в «Документах» (если она установлена), иначе
// chat-overlay рядом с приложением. Если смотреть только во вторую, панель
// не увидит смену языка у тех, кто держит оверлей в «Документах».
function settingsCandidates() {
  const home = process.env.USERPROFILE || os.homedir() || '';
  return [
    {
      marker: path.join(home, 'Documents', 'obs-overlays', 'chat', 'overlay.html'),
      file: path.join(home, 'Documents', 'obs-overlays', 'chat', 'overlay-settings.js')
    },
    {
      marker: path.join(__dirname, '..', '..', '..', 'chat-overlay', 'overlay.html'),
      file: path.join(__dirname, '..', '..', '..', 'chat-overlay', 'overlay-settings.js')
    }
  ];
}

function settingsFile() {
  const candidates = settingsCandidates();
  for (let i = 0; i < candidates.length; i += 1) {
    try {
      if (fs.existsSync(candidates[i].marker)) return candidates[i].file;
    } catch (error) { /* ignore */ }
  }
  return candidates[1].file;
}

function readLanguageSetting() {
  try {
    const text = fs.readFileSync(settingsFile(), 'utf8');
    const match = text.match(/["']language["']\s*:\s*["']([^"']+)["']/);
    const value = match ? String(match[1]).toLowerCase() : 'auto';
    return value === 'ru' || value === 'en' ? value : 'auto';
  } catch (error) {
    return 'auto';
  }
}

function systemLanguage() {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return String(locale).toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
  } catch (error) {
    return 'ru';
  }
}

function resolvePanelLanguage() {
  const setting = readLanguageSetting();
  if (setting === 'ru' || setting === 'en') return setting;
  return systemLanguage();
}

const ASSETS = {
  '/': { file: 'index.html', type: 'text/html; charset=utf-8', html: true },
  '/index.html': { file: 'index.html', type: 'text/html; charset=utf-8', html: true },
  '/assets/i18n.js': { file: 'i18n.js', type: 'text/javascript; charset=utf-8' },
  '/assets/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
  '/assets/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
  '/favicon.svg': { file: 'favicon.svg', type: 'image/svg+xml' }
};

function securityHeaders(type, isHtml) {
  const headers = {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store'
  };
  if (isHtml) {
    headers['Content-Security-Policy'] = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self'",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'"
    ].join('; ');
    headers['X-Frame-Options'] = 'DENY';
  }
  return headers;
}

function sendJson(response, status, data) {
  if (response.writableEnded) return;
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  response.end(body);
}

function httpError(status, message, fields) {
  const error = new Error(message);
  error.statusCode = status;
  error.fields = fields || {};
  return error;
}

function isLocalHost(host, port) {
  const value = String(host || '').toLowerCase();
  return value === '127.0.0.1:' + port ||
    value === 'localhost:' + port ||
    value === '[::1]:' + port;
}

function isLocalOrigin(origin, port) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    const originPort = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    return (host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]') &&
      originPort === port;
  } catch (error) {
    return false;
  }
}

function readBody(request) {
  return new Promise(function (resolve, reject) {
    let size = 0;
    let tooLarge = false;
    const chunks = [];
    request.on('data', function (chunk) {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', function () {
      if (tooLarge) {
        reject(httpError(413, 'Слишком большой запрос'));
        return;
      }
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(httpError(400, 'Некорректный JSON в запросе'));
      }
    });
    request.on('error', reject);
  });
}

async function handle(request, response, options) {
  const url = new URL(request.url, 'http://127.0.0.1');
  const port = options.port;
  const log = options.log;

  if (!isLocalHost(request.headers.host, port)) {
    sendJson(response, 403, { ok: false, error: 'Панель доступна только с этого компьютера' });
    return;
  }

  if (url.pathname === '/status') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { ok: false, error: 'Метод не поддерживается' });
      return;
    }
    try {
      sendJson(response, 200, Object.assign({ language: resolvePanelLanguage() }, options.getSnapshot()));
    } catch (error) {
      sendJson(response, 500, { ok: false, error: error.message });
    }
    return;
  }

  if (url.pathname === '/health') {
    sendJson(response, 200, { ok: true, pid: process.pid });
    return;
  }

  if (url.pathname === '/api/language') {
    sendJson(response, 200, {
      ok: true,
      setting: readLanguageSetting(),
      language: resolvePanelLanguage()
    });
    return;
  }

  // Остановка бота по команде приложения. Нужна, чтобы бот успел сохранить
  // состояние, когда его закрывает окно «Чат поверх игры».
  if (url.pathname === '/api/shutdown') {
    if (request.method !== 'POST') {
      sendJson(response, 405, { ok: false, error: 'Метод не поддерживается' });
      return;
    }
    if (request.headers['x-panel-request'] !== '1') {
      sendJson(response, 403, { ok: false, error: 'Запрос отклонён: нет метки панели' });
      return;
    }
    sendJson(response, 200, { ok: true });
    log.info('Панель: команда остановки бота');
    setTimeout(function () {
      if (typeof options.onShutdown === 'function') options.onShutdown();
    }, 100);
    return;
  }

  if (url.pathname === '/api/panel') {
    if (request.method !== 'GET') {
      sendJson(response, 405, { ok: false, error: 'Метод не поддерживается' });
      return;
    }
    if (!options.panel) {
      sendJson(response, 503, { ok: false, error: 'Редактор сейчас недоступен' });
      return;
    }
    sendJson(response, 200, Object.assign({ ok: true, language: resolvePanelLanguage() }, options.panel.getData()));
    return;
  }

  if (url.pathname === '/api/commands' || url.pathname === '/api/timers' ||
      url.pathname === '/api/socials' || url.pathname === '/api/moderation' ||
      url.pathname === '/api/entertainment') {
    if (request.method !== 'PUT') {
      sendJson(response, 405, { ok: false, error: 'Метод не поддерживается' });
      return;
    }
    if (!options.panel) {
      sendJson(response, 503, { ok: false, error: 'Редактор сейчас недоступен' });
      return;
    }
    if (request.headers['x-panel-request'] !== '1') {
      sendJson(response, 403, { ok: false, error: 'Запрос отклонён: нет метки панели' });
      return;
    }
    if (!isLocalOrigin(request.headers.origin, port)) {
      sendJson(response, 403, { ok: false, error: 'Запрос отклонён: чужой источник' });
      return;
    }
    const contentType = String(request.headers['content-type'] || '');
    if (!contentType.toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { ok: false, error: 'Нужен Content-Type: application/json' });
      return;
    }

    let body;
    try {
      body = await readBody(request);
    } catch (error) {
      sendJson(response, error.statusCode || 400, { ok: false, error: error.message });
      return;
    }

    try {
      if (url.pathname === '/api/commands') {
        const commands = options.panel.saveCommands(body.commands);
        sendJson(response, 200, { ok: true, commands: commands });
      } else if (url.pathname === '/api/timers') {
        const timers = options.panel.saveTimers(body.timers);
        sendJson(response, 200, { ok: true, timers: timers });
      } else if (url.pathname === '/api/socials') {
        const socials = options.panel.saveSocials(body.socials);
        sendJson(response, 200, { ok: true, socials: socials });
      } else if (url.pathname === '/api/moderation') {
        const moderation = options.panel.saveModeration(body.moderation);
        sendJson(response, 200, { ok: true, moderation: moderation });
      } else {
        const result = options.panel.saveEntertainment(body);
        sendJson(response, 200, Object.assign({ ok: true }, result));
      }
    } catch (error) {
      const status = error.statusCode || 500;
      if (status >= 500) {
        log.error('Панель, сохранение:', error.stack || error.message);
      } else {
        log.warn('Панель: ' + error.message);
      }
      sendJson(response, status, {
        ok: false,
        error: error.message,
        fields: error.fields || {}
      });
    }
    return;
  }

  if (request.method === 'GET' && ASSETS[url.pathname]) {
    const asset = ASSETS[url.pathname];
    const file = path.join(WEB_ROOT, asset.file);
    let content;
    try {
      content = fs.readFileSync(file);
    } catch (error) {
      log.error('Не найден файл панели:', file);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Файл панели не найден: ' + asset.file);
      return;
    }
    if (asset.html) {
      // Язык подставляется в HTML сразу, чтобы панель не мигала русским
      // текстом перед первой загрузкой app.js.
      const lang = resolvePanelLanguage();
      content = Buffer.from(
        content.toString('utf8').replace(
          /<html lang="[^"]*" data-lang="[^"]*">/,
          '<html lang="' + lang + '" data-lang="' + lang + '">'
        ),
        'utf8'
      );
    }
    response.writeHead(200, securityHeaders(asset.type, asset.html));
    response.end(content);
    return;
  }

  response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('not found');
}

function startStatusServer(options) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port) || 39001;
  const log = options.log;

  const settings = {
    port: port,
    log: log,
    getSnapshot: options.getSnapshot,
    panel: options.panel || null,
    onShutdown: options.onShutdown || null
  };

  const server = http.createServer(function (request, response) {
    handle(request, response, settings).catch(function (error) {
      log.error('Панель:', error.stack || error.message);
      if (!response.writableEnded) {
        sendJson(response, 500, { ok: false, error: 'Внутренняя ошибка панели' });
      }
    });
  });

  server.on('error', function (error) {
    log.error('Панель статуса не запустилась:', error.message);
  });

  server.listen(port, host, function () {
    log.info('Панель управления: http://' + host + ':' + port);
  });

  return {
    server: server,
    close: function () {
      return new Promise(function (resolve) {
        server.close(function () { resolve(); });
      });
    }
  };
}

module.exports = { startStatusServer: startStatusServer };
