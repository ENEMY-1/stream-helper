'use strict';

// HTTP-помощники поверх встроенного fetch (Node 22) + разбор ошибок API.

class HttpError extends Error {
  constructor(status, data, body) {
    const apiError = data && data.error;
    const detail = (apiError && (apiError.message || apiError.status))
      || (data && data.message)
      || (typeof body === 'string' ? body.slice(0, 300) : '');
    super('HTTP ' + status + (detail ? ': ' + detail : ''));
    this.name = 'HttpError';
    this.status = status;
    this.data = data;
    this.body = body;
  }
}

async function requestJson(url, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 20000;
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    const response = await fetch(url, {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.body,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (e) { data = text; }
    }
    if (!response.ok) throw new HttpError(response.status, data, text);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function formBody(params) {
  const search = new URLSearchParams();
  Object.keys(params).forEach(function (key) {
    const value = params[key];
    if (value !== undefined && value !== null) search.set(key, String(value));
  });
  return search.toString();
}

module.exports = {
  requestJson: requestJson,
  HttpError: HttpError,
  delay: delay,
  formBody: formBody
};
