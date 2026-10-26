'use strict';

// Прозрачный чат-оверлей поверх игры.
// Окно без рамки, всегда сверху, прозрачное и «сквозное» для кликов.

const { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, screen, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { syncBotConfig } = require('./bot-sync');
const { YouTubeWebReader } = require('./yt-live');

const APP_DIR = __dirname;
const STATE_FILE = path.join(APP_DIR, 'position.json');
const LOG_FILE = path.join(APP_DIR, 'app.log');
// Windows лучше показывает в панели задач многомасштабный .ico,
// а не маленький .png.
const ICON_FILE = path.join(APP_DIR, process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const YT_RELAY_PORT = 38999;
const CHAT_THEMES = ['classic', 'glass', 'neon', 'soft', 'minimal', 'streamlabs'];

// Чат-бот теперь часть этого приложения: код и настройки лежат в bot/.
const BOT_DIR = path.join(APP_DIR, 'bot');
const BOT_ENTRY = path.join(BOT_DIR, 'src', 'index.js');
const BOT_CONFIG = path.join(BOT_DIR, 'config.js');
const BOT_LOG = path.join(BOT_DIR, 'data', 'bot.log');
const BOT_PANEL_FILE = path.join(APP_DIR, 'bot-panel.html');
const BOT_PANEL_PRELOAD = path.join(APP_DIR, 'bot-panel-preload.js');
const BOT_DEFAULT_PORT = 39001;
const BOT_START_TIMEOUT_MS = 25000;
const BOT_RESTART_LIMIT = 3;
const BOT_RESTART_DELAY_MS = 2500;
const BOT_STABLE_MS = 300000;

const BOT_STATE_LABELS = {
  stopped: 'остановлен',
  starting: 'запускается',
  running: 'работает',
  external: 'работает отдельно',
  stopping: 'останавливается',
  error: 'ошибка'
};

const argv = process.argv.slice(1);

// Без AppUserModelID Windows иногда берёт иконку у electron.exe, а не у окна.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.streamhelper.chat');
}

const FLAGS = {
  demo: argv.includes('--demo'),
  // --debug перехватывает сам Electron (как флаг Node), поэтому основной
  // флаг называется --overlay-debug. --debug поддержан для совместимости.
  debug: argv.includes('--overlay-debug') || argv.includes('--debug'),
  settings: argv.includes('--settings'),
  // Открыть панель бота (используется ярлыком «Панель бота»).
  bot: argv.includes('--bot') || argv.includes('--bot-panel'),
  // Не запускать бота вместе с приложением (для отладки оверлея).
  noBot: argv.includes('--no-bot'),
  // Демо-режим самого бота (фейковый чат, без подключений).
  botDemo: argv.includes('--bot-demo'),
  // Не показывать уведомление о запуске (для автозапуска и отладки).
  silent: argv.includes('--silent') || argv.includes('--no-notify')
};

// Тот же оверлей, что и в OBS (junction в obs-overlays/chat).
// Пути строятся от профиля и от папки приложения, чтобы установка работала
// и на другом компьютере/пользователе (установщик кладёт chat-overlay рядом).
const OVERLAY_CANDIDATES = [
  path.join(process.env.USERPROFILE || '', 'Documents', 'obs-overlays', 'chat', 'overlay.html'),
  path.join(APP_DIR, '..', 'chat-overlay', 'overlay.html')
];

const DEFAULT_STATE = {
  width: 520,
  height: 880,
  x: null,
  y: null,
  protected: true
};

let win = null;
let tray = null;
let settingsWin = null;
let editMode = false;
let saveTimer = null;
let dragTimer = null;
let dragOffset = { x: 0, y: 0 };
let state = { ...DEFAULT_STATE };
let botPanelWin = null;
let quitting = false;
let readyToQuit = false;

const bot = {
  state: 'stopped',
  child: null,
  startedAt: 0,
  lastError: '',
  port: BOT_DEFAULT_PORT,
  startedByUs: false,
  restartTimer: null,
  restartCount: 0,
  stopping: false,
  expectExit: false,
  manualStop: false,
  stableTimer: null
};

function log() {
  const args = Array.prototype.slice.call(arguments);
  const line = new Date().toISOString() + ' ' +
    args.map(function (a) { return typeof a === 'string' ? a : JSON.stringify(a); }).join(' ');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) { /* ignore */ }
  console.log(line);
}

function overlayPath() {
  for (let i = 0; i < OVERLAY_CANDIDATES.length; i++) {
    try {
      if (fs.existsSync(OVERLAY_CANDIDATES[i])) return OVERLAY_CANDIDATES[i];
    } catch (e) { /* ignore */ }
  }
  return OVERLAY_CANDIDATES[0];
}

// ---------------------------------------------------------------------------
//  Общие настройки оверлея.
//  Окно «Настройки» пишет их в overlay-settings.js рядом с overlay.html,
//  поэтому OBS и окно поверх игры читают один и тот же файл.
//  config.js остаётся значениями по умолчанию.
// ---------------------------------------------------------------------------
function overlayDir() {
  return path.dirname(overlayPath());
}

function settingsPath() {
  return path.join(overlayDir(), 'overlay-settings.js');
}

function configPath() {
  return path.join(overlayDir(), 'config.js');
}

// Настройки чат-бота теперь всегда лежат внутри приложения.
function botConfigPath() {
  return BOT_CONFIG;
}

function botConfigInfo() {
  return { file: BOT_CONFIG, exists: fs.existsSync(BOT_CONFIG) };
}

function readBotConfig() {
  try {
    delete require.cache[require.resolve(BOT_CONFIG)];
    return require(BOT_CONFIG) || {};
  } catch (error) {
    return {};
  }
}

