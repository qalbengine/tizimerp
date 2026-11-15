const tg = window.Telegram && window.Telegram.WebApp;

// Telegram initData serverda tekshiriladi. Lokal sinov: VITE_DEV_USER=<telegram id> (server WEB_DEV=1 bo'lsa)
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (tg && tg.initData) headers.Authorization = 'tma ' + tg.initData;
  else if (import.meta.env.VITE_DEV_USER) headers['x-dev-user'] = import.meta.env.VITE_DEV_USER;
  const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Xato');
  return data;
}

export const post = (path, body) => api(path, { method: 'POST', body: body || {} });
