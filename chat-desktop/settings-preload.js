'use strict';

// Мост между окном «Настройки» и главным процессом.
// Сохранение пишет общий файл overlay-settings.js рядом с overlay.html.

const { contextBridge, ipcRenderer } = require('electron');
const { LOCALES, getBrowserLang } = require('./i18n');

// Словари для перевода интерфейса на стороне окна настроек.
contextBridge.exposeInMainWorld('i18n', {
  locales: LOCALES,
  browserLang: getBrowserLang()
});

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
  },
  twitchAuthStart: function (values) {
    return ipcRenderer.invoke('twitchAuth:start', values);
  },
  twitchAuthSave: function (values) {
    return ipcRenderer.invoke('twitchAuth:save', values);
  },
  twitchAuthLogout: function () {
    return ipcRenderer.invoke('twitchAuth:logout');
  },
  twitchAuthStatus: function () {
    return ipcRenderer.invoke('twitchAuth:status');
  },
  setLanguage: function (lang) {
    return ipcRenderer.invoke('settings:set-language', lang);
  },
  getLanguage: function () {
    return ipcRenderer.invoke('settings:get-language');
  }
});