function botPort() {
  const port = Number(readBotConfig().statusPort);
  return Number.isFinite(port) && port > 0 ? port : BOT_DEFAULT_PORT;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeSettings(base, extra) {
  const out = {};
  Object.keys(base || {}).forEach(function (key) { out[key] = base[key]; });
  Object.keys(extra || {}).forEach(function (key) {
    if (isPlainObject(out[key]) && isPlainObject(extra[key])) {
      out[key] = mergeSettings(out[key], extra[key]);
    } else {
      out[key] = extra[key];
    }
  });
  return out;
}

function readJsSettings(file, globalName) {
  try {
    if (!fs.existsSync(file)) return {};
    let source = fs.readFileSync(file, 'utf8');
    if (source.charCodeAt(0) === 0xFEFF) source = source.slice(1);
    const sandbox = { window: {} };
    vm.runInNewContext(source, sandbox, { filename: file, timeout: 1000 });
    const value = sandbox.window[globalName];
    return isPlainObject(value) ? value : {};
  } catch (error) {
    log('settings read failed', file, error.message);
    return {};
  }
}

function channelList(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? '' : value).split(/[,\s]+/);
  const out = [];
  raw.forEach(function (item) {
    const name = String(item == null ? '' : item).trim()
      .replace(/^[#@]+/, '')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (!name) return;
    if (!/^[a-z0-9_.-]{1,50}$/.test(name)) return;
    if (out.indexOf(name) === -1) out.push(name);
  });
  return out.slice(0, 20);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function normalizeSettings(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const yt = isPlainObject(source.youtube) ? source.youtube : {};
  return {
    twitch: channelList(source.twitch),
    kick: channelList(source.kick),
    youtube: {
      channelId: String(yt.channelId == null ? '' : yt.channelId).trim(),
      videoId: String(yt.videoId == null ? '' : yt.videoId).trim(),
      apiKey: String(yt.apiKey == null ? '' : yt.apiKey).trim(),
      relay: yt.relay !== false,
      // 'auto' — читаем сам чат YouTube без квоты (быстро), 'api' — только
      // официальный Data API (медленно и тратит дневной лимит).
      source: String(yt.source || '').toLowerCase() === 'api' ? 'api' : 'auto',
      pollMs: Math.round(clampNumber(yt.pollMs, 5000, 600000, 12000))
    },
    maxMessages: Math.round(clampNumber(source.maxMessages, 1, 100, 14)),
    fontSize: Math.round(clampNumber(source.fontSize, 10, 72, 24)),
    bgOpacity: Math.round(clampNumber(source.bgOpacity, 0, 100, 58)),
    theme: CHAT_THEMES.indexOf(String(source.theme || '').toLowerCase()) !== -1
      ? String(source.theme).toLowerCase() : 'classic',
    showPlatform: source.showPlatform !== false,
    align: source.align === 'top' ? 'top' : 'bottom',
    demo: source.demo === true,
    debug: source.debug === true,
    syncBot: source.syncBot !== false,
    // Запускать встроенного чат-бота вместе с приложением.
    botAutoStart: source.botAutoStart !== false
  };
}

function loadSettings() {
  const defaults = readJsSettings(configPath(), 'CHAT_CONFIG');
  const saved = readJsSettings(settingsPath(), 'CHAT_USER_SETTINGS');
  return {
    settings: normalizeSettings(mergeSettings(defaults, saved)),
    saved: saved,
    defaults: normalizeSettings(defaults),
    settingsFile: settingsPath(),
    configFile: configPath(),
    bot: botConfigInfo(),
    botProcess: botStatus()
  };
}

function serializeSettings(settings) {
  const header = [
    '// =====================================================================',
    '//  Пользовательские настройки оверлея.',
    '//  Файл создан окном «Настройки» приложения «Чат поверх игры».',
    '//  Его читают оба оверлея: OBS и окно поверх игры.',
    '//  Обновлено: ' + new Date().toISOString(),
    '// =====================================================================',
    ''
  ].join('\n');
  return header + 'window.CHAT_USER_SETTINGS = ' + JSON.stringify(settings, null, 2) + ';\n';
}

function writeSettings(raw) {
  const settings = normalizeSettings(raw);
  const file = settingsPath();
  let source = serializeSettings(settings);
  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, 'utf8');
    if (current.indexOf('\r\n') !== -1) source = source.replace(/\n/g, '\r\n');
    try { fs.copyFileSync(file, file + '.bak'); } catch (error) {
      log('settings backup failed', error.message);
    }
  }
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, source, 'utf8');
  fs.renameSync(tmp, file);
  log('settings saved', file);
  return settings;
}

// ---------------------------------------------------------------------------
//  Встроенный чат-бот.
//  Приложение запускает bot/src/index.js отдельным скрытым процессом через
//  Electron в режиме Node, само следит за его состоянием и открывает его
//  панель в обычном окне. Отдельный node.exe и консоль больше не нужны.
// ---------------------------------------------------------------------------
function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

async function botHealth(port) {
  try {
    const response = await fetch('http://127.0.0.1:' + port + '/health', {
      signal: AbortSignal.timeout(900)
    });
    if (!response.ok) return { ok: false };
    const data = await response.json();
    return Object.assign({ ok: true }, data);
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function waitBotHealth(port, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) return { ok: false, exited: true };
    const health = await botHealth(port);
    if (health.ok) return health;
    await sleep(300);
  }
  return { ok: false, timeout: true };
}

function botLogTail(lines) {
  try {
    const text = fs.readFileSync(BOT_LOG, 'utf8').trim();
    if (!text) return '';
    return text.split(/\r?\n/).slice(-(lines || 3)).join(' | ').slice(-700);
  } catch (error) {
    return '';
  }
}

function botStatus() {
  const config = readBotConfig();
  const twitch = config.twitch || {};
  const botState = bot.state;
  return {
    state: botState,
    label: BOT_STATE_LABELS[botState] || botState,
    port: bot.port || botPort(),
    pid: (bot.child && bot.child.exitCode === null) ? bot.child.pid : null,
    startedAt: bot.startedAt,
    lastError: bot.lastError,
    channel: twitch.channel || '',
    configFile: BOT_CONFIG,
    configExists: fs.existsSync(BOT_CONFIG),
    logFile: BOT_LOG,
    canStop: botState === 'running' || botState === 'external' || botState === 'starting',
    canStart: botState === 'stopped' || botState === 'error',
    canRestart: botState !== 'stopping' && botState !== 'starting'
  };
}

// Все операции с ботом выполняются по очереди: запуск, остановка и
// перезапуск не могут пересечься и поднять два процесса одновременно.
let botQueue = Promise.resolve();

function botOperation(fn) {
  const run = botQueue.then(fn, fn);
  botQueue = run.then(function () {}, function () {});
  return run;
}

function startBot(options) {
  return botOperation(function () { return startBotNow(options || {}); }).catch(function (error) {
    bot.state = 'error';
    bot.lastError = 'Ошибка запуска бота: ' + error.message;
    log('bot start error', error.message);
    updateTrayMenu();
    return botStatus();
  });
}

async function startBotNow(opts) {
  if (quitting) return botStatus();
  if (bot.child && bot.child.exitCode === null) return botStatus();

  bot.manualStop = false;
  if (!opts.auto) bot.restartCount = 0;

  const port = botPort();
  bot.port = port;

  const existing = await botHealth(port);
  if (existing.ok) {
    bot.state = 'external';
    bot.startedAt = 0;
    bot.lastError = '';
    bot.stopping = false;
    bot.startedByUs = false;
    log('bot already running', '| port', port, '| pid', existing.pid || '?');
    updateTrayMenu();
    return botStatus();
  }

  if (!fs.existsSync(BOT_ENTRY)) {
    bot.state = 'error';
    bot.lastError = 'Не найден файл бота: ' + BOT_ENTRY;
    log('bot entry missing', BOT_ENTRY);
    updateTrayMenu();
    return botStatus();
  }

  bot.state = 'starting';
  bot.lastError = '';
  bot.startedAt = Date.now();
  bot.stopping = false;
  bot.expectExit = false;
  updateTrayMenu();

  const args = [BOT_ENTRY];
  if (opts.demo || FLAGS.botDemo) args.push('--demo');
  if (FLAGS.debug) args.push('--verbose');

  let child;
  try {
    child = spawn(process.execPath, args, {
      cwd: BOT_DIR,
      env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
      windowsHide: true,
      stdio: 'ignore'
    });
  } catch (error) {
    bot.state = 'error';
    bot.lastError = 'Не удалось запустить бота: ' + error.message;
    log('bot spawn failed', error.message);
    updateTrayMenu();
    return botStatus();
  }

  bot.child = child;
  bot.startedByUs = true;
  log('bot starting', '| pid', child.pid || '?', '| port', port);

  child.on('error', function (error) {
    bot.lastError = 'Ошибка процесса бота: ' + error.message;
    log('bot process error', error.message);
  });

  child.on('exit', function (code, signal) {
    onBotExit(child, code, signal);
  });

  const health = await waitBotHealth(port, BOT_START_TIMEOUT_MS, child);
  if (health.ok) {
    bot.state = 'running';
    bot.lastError = '';
    log('bot running', '| pid', health.pid || child.pid || '?');
    clearTimeout(bot.stableTimer);
    bot.stableTimer = setTimeout(function () {
      if (bot.state === 'running') bot.restartCount = 0;
    }, BOT_STABLE_MS);
    if (bot.stableTimer.unref) bot.stableTimer.unref();
  } else if (!bot.stopping && !quitting) {
    bot.state = 'error';
    bot.lastError = (health.exited ? 'Бот завершился при запуске.' : 'Бот не ответил за 25 секунд.') +
      (botLogTail() ? ' ' + botLogTail() : '');
    log('bot start failed', bot.lastError);
  }
  updateTrayMenu();
  return botStatus();
}

