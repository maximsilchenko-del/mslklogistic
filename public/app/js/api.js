/* Tiny API client for the mslklogistic backend. */

import { getLang } from './i18n.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function buildQuery(params) {
  if (!params) return '';
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v));
  return parts.length ? '?' + parts.join('&') : '';
}

async function request(method, path, body, params) {
  const headers = { 'X-Lang': getLang() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path + buildQuery(params), {
    method,
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch (err) {
    data = null;
  }
  if (!res.ok || (data && data.ok === false)) {
    const message = (data && data.error) || 'Не удалось выполнить запрос';
    if (res.status === 401) window.dispatchEvent(new Event('auth:expired'));
    throw new ApiError(res.status, message);
  }
  return data || {};
}

export const api = {
  get: (path, params) => request('GET', path, undefined, params),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  del: (path) => request('DELETE', path),
};
