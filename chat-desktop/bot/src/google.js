'use strict';

// OAuth-токен Google: чтение, обновление, сохранение.

const fs = require('node:fs');
const { requestJson } = require('./net');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

class GoogleAuth {
  constructor(options) {
    this.store = options.store;
    this.credentialsFile = options.credentialsFile;
    this.log = options.log;
    this.credentialsCache = null;
    this.refreshing = null;
    this.lastError = '';
  }

  hasToken() {
    const google = this.store.google;
    return !!(google && google.refresh_token);
  }

  credentials() {
    if (this.credentialsCache) return this.credentialsCache;
    if (!fs.existsSync(this.credentialsFile)) {
      throw new Error('Нет файла ' + this.credentialsFile + ' — скачай OAuth client JSON из Google Cloud и положи его туда.');
    }
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.credentialsFile, 'utf8'));
    } catch (error) {
      throw new Error('Файл ' + this.credentialsFile + ' не читается как JSON.');
    }
    const creds = raw.installed || raw.web || raw;
    if (!creds || !creds.client_id || !creds.client_secret) {
      throw new Error('В google-oauth.json нет client_id/client_secret. Нужен тип «Desktop app».');
    }
    this.credentialsCache = creds;
    return creds;
  }

  async accessToken(options) {
    const force = !!(options && options.force);
    const google = this.store.google;
    if (!google || !google.access_token) {
      if (!google || !google.refresh_token) {
        throw new Error('Нет токена YouTube — запусти auth-youtube.bat.');
      }
      return this.refresh();
    }
    const expiresAt = Number(google.expires_at) || 0;
    if (!force && expiresAt - 120000 > Date.now()) return google.access_token;
    return this.refresh();
  }

  async refresh() {
    if (this.refreshing) return this.refreshing;

    const google = this.store.google;
    if (!google || !google.refresh_token) {
      throw new Error('Нет refresh-токена YouTube — запусти auth-youtube.bat.');
    }

    this.refreshing = (async () => {
      const creds = this.credentials();
      const body = new URLSearchParams({
        client_id: creds.client_id,
        client_secret: creds.client_secret,
        refresh_token: google.refresh_token,
        grant_type: 'refresh_token'
      });

      try {
        const data = await requestJson(TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });
        const next = Object.assign({}, google, {
          access_token: data.access_token,
          expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
          scope: data.scope || google.scope,
          refreshed_at: new Date().toISOString()
        });
        if (data.refresh_token) next.refresh_token = data.refresh_token;
        this.store.setGoogle(next);
        this.lastError = '';
        this.log.info('Google-токен обновлён');
        return next.access_token;
      } catch (error) {
        this.lastError = error.message;
        if (/invalid_grant/i.test(error.message)) {
          this.log.error('Google-токен больше не действует. Запусти auth-youtube.bat.');
        } else {
          this.log.warn('Не удалось обновить Google-токен:', error.message);
        }
        throw error;
      }
    })();

    try {
      return await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }
}

module.exports = { GoogleAuth: GoogleAuth, TOKEN_URL: TOKEN_URL };