function onBotExit(child, code, signal) {
  // Событие от старого процесса не должно трогать состояние нового.
  if (bot.child && bot.child !== child) return;
  if (bot.child === child) bot.child = null;
  clearTimeout(bot.stableTimer);
  bot.startedAt = 0;

  if (bot.expectExit || bot.stopping || quitting) {
    bot.expectExit = false;
    bot.state = 'stopped';
    bot.lastError = '';
    log('bot stopped', '| code', code == null ? '—' : code);
    updateTrayMenu();
    return;
  }

  log('bot exited unexpectedly', '| code', code == null ? '—' : code, '| signal', signal || '—');

  if (bot.manualStop) {
    bot.state = 'stopped';
    updateTrayMenu();
    return;
  }

  if (bot.restartCount < BOT_RESTART_LIMIT) {
    bot.restartCount += 1;
    bot.state = 'starting';
    bot.lastError = 'Бот завершился (код ' + code + '). Перезапускаю (' +
      bot.restartCount + '/' + BOT_RESTART_LIMIT + ')…';
    updateTrayMenu();
    clearTimeout(bot.restartTimer);
    bot.restartTimer = setTimeout(function () {
      if (!quitting && !bot.manualStop) {
        startBot({ auto: true }).catch(function (error) {
          log('bot restart failed', error.message);
        });
      }
    }, BOT_RESTART_DELAY_MS);
    return;
  }

  bot.state = 'error';
  bot.lastError = 'Бот завершился (код ' + code + '). ' + botLogTail();
  updateTrayMenu();
  showBotPanelError(bot.lastError, BOT_LOG);
}

function stopBot(options) {
  return botOperation(function () { return stopBotNow(options || {}); }).catch(function (error) {
    bot.state = 'error';
    bot.lastError = 'Ошибка остановки бота: ' + error.message;
    log('bot stop error', error.message);
    updateTrayMenu();
    return botStatus();
  });
}

async function stopBotNow(opts) {
  clearTimeout(bot.restartTimer);
  clearTimeout(bot.stableTimer);

  if (opts.onlyOwn && bot.state === 'external' && !bot.startedByUs) {
    return botStatus();
  }
  if (bot.state === 'stopped' && !bot.child) return botStatus();

  bot.manualStop = true;
  bot.stopping = true;
  bot.expectExit = true;
  bot.state = 'stopping';
  updateTrayMenu();

  const port = bot.port || botPort();
  const health = await botHealth(port);
  if (health.ok) {
    try {
      await fetch('http://127.0.0.1:' + port + '/api/shutdown', {
        method: 'POST',
        headers: { 'x-panel-request': '1' },
        signal: AbortSignal.timeout(2000)
      });
      log('bot shutdown requested');
    } catch (error) {
      log('bot shutdown request failed', error.message);
    }

    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!(await botHealth(port)).ok) break;
      await sleep(200);
    }
  }

  const still = await botHealth(port);
  const childPid = (bot.child && bot.child.exitCode === null) ? bot.child.pid : null;
  if (still.ok || childPid) {
    const pid = still.ok ? (still.pid || childPid) : childPid;
    if (pid) {
      log('bot does not stop, killing pid', pid);
      try {
        spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore'
        });
      } catch (error) { /* ignore */ }
      const killDeadline = Date.now() + 3000;
      while (Date.now() < killDeadline) {
        if (!(await botHealth(port)).ok) break;
        await sleep(150);
      }
    }
  }

  const after = await botHealth(port);
  bot.child = null;
  bot.startedAt = 0;
  bot.stopping = false;
  bot.startedByUs = false;
  bot.restartCount = 0;

  if (after.ok) {
    bot.state = 'error';
    bot.lastError = 'Не удалось остановить бота: порт ' + port + ' всё ещё отвечает.';
    log('bot stop failed', 'port', port);
  } else {
    bot.state = 'stopped';
    bot.lastError = '';
  }
  updateTrayMenu();
  return botStatus();
}

function restartBot() {
  return botOperation(async function () {
    if (quitting) return botStatus();
    await stopBotNow({});
    bot.restartCount = 0;
    return startBotNow({});
  }).catch(function (error) {
    bot.state = 'error';
    bot.lastError = 'Ошибка перезапуска бота: ' + error.message;
    log('bot restart error', error.message);
    updateTrayMenu();
    return botStatus();
  });
}

function toggleBot() {
  const status = botStatus();
  if (status.canStop) return stopBot({});
  return startBot({});
}

function openBotFolder() {
  try {
    shell.openPath(BOT_DIR);
  } catch (error) {
    log('open bot folder failed', error.message);
  }
}

