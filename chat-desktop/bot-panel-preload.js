'use strict';

// Мост для заставки окна «Бот»: кнопка «Повторить» просит главный процесс
// ещё раз запустить бота и открыть панель. Словари нужны, чтобы заставка
// говорила на выбранном языке интерфейса.

const { contextBridge, ipcRenderer } = require('electron');
const { LOCALES } = require('./i18n');

const langArg = process.argv.find(function (arg) {
  return arg.indexOf('--ui-language=') === 0;
});
const language = langArg ? langArg.slice('--ui-language='.length) : 'ru';

contextBridge.exposeInMainWorld('i18n', {
  locales: LOCALES,
  language: language
});

contextBridge.exposeInMainWorld('botPanelApi', {
  retry: function () {
    ipcRenderer.send('bot:panel-retry');
  }
});
