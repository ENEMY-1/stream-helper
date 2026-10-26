'use strict';

// Проверка config.js: запускается через check-config.bat, ничего не отправляет.

const fs = require('node:fs');
const { loadConfig } = require('./config');
const { readJson } = require('./fsutil');

function mark(value) {
  return value ? 'есть' : 'НЕТ';
}

function main() {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    console.log('');
    console.log('ОШИБКА В КОНФИГЕ');
    console.log('');
    console.log(error.message);
    console.log('');
    console.log('Частая причина — пропущена запятая, кавычка или скобка.');
    console.log('Открой config.js через edit-config.bat и проверь место из сообщения выше.');
    console.log('');
    process.exitCode = 1;
    return;
  }

  const tokens = readJson(config.paths.tokens, {}) || {};
  const twitchToken = !!(tokens.twitch && tokens.twitch.access_token);
  const googleToken = !!(tokens.google && tokens.google.refresh_token);
  const googleJson = fs.existsSync(config.paths.google);
  const twitchReady = !!(config.twitch.clientId && twitchToken);
  const youtubeEnabled = config.youtube.enabled !== false;
  const youtubeReady = !!(youtubeEnabled && googleToken);

  console.log('');
  console.log('Проверка настроек');
  console.log('Файл: ' + config.configFile);
  console.log('Режим: ' + (youtubeEnabled ? 'Twitch + YouTube' : 'только Twitch'));
  console.log('');
  console.log('TWITCH');
  console.log('  канал:          #' + (config.twitch.channel || 'НЕ ЗАДАН'));
  console.log('  Client ID:      ' + (config.twitch.clientId || 'НЕ ЗАПОЛНЕН (config.js -> twitch.clientId)'));
  console.log('  токен входа:    ' + (twitchToken ? 'есть' : 'нет (запусти auth-twitch.bat)'));
  console.log('  отправка:       ' + (twitchReady ? 'готова' : 'НЕ БУДЕТ — только чтение'));
  console.log('');

  console.log('YOUTUBE');
  if (!youtubeEnabled) {
    console.log('  выключен — бот работает только с Twitch.');
    console.log('  (включить: youtube.enabled = true и auth-youtube.bat, но сейчас не нужно)');
  } else {
    console.log('  канал:          ' + (config.youtube.channelId || config.youtube.videoId || 'НЕ ЗАДАН'));
    console.log('  API-ключ:       ' + mark(config.youtube.apiKey));
    console.log('  OAuth JSON:     ' + (googleJson ? 'есть (data/google-oauth.json)' : 'нет (data/google-oauth.json)'));
    console.log('  токен входа:    ' + (googleToken ? 'есть' : 'нет (запусти auth-youtube.bat)'));
    console.log('  отправка:       ' + (youtubeReady ? 'готова' : 'НЕ БУДЕТ — только чтение'));
    console.log('  бюджет ответов: ' + config.youtube.replyBudgetUnits + ' единиц (~' +
      Math.floor(Number(config.youtube.replyBudgetUnits) / 20) + ' сообщений в день)');
  }
  console.log('');

  const alerts = config.streamAlerts;
  const alertsReady = !!(alerts.telegram.botToken && alerts.telegram.chatId);
  console.log('TELEGRAM');
  console.log('  уведомления:    ' + (!alerts.enabled ? 'выключены (streamAlerts.enabled = false)'
    : (alertsReady ? 'включены' : 'НЕ БУДУТ — заполни botToken и chatId')));
  if (alerts.enabled) {
    console.log('  бот-токен:      ' + mark(alerts.telegram.botToken));
    console.log('  chat_id:        ' + (alerts.telegram.chatId || 'НЕ ЗАДАН'));
    console.log('  проверка:       раз в ' + alerts.checkIntervalSec + ' с');
    console.log('  итоги стрима:   ' + (alerts.offlineEnabled !== false
      ? 'присылаются (пик зрителей, длительность, чат)'
      : 'выключены (streamAlerts.offlineEnabled = false)'));
    console.log('  YouTube:        ' + (alerts.youtube || '— (ссылки не будет)'));
  }
  console.log('');

  console.log('ОСТАЛЬНОЕ');
  console.log('  своих команд:   ' + (config.commands || []).length);
  console.log('  автосообщений:  ' + (config.timers || []).length);
  if (youtubeEnabled) {
    console.log('  ретранслятор:   ' + (config.youtube.useRelay ? config.youtube.relayUrl : 'выключен'));
  }
  console.log('');
  console.log('Что делать:');
  if (!config.twitch.clientId) {
    console.log('  Twitch: получи Client ID на dev.twitch.tv/console/apps');
    console.log('          и впиши в config.js (удобно через edit-config.bat).');
  }
  if (!twitchToken) {
    console.log('  Twitch: запусти auth-twitch.bat и войди аккаунтом бота.');
  }
  if (youtubeEnabled && !googleJson) {
    console.log('  YouTube: скачай OAuth client JSON (Desktop app) в data/google-oauth.json.');
  }
  if (youtubeEnabled && !googleToken) {
    console.log('  YouTube: запусти auth-youtube.bat и войди аккаунтом канала.');
  }
  if (alerts.enabled && !alertsReady) {
    console.log('  Telegram: заполни streamAlerts.telegram (botToken и chatId),');
    console.log('            затем проверь через test-alert.bat --chats и test-alert.bat.');
  }
  if (twitchReady || youtubeReady) {
    console.log('  Можно запускать start.bat.');
  }
  console.log('');
  console.log('Это только проверка — бот сейчас ничего не отправлял.');
  console.log('');
}

main();