// ---------------------------------------------------------------------------
//  Окно панели бота. Сначала показываем заставку «запускаю», затем локальную
//  панель http://127.0.0.1:39001 — она уже умеет редактировать команды,
//  таймеры, модерацию и розыгрыши.
// ---------------------------------------------------------------------------
function openBotPanel() {
  if (botPanelWin && !botPanelWin.isDestroyed()) {
    if (botPanelWin.isMinimized()) botPanelWin.restore();
    botPanelWin.show();
    botPanelWin.focus();
    return;
  }

  botPanelWin = new BrowserWindow({
    width: 1180,
    height: 850,
    minWidth: 860,
    minHeight: 600,
    title: 'Бот — Stream Helper',
    icon: fs.existsSync(ICON_FILE) ? ICON_FILE : undefined,
    backgroundColor: '#0b0c13',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: BOT_PANEL_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: FLAGS.debug,
      spellcheck: false
    }
  });

  botPanelWin.setMenu(null);
  botPanelWin.loadFile(BOT_PANEL_FILE);
  botPanelWin.once('ready-to-show', function () {
    botPanelWin.show();
    botPanelWin.focus();
  });
  botPanelWin.on('closed', function () { botPanelWin = null; });

  botPanelWin.webContents.setWindowOpenHandler(function (details) {
    if (/^https?:\/\//i.test(details.url)) shell.openExternal(details.url);
    return { action: 'deny' };
  });
  botPanelWin.webContents.on('will-navigate', function (event, url) {
    const allowed = 'http://127.0.0.1:' + (bot.port || botPort());
    if (url.indexOf(allowed) !== 0 && url.indexOf('file://') !== 0) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  log('bot panel opened');
  ensureBotAndLoadPanel().catch(function (error) {
    log('bot panel load failed', error.message);
    showBotPanelError(error.message, BOT_LOG);
  });
}

async function ensureBotAndLoadPanel() {
  if (!botPanelWin || botPanelWin.isDestroyed()) return;

  if (bot.state === 'stopped' || bot.state === 'error') {
    await startBot({});
  }

  const port = bot.port || botPort();
  const health = await waitBotHealth(port, 20000);

  if (!botPanelWin || botPanelWin.isDestroyed()) return;
  if (!health.ok) {
    showBotPanelError(
      (bot.lastError || 'Бот не отвечает.') +
      ' Проверь журнал: ' + BOT_LOG,
      BOT_LOG
    );
    return;
  }

  try {
    await botPanelWin.loadURL('http://127.0.0.1:' + port + '/');
    if (bot.state === 'starting') {
      bot.state = 'running';
      updateTrayMenu();
    }
  } catch (error) {
    showBotPanelError('Не удалось открыть панель бота: ' + error.message, BOT_LOG);
  }
}

function showBotPanelError(message, logFile) {
  if (!botPanelWin || botPanelWin.isDestroyed()) return;
  const payload = JSON.stringify({
    message: String(message || 'Не удалось запустить бота.'),
    log: String(logFile || '')
  });
  botPanelWin.webContents.executeJavaScript(
    'window.botPanelFail && window.botPanelFail(' + payload + ')'
  ).catch(function () { /* страница могла не загрузиться */ });
}

function loadState() {
  try {
    const text = fs.readFileSync(STATE_FILE, 'utf8').replace(/^\uFEFF/, '');
    const raw = JSON.parse(text);
    state = Object.assign({}, DEFAULT_STATE, raw);
  } catch (e) {
    state = { ...DEFAULT_STATE };
  }
}

function saveStateSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 400);
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const data = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y, protected: state.protected !== false };
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { log('save failed', e.message); }
}

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function clampToScreen(bounds) {
  const area = workArea();
  const width = Math.min(Math.max(240, bounds.width), area.width);
  const height = Math.min(Math.max(240, bounds.height), area.height);
  const x = Math.min(Math.max(bounds.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(bounds.y, area.y), area.y + area.height - height);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

function defaultBounds() {
  const area = workArea();
  const width = Math.min(DEFAULT_STATE.width, area.width);
  const height = Math.min(DEFAULT_STATE.height, area.height - 60);
  return {
    width: width,
    height: height,
    x: area.x + area.width - width - 28,
    y: area.y + Math.round((area.height - height) / 2)
  };
}

// ---------------------------------------------------------------------------
//  YouTube-ретранслятор: одно чтение на всё — приложение и OBS берут
//  готовые сообщения с http://127.0.0.1:38999.
//
//  Основной источник — yt-live.js: тот же запрос, что делает страница
//  YouTube. Он НЕ тратит дневную квоту Data API, поэтому чат можно
//  опрашивать каждые 2 секунды вместо 12–40. Data API остаётся запасным
//  вариантом (source: 'api' или если прямой способ перестал работать).
// ---------------------------------------------------------------------------
const ytRelay = {
  server: null,
  timer: null,
  cfg: null,
  chatId: null,
  videoId: null,
  pageToken: null,
  messages: [],
  seq: 0,
  status: 'init',
  error: '',
  source: 'off',      // 'web' | 'api' | 'off'
  feedHits: 0,
  started: Date.now(),
  web: null,          // экземпляр YouTubeWebReader
  apiActive: false,
  lastMessageAt: 0,
  generation: 0       // чтобы колбэки старого читателя не трогали новое состояние
};

function ytApi(pathname, params) {
  const query = new URLSearchParams(Object.assign({ key: ytRelay.cfg.apiKey }, params));
  return fetch('https://www.googleapis.com/youtube/v3/' + pathname + '?' + query.toString())
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) throw new Error(data.error.message);
      return data;
    });
}

function resetYouTubePolling() {
  ytRelay.generation += 1;
  clearTimeout(ytRelay.timer);
  ytRelay.timer = null;
  ytRelay.apiActive = false;
  stopYouTubeWeb();
  ytRelay.chatId = null;
  ytRelay.videoId = null;
  ytRelay.pageToken = null;
  ytRelay.messages = [];
  ytRelay.status = 'init';
  ytRelay.error = '';
  ytRelay.source = 'off';
  ytRelay.lastMessageAt = 0;
  ytRelay.started = Date.now();
}

// Сообщения от любого источника -> общий буфер для OBS и бота.
function ytPushMessages(list) {
  if (!Array.isArray(list) || !list.length) return;
  list.forEach(function (message) {
    if (!message || !message.id || !message.text) return;
    ytRelay.seq += 1;
    ytRelay.messages.push({
      seq: ytRelay.seq,
      id: String(message.id),
      user: message.user || 'youtube',
      seed: message.seed || message.user || '',
      text: String(message.text),
      ts: Number(message.ts) || Date.now(),
      kind: message.kind || 'text'
    });
  });
  if (ytRelay.messages.length > 300) ytRelay.messages = ytRelay.messages.slice(-300);
  ytRelay.lastMessageAt = Date.now();
}

function stopYouTubeWeb() {
  if (!ytRelay.web) return;
  try { ytRelay.web.stop(); } catch (error) { /* ignore */ }
  ytRelay.web = null;
}

// Быстрый источник: страница YouTube, квота не тратится.
function startYouTubeWeb() {
  const cfg = ytRelay.cfg;
  const generation = ytRelay.generation;
  stopYouTubeWeb();

  const reader = new YouTubeWebReader({
    channelId: cfg.channelId,
    videoId: cfg.videoId,
    pollMs: 2000,
    log: function () {
      log.apply(null, Array.prototype.slice.call(arguments));
    },
    onMessage: function (messages) {
      if (generation !== ytRelay.generation) return;
      ytRelay.source = 'web';
      ytPushMessages(messages);
    },
    onStatus: function (info) {
      if (generation !== ytRelay.generation) return;
      const status = info && info.status ? info.status : 'error';
      ytRelay.source = 'web';
      ytRelay.status = status;
      ytRelay.error = (info && info.error) || '';
      if (info && info.videoId) {
        ytRelay.videoId = info.videoId;
        ytRelay.chatId = info.videoId;
      }

      if (status === 'ok') {
        ytStopApiFallback();
      } else if (status === 'blocked') {
        // Прямой способ не отвечает — временно переходим на Data API,
        // но web-читалка продолжает попытки и вернётся сама.
        startApiFallback();
      }
    }
  });

  reader.configure({ channelId: cfg.channelId, videoId: cfg.videoId });
  reader.start();
  ytRelay.web = reader;
  ytRelay.source = 'web';
  log('youtube web reader started', '| channel', cfg.channelId || '—');
}

