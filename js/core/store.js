// One API for both apps. Picks the backend automatically:
//   • server mode — when the site is served by server/server.js (all devices share data)
//   • demo mode   — GitHub Pages / any static host (data lives in this browser)
import { createService, AppError } from './service.js';
import { createLocalDb } from './local-db.js';
import { clone, b64 } from './util.js';

const ROOT = new URL('../../', import.meta.url);
export const siteUrl = (p = '') => new URL(p, ROOT).href;

export function resolveImg(src, w = 480, h = w) {
  if (!src) return '';
  if (src.startsWith('data:') || src.startsWith('blob:')) return src;
  if (src.includes('images.unsplash.com')) {
    try {
      const u = new URL(src);
      u.searchParams.set('w', String(w));
      u.searchParams.set('h', String(h));
      u.searchParams.set('fit', 'crop');
      u.searchParams.set('auto', 'format');
      u.searchParams.set('q', '72');
      return u.href;
    } catch { return src; }
  }
  if (/^https?:\/\//i.test(src)) return src;
  return siteUrl(src);
}

async function detectServer() {
  const q = new URLSearchParams(location.search);
  if (q.get('mode') === 'local') return false;
  if (/\.github\.io$/i.test(location.hostname) || location.protocol === 'file:') return false;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 2500);
    const r = await fetch(siteUrl('api/health'), { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!r.ok) return false;
    const j = await r.json();
    return j?.app === 'myfitness' ? j : false;
  } catch { return false; }
}

function emitter() {
  const map = new Map();
  return {
    on(type, fn) { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); return () => map.get(type)?.delete(fn); },
    emit(evt) {
      map.get(evt.type)?.forEach((f) => { try { f(evt); } catch (e) { console.error(e); } });
      map.get('*')?.forEach((f) => { try { f(evt); } catch (e) { console.error(e); } });
    },
  };
}

/** Send raw ESC/POS bytes to the MY FITNESS print bridge (server/print-bridge.js). */
export async function bridgePrint(bridgeUrl, bytes, target, key) {
  const url = String(bridgeUrl || 'http://127.0.0.1:9123').replace(/\/+$/, '') + '/print';
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'x-bridge-key': key } : {}) },
    body: JSON.stringify({ target, data: b64(bytes) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || `bridge HTTP ${r.status}`);
  return true;
}
export async function bridgeStatus(bridgeUrl, key, query = {}) {
  const qs = new URLSearchParams(query).toString();
  const url = String(bridgeUrl || 'http://127.0.0.1:9123').replace(/\/+$/, '') + '/status' + (qs ? '?' + qs : '');
  const r = await fetch(url, { headers: key ? { 'x-bridge-key': key } : {}, cache: 'no-store' });
  return r.json();
}

export async function createStore() {
  const health = await detectServer();
  return health ? serverStore(health) : localStore();
}

/* ======================= demo (browser) mode ======================= */
async function localStore() {
  const db = createLocalDb();
  const ev = emitter();
  const svc = createService({
    db,
    emit: (evt) => { db.broadcast({ kind: 'evt', evt }); ev.emit(evt); },
    subtle: globalThis.crypto?.subtle,
  });
  db.onMessage((m) => { if (m?.kind === 'evt') ev.emit(m.evt); });
  await svc._ensureSeed({ demo: true });
  await svc._refreshDemo().catch(() => {});

  const SKEY = 'mf.localSession';
  let user = null;
  try {
    const s = JSON.parse(localStorage.getItem(SKEY) || 'null');
    if (s && s.exp > Date.now()) user = await svc._userById(s.userId);
  } catch {}
  const save = () => {
    try {
      if (user) localStorage.setItem(SKEY, JSON.stringify({ userId: user.id, exp: Date.now() + 12 * 3600e3 }));
      else localStorage.removeItem(SKEY);
    } catch {}
  };

  const store = {
    mode: 'local',
    health: null,
    get user() { return user; },
    async call(method, args) {
      if (typeof svc[method] !== 'function' || method.startsWith('_')) throw new AppError('unknown_method', 404);
      const res = await svc[method]({ user }, args);
      return clone(res);
    },
    on: ev.on,
    async login(username, password) {
      user = await svc.login({}, { username, password });
      save();
      return user;
    },
    async logout() {
      try { await svc.logout({ user }); } catch {}
      user = null;
      save();
    },
    async upload(blob) {
      return new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    },
    img: resolveImg,
    async print(bytes, target, printer) { return bridgePrint(printer.bridgeUrl, bytes, target, printer.bridgeKey); },
    printerStatus: (printer, query) => bridgeStatus(printer.bridgeUrl, printer.bridgeKey, query),
    subscribeOrder(id, token, fn) {
      return ev.on('*', (e) => { if (e.order?.id === id) fn(e.order); });
    },
    releaseDue: () => svc.releaseDue(),
  };
  return store;
}

