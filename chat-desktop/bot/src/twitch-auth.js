'use strict';

// Twitch OAuth: device code flow (без client secret) + Helix-запросы.

const { requestJson, formBody } = require('./net');

const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const DEVICE_URL = 'https://id.twitch.tv/oauth2/device';
const SCOPES = [
  'chat:read',
  'chat:edit',
  // нужны для уведомлений о фоллоу через EventSub
  'moderator:read:followers',
  'channel:read:subscriptions',
  'bits:read'
];

function startDeviceFlow(clientId) {
  return requestJson(DEVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({ client_id: clientId, scopes: SCOPES.join(' ') })
  });
}

function pollDeviceToken(clientId, deviceCode) {
  return requestJson(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody({
      client_id: clientId,
      scopes: SCOPES.join(' '),
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })
  });
}

function refreshTwitchToken(clientId, refreshToken, clientSecret) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId
  });
  if (clientSecret) params.set('client_secret', clientSecret);
  return requestJson(TOKEN_URL + '?' + params.toString(), { method: 'POST' });
}

async function fetchCurrentUser(clientId, accessToken) {
  const data = await requestJson('https://api.twitch.tv/helix/users', {
    headers: {
      'Client-Id': clientId,
      Authorization: 'Bearer ' + accessToken
    }
  });
  return (data.data && data.data[0]) || null;
}

module.exports = {
  SCOPES: SCOPES,
  startDeviceFlow: startDeviceFlow,
  pollDeviceToken: pollDeviceToken,
  refreshTwitchToken: refreshTwitchToken,
  fetchCurrentUser: fetchCurrentUser
};