function startApiFallback() {
  if (ytRelay.apiActive) return;
  if (!ytRelay.cfg || !ytRelay.cfg.apiKey) {
    ytRelay.status = 'blocked';
    ytRelay.error = ytRelay.error || 'прямое чтение не работает, а API-ключ не задан';
    return;
  }
  ytRelay.apiActive = true;
  ytRelay.source = 'api';
  log('youtube: переключаюсь на Data API (запасной вариант)');
  ytSchedule(500);
}

function ytStopApiFallback() {
  if (!ytRelay.apiActive) return;
  ytRelay.apiActive = false;
  clearTimeout(ytRelay.timer);
  ytRelay.timer = null;
  log('youtube: прямое чтение восстановилось, Data API выключен');
}

// Перечитывает настройки и перезапускает чтение YouTube.
// Вызывается при старте и после сохранения окна «Настройки».
function applyYouTubeSettings() {
  const data = loadSettings();
  const yt = data.settings.youtube;
  resetYouTubePolling();
  ytRelay.cfg = {
    channelId: yt.channelId,
    videoId: yt.videoId,
    apiKey: yt.apiKey,
    pollMs: yt.pollMs,
    relay: yt.relay,
    source: yt.source
  };

  if (yt.relay === false) {
    ytRelay.status = 'off';
    log('youtube relay disabled in settings');
    return;
  }

  if (yt.source === 'api') {
    if (!yt.apiKey) {
      ytRelay.status = 'off';
      ytRelay.error = 'для источника «только API» нужен ключ YouTube Data API';
      log('youtube api source selected, but api key is empty');
      return;
    }
    ytRelay.apiActive = true;
    ytRelay.source = 'api';
    ytSchedule(800);
    log('youtube relay polling via Data API', '| poll', yt.pollMs, 'ms');
    return;
  }

  if (!yt.channelId && !yt.videoId) {
    ytRelay.status = 'off';
    log('youtube: не задан ни канал, ни видео');
    return;
  }

  startYouTubeWeb();
}

function ytResolveChannelId(channel) {
  if (/^UC[\w-]{20,}$/i.test(channel)) return Promise.resolve(channel);
  const handle = channel.charAt(0) === '@' ? channel : '@' + channel;
  return ytApi('channels', { part: 'id', forHandle: handle }).then(function (data) {
    const item = (data.items || [])[0];
    if (!item) throw new Error('канал ' + handle + ' не найден');
    return item.id;
  });
}