/* ======================= server mode ======================= */
// Live channel: Server-Sent Events on the Windows server, WebSocket on Cloudflare (same message format).
function liveSource(health, query) {
  if (!health?.ws) return new EventSource(siteUrl('api/events?' + query));
  const src = { onmessage: null, onopen: null, onerror: null, close() { closed = true; clearInterval(ping); ws?.close(); } };
  let ws = null, closed = false, ping = null, delay = 1000;
  const open = () => {
    if (closed) return;
    ws = new WebSocket(siteUrl('api/ws?' + query).replace(/^http/, 'ws'));
    ws.onopen = () => { delay = 1000; src.onopen?.(); clearInterval(ping); ping = setInterval(() => { try { ws.send('ping'); } catch {} }, 25000); };
    ws.onmessage = (m) => { if (m.data !== 'pong') src.onmessage?.({ data: m.data }); };
    ws.onclose = () => { clearInterval(ping); if (closed) return; src.onerror?.(); setTimeout(open, delay); delay = Math.min(delay * 2, 15000); };
  };
  open();
  return src;
}

function serverStore(health) {
  const ev = emitter();
  const AKEY = 'mf.auth';
  let auth = null;
  try { auth = JSON.parse(localStorage.getItem(AKEY) || 'null'); } catch {}
  let es = null;

  const persist = () => {
    try { auth ? localStorage.setItem(AKEY, JSON.stringify(auth)) : localStorage.removeItem(AKEY); } catch {}
  };
  async function call(method, args) {
    let r;
    try {
      r = await fetch(siteUrl('api/rpc'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(auth?.token ? { authorization: 'Bearer ' + auth.token } : {}) },
        body: JSON.stringify({ method, args }),
      });
    } catch { throw new AppError('network', 0); }
    const j = await r.json().catch(() => ({ ok: false, error: 'bad_response' }));
    if (!j.ok) {
      if (r.status === 401 && auth && method !== 'login') {
        auth = null; persist(); es?.close(); es = null;
        ev.emit({ type: 'auth.expired' });
      }
      throw new AppError(j.error || 'error', r.status, j.data);
    }
    return j.data;
  }
  function connect() {
    es?.close();
    if (!auth?.token) return;
    es = liveSource(health, 'token=' + encodeURIComponent(auth.token));
    es.onmessage = (m) => { try { ev.emit(JSON.parse(m.data)); } catch {} };
    es.onopen = () => ev.emit({ type: 'connection', online: true });
    es.onerror = () => ev.emit({ type: 'connection', online: false });
  }
  const store = {
    mode: 'server',
    health,
    get user() { return auth?.user || null; },
    call,
    on: ev.on,
    async login(username, password) {
      const res = await call('login', { username, password });
      auth = { token: res.token, user: res.user };
      persist();
      connect();
      return res.user;
    },
    async logout() {
      try { await call('logout'); } catch {}
      auth = null; persist(); es?.close(); es = null;
    },
    connect,
    async upload(blob) {
      const r = await fetch(siteUrl('api/upload'), { method: 'POST', headers: { authorization: 'Bearer ' + (auth?.token || ''), 'content-type': blob.type || 'image/webp' }, body: blob });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new AppError(j.error || 'upload_failed', r.status);
      return j.data.url;
    },
    img: resolveImg,
    async print(bytes, target, printer) {
      // in the cloud the printer is reached through the print bridge on the café PC
      if (health?.print === false) return bridgePrint(printer.bridgeUrl, bytes, target, printer.bridgeKey);
      // the server PC is on the gym network, so it talks to the printer itself
      const r = await fetch(siteUrl('api/print'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (auth?.token || '') },
        body: JSON.stringify({ target, data: b64(bytes) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || 'print failed');
      return true;
    },
    async printerStatus(printer, query = {}) {
      if (health?.print === false) return bridgeStatus(printer.bridgeUrl, printer.bridgeKey, query);
      const r = await fetch(siteUrl('api/printers?' + new URLSearchParams(query)), { headers: { authorization: 'Bearer ' + (auth?.token || '') }, cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || 'status failed');
      return j.data;
    },
    subscribeOrder(id, token, fn) {
      const src = liveSource(health, `order=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`);
      src.onmessage = (m) => { try { const e = JSON.parse(m.data); if (e.order) fn(e.order); } catch {} };
      return () => src.close();
    },
    releaseDue: async () => 0, // the server releases scheduled orders itself
  };
  if (auth?.token) connect();
  return store;
}
