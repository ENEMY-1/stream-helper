'use strict';

// Мост между окном «Настройки» и главным процессом.
// Сохранение пишет общий файл overlay-settings.js рядом с overlay.html.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  load: function () {
    return ipcRenderer.invoke('settings:load');
  },
  save: function (settings) {
    return ipcRenderer.invoke('settings:save', settings);
  },
  reset: function () {
    return ipcRenderer.invoke('settings:reset');
  },
  openFolder: function () {
    ipcRenderer.send('settings:open-folder');
  },
  close: function () {
    ipcRenderer.send('settings:close');
  },
  botStatus: function () {
    return ipcRenderer.invoke('bot:status');
  },
  botStart: function () {
    return ipcRenderer.invoke('bot:start');
  },
  botStop: function () {
    return ipcRenderer.invoke('bot:stop');
  },
  botRestart: function () {
    return ipcRenderer.invoke('bot:restart');
  },
  botOpen: function () {
    ipcRenderer.send('bot:open');
  },
  botOpenFolder: function () {
    ipcRenderer.send('bot:open-folder');
  },
  alertsLoad: function () {
    return ipcRenderer.invoke('alerts:load');
  },
  alertsSave: function (values) {
    return ipcRenderer.invoke('alerts:save', values);
  },
  alertsTest: function (values) {
    return ipcRenderer.invoke('alerts:test', values);
  },
  overlayGetUrl: function () {
    return ipcRenderer.invoke('overlay:get-url');
  },
  overlayOpenFolder: function () {
    ipcRenderer.send('overlay:open-folder');
  }
});