function youtubeHandleOf(link) {
  const match = String(link || '').match(/youtube\.com\/@([^/?#]+)/i);
  return match ? match[1].toLowerCase() : '';
}

function isYouTubeChannelLink(link) {
  const value = String(link || '');
  return /youtube\.com\/(@|channel\/|c\/|user\/)/i.test(value) && !/watch\?|youtu\.be\//i.test(value);
}

function existingYouTubeLink() {
  const cfg = readBotConfig();
  const alerts = cfg.streamAlerts || {};
  const socials = cfg.socials || {};
  return String(alerts.youtube || socials.youtube || '').trim();
}

// Превращает настройку канала из приложения в ссылку для бота.
// Для UC… пробуем узнать @ник через YouTube API, иначе даём ссылку на /channel/.
async function resolveYouTubeLink(yt, options) {
  const opts = options || {};
  const config = yt || {};
  const videoId = String(config.videoId || '').trim();
  if (videoId) return 'https://www.youtube.com/watch?v=' + videoId;

  const channel = String(config.channelId || '').trim();
  if (!channel) return '';
  if (/^https?:\/\//i.test(channel)) return channel;
  if (/^(www\.)?youtube\.com\//i.test(channel)) return 'https://' + channel.replace(/^\/+/, '');
  if (channel.charAt(0) === '@') return 'https://www.youtube.com/' + channel;
  if (channel.charAt(0) === '/') return 'https://www.youtube.com' + channel;
  if (!/^UC[\w-]{20,}$/i.test(channel)) {
    return 'https://www.youtube.com/@' + channel.replace(/^@+/, '').replace(/^\/+/, '');
  }

  const previousLink = String(opts.previousLink || '').trim();
  const previousChannelId = String(opts.previousChannelId || '').trim();
  try {
    if (!config.apiKey) throw new Error('не задан ключ YouTube API');
    const query = new URLSearchParams({ part: 'snippet', id: channel, key: config.apiKey });
    const response = await fetch('https://www.googleapis.com/youtube/v3/channels?' + query.toString(), {
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      throw new Error((data.error && data.error.message) || ('HTTP ' + response.status));
    }
    const item = (data.items || [])[0];
    const customUrl = item && item.snippet && item.snippet.customUrl;
    if (!customUrl) throw new Error('у канала нет короткой ссылки');
    const link = 'https://www.youtube.com/' + String(customUrl).replace(/^\/+/, '');
    // Если старый адрес — тот же @ник, сохраняем его написание.
    if (previousLink && youtubeHandleOf(previousLink) === youtubeHandleOf(link)) return previousLink;
    return link;
  } catch (error) {
    log('youtube link resolve failed', error.message);
    if (previousLink && previousChannelId === channel && isYouTubeChannelLink(previousLink)) {
      return previousLink;
    }
    return 'https://www.youtube.com/channel/' + channel;
  }
}

function ytResolveLive() {
  const cfg = ytRelay.cfg;
  if (cfg.videoId) return Promise.resolve(cfg.videoId);
  if (!cfg.channelId) return Promise.reject(new Error('канал не задан'));

  return ytResolveChannelId(cfg.channelId).then(function (channelId) {
    return ytApi('channels', { part: 'contentDetails', id: channelId });
  }).then(function (data) {
    const item = (data.items || [])[0];
    const uploads = item && item.contentDetails && item.contentDetails.relatedPlaylists &&
      item.contentDetails.relatedPlaylists.uploads;
    if (!uploads) throw new Error('канал не найден');
    return ytApi('playlistItems', { part: 'contentDetails', playlistId: uploads, maxResults: 10 });
  }).then(function (data) {
    const ids = (data.items || []).map(function (item) {
      return item.contentDetails && item.contentDetails.videoId;
    }).filter(Boolean);
    if (!ids.length) throw new Error('канал не в эфире');
    return ytApi('videos', { part: 'liveStreamingDetails', id: ids.join(',') });
  }).then(function (data) {
    const live = (data.items || []).filter(function (item) {
      const details = item.liveStreamingDetails || {};
      return details.activeLiveChatId && details.actualStartTime && !details.actualEndTime;
    })[0];
    if (!live) throw new Error('канал не в эфире');
    ytRelay.videoId = live.id;
    ytRelay.chatId = live.liveStreamingDetails.activeLiveChatId;
    ytRelay.pageToken = null;
    return live.id;
  });
}

function ytSchedule(delay) {
  clearTimeout(ytRelay.timer);
  ytRelay.timer = setTimeout(ytPollApi, delay);
}

function ytPollApi() {
  const cfg = ytRelay.cfg;
  if (!cfg || cfg.relay === false || !cfg.apiKey || !ytRelay.apiActive) return;

  const ready = ytRelay.chatId ? Promise.resolve() : ytResolveLive();

  ready.then(function () {
    const params = {
      liveChatId: ytRelay.chatId,
      part: 'snippet,authorDetails',
      maxResults: 200
    };
    if (ytRelay.pageToken) params.pageToken = ytRelay.pageToken;
    return ytApi('liveChat/messages', params);
  }).then(function (data) {
    ytPushMessages((data.items || []).map(function (item) {
      const snippet = item.snippet || {};
      const author = item.authorDetails || {};
      return {
        id: item.id,
        user: author.displayName || 'youtube',
        seed: author.channelId || author.displayName || '',
        text: snippet.displayMessage || '',
        ts: snippet.publishedAt ? Date.parse(snippet.publishedAt) : Date.now()
      };
    }));
    if (data.nextPageToken) ytRelay.pageToken = data.nextPageToken;
    ytRelay.status = 'ok';
    ytRelay.error = '';
    ytRelay.source = 'api';
    const interval = Math.max(cfg.pollMs || 10000, data.pollingIntervalMillis || 0);
    if (ytRelay.apiActive) ytSchedule(interval);
  }).catch(function (error) {
    if (!ytRelay.apiActive) return;
    ytRelay.status = /не в эфире|not live/i.test(error.message) ? 'wait' : 'error';
    ytRelay.error = error.message;
    ytRelay.chatId = null;
    ytRelay.pageToken = null;
    if (ytRelay.apiActive) ytSchedule(ytRelay.status === 'wait' ? 60000 : 30000);
  });
}

function startYouTubeRelay() {
  const server = http.createServer(function (req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        ok: true,
        hits: ytRelay.feedHits,
        status: ytRelay.status,
        source: ytRelay.source,
        videoId: ytRelay.videoId || '',
        lastMessageAt: ytRelay.lastMessageAt,
        seq: ytRelay.seq
      }));
      return;
    }

    if (url.pathname === '/yt/feed') {
      ytRelay.feedHits += 1;
      const since = Number(url.searchParams.get('since') || 0) || 0;
      const messages = ytRelay.messages.filter(function (m) { return m.seq > since; });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: ytRelay.status,
        source: ytRelay.source,
        videoId: ytRelay.videoId || '',
        error: ytRelay.error,
        started: ytRelay.started,
        seq: ytRelay.seq,
        lastMessageAt: ytRelay.lastMessageAt,
        messages: messages
      }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  server.on('error', function (error) {
    log('youtube relay error', error.message);
  });

  server.listen(YT_RELAY_PORT, '127.0.0.1', function () {
    log('youtube relay on 127.0.0.1:' + YT_RELAY_PORT);
  });

  ytRelay.server = server;
  applyYouTubeSettings();
}

function stopYouTubeRelay() {
  clearTimeout(ytRelay.timer);
  ytRelay.timer = null;
  ytRelay.apiActive = false;
  stopYouTubeWeb();
  if (ytRelay.server) {
    try { ytRelay.server.close(); } catch (e) { /* ignore */ }
    ytRelay.server = null;
  }
}

function createWindow() {
  const base = (state.x === null || state.y === null)
    ? defaultBounds()
    : { width: state.width, height: state.height, x: state.x, y: state.y };
  const bounds = clampToScreen(base);

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    title: 'Chat Overlay',
    icon: fs.existsSync(ICON_FILE) ? ICON_FILE : undefined,
    webPreferences: {
      preload: path.join(APP_DIR, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: FLAGS.debug,
      spellcheck: false
    }
  });

  win.setMenu(null);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  applyContentProtection(state.protected !== false);
  if (typeof win.setVisibleOnAllWorkspaces === 'function') {
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const query = {};
  if (FLAGS.demo) query.demo = '1';
  if (FLAGS.debug) query.debug = '1';

  win.loadFile(overlayPath(), Object.keys(query).length ? { query: query } : undefined);
  win.once('ready-to-show', function () {
    win.showInactive();
    log('window shown', win.getBounds());
    showStartHint();
  });

  win.on('closed', function () { stopDrag(); win = null; });
  win.on('close', saveState);
  win.on('moved', saveStateSoon);
  win.on('resized', saveStateSoon);

  win.webContents.on('did-fail-load', function (e, code, desc, url) {
    log('did-fail-load', code, desc, url);
  });
  win.webContents.on('render-process-gone', function (e, details) {
    log('render-process-gone', details && details.reason);
  });

  log('overlay:', overlayPath(), '| demo:', FLAGS.demo, '| debug:', FLAGS.debug);
}

function applyContentProtection(enabled) {
  if (!win || win.isDestroyed()) return;
  const on = !!enabled;
  try {
    win.setContentProtection(on);
    state.protected = on;
    log('content protection', on ? 'on (невидим для OBS/захвата)' : 'off (виден в захвате)');
  } catch (e) {
    log('content protection failed', e.message);
  }
  updateTrayMenu();
}

function toggleProtection() {
  applyContentProtection(!(state.protected !== false));
  saveStateSoon();
}

function setEditMode(enabled) {
  if (!win || win.isDestroyed()) return;
  editMode = enabled;

  if (enabled) {
    win.setIgnoreMouseEvents(false);
    win.setFocusable(true);
    win.setResizable(true);
    win.show();
    win.focus();
    win.webContents.send('edit-mode', true);
    win.webContents.executeJavaScript(
      "(function(){" +
      "document.documentElement.style.outline='2px dashed rgba(145,70,255,0.9)';" +
      "document.documentElement.style.outlineOffset='-2px';" +
      "document.body.style.cursor='move';" +
      "document.body.style.userSelect='none';" +
      "})()"
    ).catch(function () { /* ignore */ });
  } else {
    stopDrag();
    win.webContents.send('edit-mode', false);
    win.webContents.executeJavaScript(
      "(function(){" +
      "document.documentElement.style.outline='';" +
      "document.documentElement.style.outlineOffset='';" +
      "document.body.style.cursor='';" +
      "document.body.style.userSelect='';" +
      "})()"
    ).catch(function () { /* ignore */ });
    win.setResizable(false);
    win.setIgnoreMouseEvents(true);
    win.setFocusable(false);
    saveState();
  }
  log('edit mode', enabled);
  updateTrayMenu();
}

function startDrag(point) {
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  dragOffset = { x: point.x - bounds.x, y: point.y - bounds.y };
  stopDrag();
  dragTimer = setInterval(function () {
    if (!win || win.isDestroyed()) { stopDrag(); return; }
    const cursor = screen.getCursorScreenPoint();
    const next = clampToScreen({
      width: win.getBounds().width,
      height: win.getBounds().height,
      x: cursor.x - dragOffset.x,
      y: cursor.y - dragOffset.y
    });
    win.setPosition(next.x, next.y);
  }, 16);
}

function stopDrag() {
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
}

function toggleVisible() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) win.hide();
  else win.showInactive();
}

function reloadChat() {
  if (!win || win.isDestroyed()) return;
  win.webContents.reloadIgnoringCache();
}

// ---------------------------------------------------------------------------
//  Окно «Настройки» — отдельное, обычное (не прозрачное и не сквозное),
//  поэтому его можно спокойно открыть из трея или по Ctrl+Alt+S.
// ---------------------------------------------------------------------------
function openSettingsWindow() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 820,
    height: 780,
    minWidth: 680,
    minHeight: 560,
    title: 'Настройки чата',
    icon: fs.existsSync(ICON_FILE) ? ICON_FILE : undefined,
    backgroundColor: '#0b0c13',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(APP_DIR, 'settings-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: FLAGS.debug,
      spellcheck: false
    }
  });

  settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(APP_DIR, 'settings.html'));
  settingsWin.once('ready-to-show', function () {
    settingsWin.show();
    settingsWin.focus();
  });
  settingsWin.on('closed', function () { settingsWin = null; });
  log('settings window opened');
}

