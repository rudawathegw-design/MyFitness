// MY FITNESS on Cloudflare — the whole backend inside ONE Durable Object:
//   • storage: the Durable Object's SQLite (free plan), one row per order
//   • live updates: hibernating WebSockets (staff screens + customer order tracking)
//   • scheduled orders: a Durable Object alarm fires exactly when the next one is due
// It reuses js/core/service.js, so the business rules are identical to the Windows server.
import { createService, AppError, PUBLIC_METHODS, publicOrder, can, VERSION } from '../js/core/service.js';

const SESSION_MS = 12 * 3600 * 1000;
const MAGIC = [[[0xff, 0xd8, 0xff], 'jpg', 'image/jpeg'], [[0x89, 0x50, 0x4e, 0x47], 'png', 'image/png'], [[0x52, 0x49, 0x46, 0x46], 'webp', 'image/webp']];
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' };

const json = (status, obj, headers = {}) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC, ...headers } });
function wsResponse(client) {
  try { return new Response(null, { status: 101, webSocket: client }); } catch { return { status: 101, webSocket: client }; } // fallback only for local tests
}
function token(bytes = 24) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class CafeCore {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env || {};
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, created INTEGER NOT NULL, v TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS uploads (name TEXT PRIMARY KEY, type TEXT NOT NULL, data BLOB NOT NULL, at INTEGER NOT NULL)');
    this.cache = new Map();
    this.orderJson = new Map();
    this.hits = new Map();
    this.queue = Promise.resolve();
    this.demo = this.env.DEMO === '1';
    this.demoLogins = this.demo && !this.env.STAFF_PASSWORD;
    this.svc = createService({
      db: { read: async (k) => this.read(k), tx: (fn) => this.tx(fn) },
      emit: (e) => this.broadcast(e),
      subtle: crypto.subtle,
    });
    try { ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch {}
    this.ready = ctx.blockConcurrencyWhile(() => this.init());
  }

  /* ---------- storage (SQLite) ---------- */
  read(k) {
    if (this.cache.has(k)) return this.cache.get(k);
    let v;
    if (k === 'orders') {
      v = this.sql.exec('SELECT id, v FROM orders ORDER BY created').toArray().map((r) => { this.orderJson.set(r.id, r.v); return JSON.parse(r.v); });
    } else {
      const row = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0];
      v = row ? JSON.parse(row.v) : undefined;
    }
    this.cache.set(k, v);
    return v;
  }
  write(k, v) {
    if (k === 'orders') {
      if (!this.cache.has('orders')) this.read('orders');
      const seen = new Set();
      for (const o of v || []) { // only rows that really changed are written
        seen.add(o.id);
        const j = JSON.stringify(o);
        if (this.orderJson.get(o.id) !== j) {
          this.sql.exec('INSERT OR REPLACE INTO orders (id, created, v) VALUES (?, ?, ?)', o.id, o.createdAt || 0, j);
          this.orderJson.set(o.id, j);
        }
      }
      for (const id of [...this.orderJson.keys()]) if (!seen.has(id)) { this.sql.exec('DELETE FROM orders WHERE id = ?', id); this.orderJson.delete(id); }
    } else if (v === undefined || v === null) {
      this.sql.exec('DELETE FROM kv WHERE k = ?', k);
    } else {
      this.sql.exec('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)', k, JSON.stringify(v));
    }
    this.cache.set(k, v);
  }
  tx(fn) {
    const run = this.queue.then(() => fn({ read: async (k) => this.read(k), write: async (k, v) => this.write(k, v) }));
    this.queue = run.catch(() => {});
    return run;
  }

  async init() {
    const fresh = await this.svc._ensureSeed({ demo: false });
    if (this.env.STAFF_PASSWORD) { // replace any default password with yours
      const sys = { user: { id: 'system', username: 'system', role: 'owner' } };
      try {
        for (const u of await this.svc.listUsers(sys)) if (u.defaultPw) await this.svc.saveUser(sys, { ...u, password: this.env.STAFF_PASSWORD });
      } catch (e) { console.error('STAFF_PASSWORD not applied:', e.code || e.message); }
    }
    if (fresh && this.demo) await this.svc._generateDemo({ days: Math.min(60, Math.max(1, Number(this.env.DEMO_DAYS) || 21)) });
    await this.scheduleNext();
  }

  /* ---------- live updates ---------- */
  broadcast(evt) {
    let staffMsg = null, custMsg = null;
    for (const ws of this.ctx.getWebSockets()) {
      let att;
      try { att = ws.deserializeAttachment(); } catch { continue; }
      try {
        if (att?.kind === 'staff') ws.send(staffMsg || (staffMsg = JSON.stringify(evt)));
        else if (att?.kind === 'order' && evt.order?.id === att.orderId && !evt.quiet) {
          ws.send(custMsg || (custMsg = JSON.stringify({ type: evt.type, order: publicOrder(evt.order, this.read('settings')) })));
        }
      } catch {}
    }
  }
  async wsUpgrade(req, url) {
    if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return json(426, { ok: false, error: 'websocket_required' });
    let att;
    const orderId = url.searchParams.get('order');
    if (orderId) {
      const o = (this.read('orders') || []).find((x) => x.id === orderId);
      if (!o || o.token !== url.searchParams.get('t')) return json(404, { ok: false, error: 'not_found' });
      att = { kind: 'order', orderId };
    } else {
      const user = await this.userFor(url.searchParams.get('token'));
      if (!user) return json(401, { ok: false, error: 'auth_required' });
      att = { kind: 'staff', userId: user.id };
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(att);
    return wsResponse(client);
  }

  /* ---------- scheduled orders: wake up exactly when the next one is due ---------- */
  async scheduleNext() {
    const lead = (this.read('settings')?.ordering?.scheduleLeadMinutes ?? 15) * 60000;
    let next = Infinity;
    for (const o of this.read('orders') || []) if (o.status === 'scheduled') next = Math.min(next, o.scheduledFor - lead);
    if (next === Infinity) { await this.ctx.storage.deleteAlarm(); return; }
    const at = Math.max(Date.now() + 1000, next);
    if ((await this.ctx.storage.getAlarm()) !== at) await this.ctx.storage.setAlarm(at);
  }
  async alarm() {
    await this.ready;
    await this.svc.releaseDue();
    await this.scheduleNext();
  }

  /* ---------- sessions & limits ---------- */
  async userFor(tok) {
    const s = tok && (this.read('sessions') || {})[tok];
    if (!s || s.exp < Date.now()) return null;
    s.exp = Date.now() + SESSION_MS; // sliding expiry, kept in memory between logins
    return this.svc._userById(s.userId);
  }
  newSession(user) {
    const sessions = { ...(this.read('sessions') || {}) };
    const now = Date.now();
    for (const [k, s] of Object.entries(sessions)) if (s.exp < now) delete sessions[k];
    const tok = token();
    sessions[tok] = { userId: user.id, exp: now + SESSION_MS };
    this.write('sessions', sessions);
    return tok;
  }
  limited(key, max, windowMs) {
    const now = Date.now();
    const arr = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.hits.clear();
    return arr.length > max;
  }

  /* ---------- HTTP ---------- */
  async fetch(req) {
    await this.ready;
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/api/health') return json(200, { app: 'myfitness', mode: 'server', cloud: 'cloudflare', ws: true, print: false, version: VERSION, time: Date.now(), demo: this.demoLogins, ips: [], port: 443 });
      if (p === '/api/rpc' && req.method === 'POST') return await this.rpc(req);
      if (p === '/api/ws') return await this.wsUpgrade(req, url);
      if (p === '/api/upload' && req.method === 'POST') return await this.upload(req);
      if (p.startsWith('/uploads/') && (req.method === 'GET' || req.method === 'HEAD')) return this.serveUpload(decodeURIComponent(p.slice('/uploads/'.length)));
      if (p === '/api/print' || p === '/api/printers') return json(501, { ok: false, error: 'cloud_print' });
      return json(404, { ok: false, error: 'not_found' });
    } catch (e) {
      console.error(e);
      return json(e.status || 500, { ok: false, error: e.status ? e.message : 'server_error' });
    }
  }

  async rpc(req) {
    const text = await req.text();
    if (text.length > 25 * 1024 * 1024) return json(413, { ok: false, error: 'too_large' });
    let body;
    try { body = JSON.parse(text || '{}'); } catch { return json(400, { ok: false, error: 'bad_json' }); }
    const { method, args } = body || {};
    if (typeof method !== 'string' || method.startsWith('_') || typeof this.svc[method] !== 'function') return json(404, { ok: false, error: 'unknown_method' });
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    const auth = req.headers.get('Authorization') || '';
    const tok = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const user = await this.userFor(tok);
    if (!PUBLIC_METHODS.has(method) && !user) return json(401, { ok: false, error: 'auth_required' });
    if (method === 'placeOrder' && this.limited(`po:${ip}`, 8, 60000)) return json(429, { ok: false, error: 'too_many_requests' });
    if (method === 'callStaff' && this.limited(`cs:${ip}`, 6, 60000)) return json(429, { ok: false, error: 'too_many_requests' });
    if (method === 'trackOrder' && this.limited(`tr:${ip}`, 120, 60000)) return json(429, { ok: false, error: 'too_many_requests' });
    try {
      await this.svc.releaseDue(); // safety net in case an alarm was missed
      if (method === 'login') {
        if (this.limited(`login:${ip}`, 10, 5 * 60000)) return json(429, { ok: false, error: 'too_many_requests' });
        const u = await this.svc.login({}, args);
        return json(200, { ok: true, data: { token: this.newSession(u), user: u } });
      }
      if (method === 'logout') {
        await this.svc.logout({ user }).catch(() => {});
        const sessions = { ...(this.read('sessions') || {}) };
        if (tok && sessions[tok]) { delete sessions[tok]; this.write('sessions', sessions); }
        return json(200, { ok: true, data: true });
      }
      const data = await this.svc[method]({ user, ip }, args);
      await this.scheduleNext();
      return json(200, { ok: true, data });
    } catch (e) {
      if (e instanceof AppError) return json(e.status || 400, { ok: false, error: e.code, data: e.data });
      console.error(`[rpc ${method}]`, e);
      return json(500, { ok: false, error: 'server_error' });
    }
  }

  async upload(req) {
    const auth = req.headers.get('Authorization') || '';
    const user = await this.userFor(auth.startsWith('Bearer ') ? auth.slice(7) : null);
    if (!user) return json(401, { ok: false, error: 'auth_required' });
    if (!can(user, 'menu.edit')) return json(403, { ok: false, error: 'forbidden' });
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.length > 1.8 * 1024 * 1024) return json(413, { ok: false, error: 'image_too_large' });
    const kind = MAGIC.find(([sig]) => sig.every((b, i) => buf[i] === b));
    const isWebp = kind?.[1] === 'webp' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP';
    if (!kind || (kind[1] === 'webp' && !isWebp)) return json(415, { ok: false, error: 'unsupported_image' });
    const name = `${Date.now().toString(36)}-${token(6).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase()}.${kind[1]}`;
    this.sql.exec('INSERT INTO uploads (name, type, data, at) VALUES (?, ?, ?, ?)', name, kind[2], buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), Date.now());
    return json(200, { ok: true, data: { url: `uploads/${name}` } });
  }
  serveUpload(name) {
    if (!/^[\w.-]{1,80}$/.test(name)) return json(404, { ok: false, error: 'not_found' });
    const row = this.sql.exec('SELECT type, data FROM uploads WHERE name = ?', name).toArray()[0];
    if (!row) return json(404, { ok: false, error: 'not_found' });
    return new Response(row.data, { status: 200, headers: { 'Content-Type': row.type, 'Cache-Control': 'public, max-age=31536000, immutable', ...SEC } });
  }
}
