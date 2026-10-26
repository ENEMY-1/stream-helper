'use strict';

// Helix API: узнать, идёт ли стрим (для команды !uptime).

const { requestJson } = require('./net');

const CACHE_MS = 45000;

class TwitchApi {
  constructor(options) {
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret || '';
    this.store = options.store;
    this.log = options.log;
    this.cache = new Map();
  }

  async getStream(login) {
    const channel = String(login || '').toLowerCase();
    if (!channel) return { live: false, unknown: true };

    const cached = this.cache.get(channel);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

    const token = await this.store.twitchAccessToken(this.clientId, this.clientSecret);
    if (!token) return { live: false, unknown: true };

    try {
      const data = await requestJson(
        'https://api.twitch.tv/helix/streams?user_login=' + encodeURIComponent(channel),
        {
          headers: { 'Client-Id': this.clientId, Authorization: 'Bearer ' + token },
          timeoutMs: 8000
        }
      );
      const item = (data.data || [])[0] || null;
      const value = item
        ? {
          live: true,
          startedAt: item.started_at ? Date.parse(item.started_at) : null,
          title: item.title || '',
          viewers: item.viewer_count || 0,
          game: item.game_name || '',
          language: item.language || '',
          userName: item.user_name || '',
          thumbnail: item.thumbnail_url || ''
        }
        : { live: false };

      this.cache.set(channel, { at: Date.now(), value: value });
      return value;
    } catch (error) {
      this.log.debug('Helix streams:', error.message);
      return { live: false, unknown: true };
    }
  }
}

module.exports = { TwitchApi: TwitchApi };