async function saveSettingsFromWindow(raw) {
  const before = loadSettings().settings;
  const settings = writeSettings(raw);
  // Канал из приложения -> ссылка в !social и в уведомлениях о начале/конце.
  settings.youtube.link = await resolveYouTubeLink(settings.youtube, {
    previousChannelId: before.youtube.channelId,
    previousLink: existingYouTubeLink()
  });

  let sync;
  if (settings.syncBot === false) {
    sync = { ok: true, changed: false, skipped: true, reason: 'disabled', file: botConfigPath() };
  } else {
    sync = syncBotConfig(settings, { file: botConfigPath(), log: log });
    log('bot sync', sync.ok ? (sync.changed ? 'updated' : 'no changes') : ('failed: ' + sync.reason));
  }

  const result = { ok: true, settings: settings, sync: sync };

  const autoWas = before.botAutoStart !== false;
  const autoNow = settings.botAutoStart !== false;
  if (autoWas !== autoNow) {
    result.botAutoStartChanged = true;
    if (autoNow) {
      startBot({}).catch(function (error) { log('bot autostart failed', error.message); });
    } else {
      stopBot({}).catch(function (error) { log('bot autostop failed', error.message); });
    }
  }

  // Если поменялся канал/YouTube, работающий бот перезапускается сам.
  if (!result.botAutoStartChanged && sync && sync.changed) {
    if (bot.state === 'running') {
      result.botRestarting = true;
      restartBot().catch(function (error) { log('bot restart after settings failed', error.message); });
    } else if (bot.state === 'external') {
      result.botExternal = true;
    }
  }

  applyYouTubeSettings();
  reloadChat();
  return result;
}

async function resetSettingsToConfig() {
  const file = settingsPath();
  try {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, file + '.bak');
      fs.unlinkSync(file);
    }
  } catch (error) {
    log('settings reset failed', error.message);
    throw error;
  }

  const data = loadSettings();
  const currentBot = readBotConfig();
  const currentYt = currentBot.youtube || {};
  data.settings.youtube.link = await resolveYouTubeLink(data.settings.youtube, {
    previousChannelId: currentYt.channelId,
    previousLink: existingYouTubeLink()
  });
  let sync;
  if (data.settings.syncBot === false) {
    sync = { ok: true, changed: false, skipped: true, reason: 'disabled', file: data.bot.file };
  } else {
    sync = syncBotConfig(data.settings, { file: data.bot.file, log: log });
  }

  if (sync && sync.changed) {
    if (bot.state === 'running') {
      restartBot().catch(function (error) { log('bot restart after reset failed', error.message); });
    }
  }

  applyYouTubeSettings();
  reloadChat();
  log('settings reset to config.js');
  return Object.assign({}, data, { sync: sync });
}

function openSettingsFolder() {
  const file = settingsPath();
  try {
    if (fs.existsSync(file)) shell.showItemInFolder(file);
    else shell.openPath(overlayDir());
  } catch (error) {
    log('open settings folder failed', error.message);
  }
}

function resetPosition() {
  if (!win || win.isDestroyed()) return;
  const b = clampToScreen(defaultBounds());
  win.setBounds(b);
  saveState();
}

function resizeBy(delta) {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const next = clampToScreen({
    width: b.width + delta,
    height: b.height + delta,
    x: b.x,
    y: b.y
  });
  win.setBounds(next);
  saveState();
}

function quit() {
  app.quit();
}

function registerHotkey(accelerator, handler) {
  try {
    const ok = globalShortcut.register(accelerator, handler);
    log('hotkey', accelerator, ok ? 'ok' : 'busy');
    return ok;
  } catch (e) {
    log('hotkey failed', accelerator, e.message);
    return false;
  }
}

function buildTrayMenu() {
  const status = botStatus();
  const botChannel = status.channel ? ' · #' + status.channel : '';
  return Menu.buildFromTemplate([
    { label: 'Бот: ' + status.label + botChannel, enabled: false },
    { label: 'Панель бота…  (Ctrl+Alt+B)', click: openBotPanel },
    {
      label: status.canStop ? 'Остановить бота' : 'Запустить бота',
      enabled: status.canStop || status.canStart,
      click: function () { toggleBot(); }
    },
    {
      label: 'Перезапустить бота',
      enabled: status.canRestart,
      click: function () { restartBot(); }
    },
    { label: 'Папка бота', click: openBotFolder },
    { type: 'separator' },
    { label: 'Настройки…  (Ctrl+Alt+S)', click: openSettingsWindow },
    { type: 'separator' },
    { label: 'Показать / скрыть чат  (Ctrl+Alt+C)', click: toggleVisible },
    { label: editMode ? 'Выйти из режима перемещения' : 'Режим перемещения  (Ctrl+Alt+E)', click: function () { setEditMode(!editMode); } },
    { label: 'Обновить чат  (Ctrl+Alt+R)', click: reloadChat },
    { type: 'checkbox', checked: state.protected !== false, label: 'Невидим для OBS / захвата  (Ctrl+Alt+P)', click: function (item) { applyContentProtection(item.checked); saveStateSoon(); } },
    { label: 'Сбросить позицию', click: resetPosition },
    { type: 'separator' },
    { label: 'Выход  (Ctrl+Alt+Q)', click: quit }
  ]);
}

function updateTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

