'use strict';

// Мост для заставки окна «Бот»: кнопка «Повторить» просит главный процесс
// ещё раз запустить бота и открыть панель.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('botPanelApi', {
  retry: function () {
    ipcRenderer.send('bot:panel-retry');
  }
});
