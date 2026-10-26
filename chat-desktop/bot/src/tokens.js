'use strict';

// Хранилище токенов в data/tokens.json и их автообновление.

const { readJson, writeJson } = require('./fsutil');
const { refreshTwitchToken } = require('./twitch-auth');

const REFRESH_RETRY_MS = 5 * 60 * 1000;

class TokenStore {
  constructor(file, log) {
    this.file = file;
    this.log = log;
    this.data = readJson(file, {}) || {};
    this.refreshFailedAt = 0;
  }

  save() {
    if (!writeJson(this.file, this.data)) {
      this.log.warn('Не удалось сохранить токены в', this.file);
    }
  }

  get twitch() {
    return this.data.twitch || null;
  }

  setTwitch(tokens) {
    this.data.twitch = tokens;
    this.save();
  }

  clearTwitch() {
    delete this.data.twitch;
    this.save();
  }

  get google() {
    return this.data.google || null;
  }

  setGoogle(tokens) {
    this.data.google = tokens;
    this.save();
  }

  clearGoogle() {
    delete this.data.google;
    this.save();
  }

  getTwitchLogin() {
    const twitch = this.twitch;
    return (twitch && twitch.login) || '';
  }

  // Возвращает рабочий access token или null (тогда бот читает анонимно).
  async twitchAccessToken(clientId, clientSecret) {
    const twitch = this.twitch;
    if (!twitch || !twitch.access_token) return null;

    const expiresAt = Number(twitch.expires_at) || 0;
    if (!expiresAt || expiresAt - 60000 > Date.now()) return twitch.access_token;

    if (!twitch.refresh_token || !clientId) return null;
    if (Date.now() - this.refreshFailedAt < REFRESH_RETRY_MS) return null;

    try {
      const data = await refreshTwitchToken(clientId, twitch.refresh_token, clientSecret);
      const next = Object.assign({}, twitch, {
        access_token: data.access_token,
        refresh_token: data.refresh_token || twitch.refresh_token,
        expires_at: Date.now() + (Number(data.expires_in) || 0) * 1000,
        scope: data.scope || twitch.scope,
        refreshed_at: new Date().toISOString()
      });
      this.setTwitch(next);
      this.log.info('Twitch-токен обновлён');
      return next.access_token;
    } catch (error) {
      this.refreshFailedAt = Date.now();
      this.log.warn('Twitch-токен не обновился:', error.message);
      this.log.warn('Запусти auth-twitch.bat, чтобы войти заново.');
      return null;
    }
  }
}

module.exports = { TokenStore: TokenStore };