// Короткая подсказка внутри окна: пустой оверлей выглядит как «ничего не запустилось».
// Висит, пока в чате не появится первое сообщение (но не дольше ttl).
// force — показать и поверх уже заполненного чата: так повторный клик по ярлыку
// даёт видимый отклик, хотя окно прозрачное.
function showStartHint(text, options) {
  if (!win || win.isDestroyed()) return;
  if (FLAGS.demo || FLAGS.silent) return;
  const opts = options || {};
  const message = text || 'Stream Helper запущен · жду сообщения из чата';
  const ttl = opts.ttl > 0 ? opts.ttl : 15000;
  const force = opts.force === true;
  const js = [
    '(function () {',
    '  try {',
    "    var old = document.getElementById('stream-helper-start-hint');",
    '    if (old) old.remove();',
    '    if (window.__streamHelperHintObserver) {',
    '      try { window.__streamHelperHintObserver.disconnect(); } catch (e) {}',
    '      window.__streamHelperHintObserver = null;',
    '    }',
    "    var box = document.getElementById('chat');",
    '    if (!' + force + ' && box && box.children.length) return;',
    "    var el = document.createElement('div');",
    "    el.id = 'stream-helper-start-hint';",
    '    el.textContent = ' + JSON.stringify(message) + ';',
    "    el.style.cssText = 'position:fixed;left:16px;bottom:16px;padding:10px 14px;border-radius:10px;" +
      "background:rgba(20,16,32,.88);color:#e9e2ff;font:500 14px/1.35 system-ui,Segoe UI,sans-serif;" +
      "box-shadow:0 8px 24px rgba(0,0,0,.35);border:1px solid rgba(160,120,255,.45);z-index:99999;" +
      "pointer-events:none;transition:opacity .6s';",
    '    document.body.appendChild(el);',
    '    var hide = function () {',
    "      el.style.opacity = '0';",
    '      setTimeout(function () { el.remove(); }, 700);',
    '    };',
    '    var timer = setTimeout(hide, ' + ttl + ');',
    '    if (!' + force + ' && box && window.MutationObserver) {',
    '      var observer = new MutationObserver(function () {',
    '        if (!box.children.length) return;',
    '        clearTimeout(timer);',
    '        observer.disconnect();',
    '        window.__streamHelperHintObserver = null;',
    '        hide();',
    '      });',
    '      observer.observe(box, { childList: true });',
    '      window.__streamHelperHintObserver = observer;',
    '    }',
    '  } catch (e) { /* страница могла не загрузиться */ }',
    '})();'
  ].join('\n');
  win.webContents.executeJavaScript(js, true).catch(function () { /* ignore */ });
}

function trayIconPath() {
  const home = process.env.USERPROFILE || app.getPath('home');
  const candidates = [
    ICON_FILE,
    path.join(APP_DIR, 'icon.png'),
    path.join(home, 'Documents', 'Настройки чата', 'icon.ico'),
    path.join(home, 'Documents', 'Настройки чата', 'icon.png'),
    path.join(APP_DIR, 'bot', 'panel.ico')
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return '';
}

function createTray() {
  const file = trayIconPath();
  if (!file) {
    log('tray icon missing, skip tray');
    return;
  }
  try {
    const image = nativeImage.createFromPath(file);
    if (image.isEmpty()) {
      log('tray icon unreadable, skip tray', file);
      return;
    }
    tray = new Tray(image.resize({ width: 16, height: 16 }));
    tray.setToolTip('Stream Helper — чат и бот');
    updateTrayMenu();
    tray.on('click', toggleVisible);
    log('tray ready', file);
  } catch (e) {
    log('tray create failed', e.message);
    return;
  }

  // Один раз за запуск говорим, что приложение реально стартовало:
  // окно оверлея прозрачное и без сообщений его легко не заметить.
  if (FLAGS.silent) return;
  const text = 'Чат и бот запущены. Иконка в трее: правый клик — меню, Ctrl+Alt+C — скрыть/показать окно.';
  setTimeout(function () {
    if (!tray) return;
    try {
      tray.displayBalloon({
        title: 'Stream Helper',
        content: text,
        iconType: 'info',
        noSound: true
      });
    } catch (e) {
      log('tray balloon failed', e.message);
    }
  }, 1200);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', function (event, commandLine) {
    const wantsBot = commandLine.some(function (arg) {
      return arg === '--bot' || arg === '--bot-panel';
    });
    if (wantsBot) {
      openBotPanel();
      return;
    }
    // Повторный клик по ярлыку должен поднимать окно, даже если оно уже видно.
    if (win && !win.isDestroyed()) {
      const wasVisible = win.isVisible();
      try {
        win.setAlwaysOnTop(true, 'screen-saver');
        if (wasVisible) win.moveTop();
        else win.showInactive();
      } catch (e) {
        log('second-instance raise failed', e.message);
      }
      // Окно прозрачное и без сообщений почти невидимо, поэтому повторный
      // запуск подтверждаем подсказкой поверх чата.
      showStartHint(
        wasVisible
          ? 'Stream Helper уже запущен · окно чата на экране'
          : 'Stream Helper уже запущен · окно чата снова на экране',
        { force: true, ttl: 4000 }
      );
      log('second-instance raised window');
    } else {
      log('second-instance before window');
    }
  });

  app.whenReady().then(function () {
    loadState();
    createWindow();
    createTray();
    startYouTubeRelay();

    registerHotkey('Control+Alt+C', toggleVisible);
    registerHotkey('Control+Alt+E', function () { setEditMode(!editMode); });
    registerHotkey('Control+Alt+R', reloadChat);
    registerHotkey('Control+Alt+S', openSettingsWindow);
    registerHotkey('Control+Alt+B', openBotPanel);
    registerHotkey('Control+Alt+P', toggleProtection);
    registerHotkey('Control+Alt+Q', quit);
    registerHotkey('Control+Alt+Plus', function () { resizeBy(40); });
    registerHotkey('Control+Alt+]', function () { resizeBy(40); });
    registerHotkey('Control+Alt+[', function () { resizeBy(-40); });

    ipcMain.handle('settings:load', function () {
      return loadSettings();
    });
    ipcMain.handle('settings:save', function (event, raw) {
      return saveSettingsFromWindow(raw);
    });
    ipcMain.handle('settings:reset', function () {
      return resetSettingsToConfig();
    });
    ipcMain.on('settings:open-folder', openSettingsFolder);
    ipcMain.on('settings:close', function () {
      if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close();
    });

    ipcMain.handle('bot:status', function () {
      return botStatus();
    });
    ipcMain.handle('bot:start', function () {
      return startBot({});
    });
    ipcMain.handle('bot:stop', function () {
      return stopBot({});
    });
    ipcMain.handle('bot:restart', function () {
      return restartBot();
    });
    ipcMain.on('bot:open', openBotPanel);
    ipcMain.on('bot:open-folder', openBotFolder);
    ipcMain.on('bot:panel-retry', function () {
      ensureBotAndLoadPanel().catch(function (error) {
        log('bot panel retry failed', error.message);
        showBotPanelError(error.message, BOT_LOG);
      });
    });

    const initial = loadSettings();
    if (!FLAGS.noBot && initial.settings.botAutoStart !== false) {
      startBot({}).catch(function (error) {
        log('bot autostart failed', error.message);
      });
    }

    if (FLAGS.settings) openSettingsWindow();
    if (FLAGS.bot) openBotPanel();

    ipcMain.on('overlay-drag-start', function (event, point) {
      if (editMode && point) startDrag(point);
    });
    ipcMain.on('overlay-drag-end', function () {
      stopDrag();
      saveStateSoon();
    });

    screen.on('display-metrics-changed', function () {
      if (win && !win.isDestroyed()) {
        win.setBounds(clampToScreen(win.getBounds()));
      }
    });
  });

  app.on('before-quit', function (event) {
    if (readyToQuit) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    clearTimeout(bot.restartTimer);
    stopBot({ onlyOwn: true }).catch(function (error) {
      log('bot stop on quit failed', error.message);
    }).then(function () {
      readyToQuit = true;
      app.quit();
    });
  });

  app.on('will-quit', function () {
    globalShortcut.unregisterAll();
    stopYouTubeRelay();
    saveState();
  });

  app.on('window-all-closed', function () {
    app.quit();
  });
}

process.on('uncaughtException', function (error) {
  log('uncaught', error && error.stack ? error.stack : String(error));
});
