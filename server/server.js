#!/usr/bin/env node
// MY FITNESS — ordering server. Zero dependencies: just install Node.js (18+) and run
//   node server/server.js            (or double-click start-server.bat on Windows)
// Every phone, the kitchen screen and the staff PCs then share live data, and the
// server sends tickets straight to the Xprinter XP-N200L (LAN or USB).
//
// Options (environment variables):  PORT=8080  HOST=0.0.0.0  DATA_DIR=./data  DEMO=1 (sample sales)
//   STAFF_PASSWORD=...  password for the starting staff accounts (admin, manager, cashier, kitchen) —
//   set it whenever the server is reachable from the internet; it also hides the one-tap demo logins.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { createService, AppError, PUBLIC_METHODS, publicOrder, can, VERSION } from '../js/core/service.js';
import { sendToPrinter, listPrinters, tcpCheck } from './printing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOADS = path.join(DATA, 'uploads');
const BACKUPS = path.join(DATA, 'backups');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const DEMO = process.env.DEMO === '1' || process.argv.includes('--demo');
const STAFF_PASSWORD = process.env.STAFF_PASSWORD || '';
const DEMO_LOGINS = DEMO && !STAFF_PASSWORD; // one-tap demo logins only for private/local demos
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
for (const d of [DATA, UPLOADS, BACKUPS]) fs.mkdirSync(d, { recursive: true });

/* ---------------- JSON-file database (atomic writes) ---------------- */
const KEYS = ['settings', 'categories', 'items', 'tables', 'users', 'orders', 'requests', 'logs', 'counter', 'meta', 'sessions'];
const mem = {};
for (const k of KEYS) {
  try { mem[k] = JSON.parse(fs.readFileSync(path.join(DATA, `${k}.json`), 'utf8')); } catch { mem[k] = undefined; }
}
const dirty = new Set();
let saveTimer = null;
let saving = Promise.resolve();
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saving = saving.then(flush).catch((e) => console.error('save failed', e)); }, 250); }
async function flush() {
  const keys = [...dirty];
  dirty.clear();
  for (const k of keys) {
    const file = path.join(DATA, `${k}.json`);
    await fsp.writeFile(file + '.tmp', JSON.stringify(mem[k] ?? null));
    await fsp.rename(file + '.tmp', file);
  }
}
function flushSync() {
  for (const k of dirty) {
    const file = path.join(DATA, `${k}.json`);
    fs.writeFileSync(file + '.tmp', JSON.stringify(mem[k] ?? null));
    fs.renameSync(file + '.tmp', file);
  }
  dirty.clear();
}
let queue = Promise.resolve();
const db = {
  read: async (k) => mem[k],
  tx(fn) {
    const run = queue.then(() => fn({ read: async (k) => mem[k], write: async (k, v) => { mem[k] = v; dirty.add(k); scheduleSave(); } }));
    queue = run.catch(() => {});
    return run;
  },
};

/* ---------------- live updates (Server-Sent Events) ---------------- */
const clients = new Set();
function broadcast(evt) {
  const staffMsg = `data: ${JSON.stringify(evt)}\n\n`;
  for (const c of clients) {
    try {
      if (c.user) c.res.write(staffMsg);
      else if (c.orderId && evt.order?.id === c.orderId && !evt.quiet) c.res.write(`data: ${JSON.stringify({ type: evt.type, order: publicOrder(evt.order, mem.settings) })}\n\n`);
    } catch {}
  }
}
setInterval(() => { for (const c of clients) { try { c.res.write(': ping\n\n'); } catch {} } }, 25000);

const svc = createService({ db, emit: broadcast, subtle: crypto.webcrypto.subtle });

/* ---------------- sessions & rate limits ---------------- */
mem.sessions = mem.sessions || {};
const SESSION_MS = 12 * 3600 * 1000;
function newSession(user) {
  const token = crypto.randomBytes(24).toString('base64url');
  mem.sessions[token] = { userId: user.id, exp: Date.now() + SESSION_MS };
  dirty.add('sessions'); scheduleSave();
  return token;
}
async function userFor(token) {
  const s = token && mem.sessions[token];
  if (!s || s.exp < Date.now()) return null;
  s.exp = Date.now() + SESSION_MS;
  return svc._userById(s.userId);
}
const bearer = (req) => { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : null; };
setInterval(() => {
  const now = Date.now();
  let n = 0;
  for (const [k, s] of Object.entries(mem.sessions)) if (s.exp < now) { delete mem.sessions[k]; n++; }
  if (n) { dirty.add('sessions'); scheduleSave(); }
}, 3600 * 1000);
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => hits.clear(), 15 * 60 * 1000);
const ipOf = (req) => (TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress || '?');

/* ---------------- helpers ---------------- */
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN' };
function send(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC, ...headers });
  res.end(body);
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('too_large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req, limit) => { const b = await readBody(req, limit); try { return JSON.parse(b.toString('utf8') || '{}'); } catch { throw Object.assign(new Error('bad_json'), { status: 400 }); } };
function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out.sort((a, b) => (a.startsWith('192.168.') ? -1 : 0) - (b.startsWith('192.168.') ? -1 : 0));
}

/* ---------------- API ---------------- */
async function handleRpc(req, res) {
  const body = await readJson(req, 30 * 1024 * 1024);
  const { method, args } = body || {};
  if (typeof method !== 'string' || method.startsWith('_') || typeof svc[method] !== 'function') return send(res, 404, { ok: false, error: 'unknown_method' });
  const ip = ipOf(req);
  const token = bearer(req);
  const user = await userFor(token);
  if (!PUBLIC_METHODS.has(method) && !user) return send(res, 401, { ok: false, error: 'auth_required' });
  if (method === 'placeOrder' && limited(`po:${ip}`, 8, 60000)) return send(res, 429, { ok: false, error: 'too_many_requests' });
  if (method === 'callStaff' && limited(`cs:${ip}`, 6, 60000)) return send(res, 429, { ok: false, error: 'too_many_requests' });
  if (method === 'trackOrder' && limited(`tr:${ip}`, 120, 60000)) return send(res, 429, { ok: false, error: 'too_many_requests' });
  try {
    if (method === 'login') {
      if (limited(`login:${ip}`, 10, 5 * 60000)) return send(res, 429, { ok: false, error: 'too_many_requests' });
      const u = await svc.login({}, args);
      return send(res, 200, { ok: true, data: { token: newSession(u), user: u } });
    }
    if (method === 'logout') {
      await svc.logout({ user }).catch(() => {});
      if (token && mem.sessions[token]) { delete mem.sessions[token]; dirty.add('sessions'); scheduleSave(); }
      return send(res, 200, { ok: true, data: true });
    }
    const data = await svc[method]({ user, ip }, args);
    send(res, 200, { ok: true, data });
  } catch (e) {
    if (e instanceof AppError) send(res, e.status || 400, { ok: false, error: e.code, data: e.data });
    else { console.error(`[rpc ${method}]`, e); send(res, 500, { ok: false, error: 'server_error' }); }
  }
}

async function handleEvents(req, res, url) {
  const orderId = url.searchParams.get('order');
  let client;
  if (orderId) {
    const o = (mem.orders || []).find((x) => x.id === orderId);
    if (!o || o.token !== url.searchParams.get('t')) return send(res, 404, { ok: false, error: 'not_found' });
    client = { res, orderId };
  } else {
    const user = await userFor(url.searchParams.get('token'));
    if (!user) return send(res, 401, { ok: false, error: 'auth_required' });
    client = { res, user };
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...SEC });
  res.write('retry: 3000\n: connected\n\n');
  clients.add(client);
  req.on('close', () => clients.delete(client));
}

const MAGIC = [[[0xff, 0xd8, 0xff], 'jpg'], [[0x89, 0x50, 0x4e, 0x47], 'png'], [[0x52, 0x49, 0x46, 0x46], 'webp']];
async function handleUpload(req, res) {
  const user = await userFor(bearer(req));
  if (!user) return send(res, 401, { ok: false, error: 'auth_required' });
  if (!can(user, 'menu.edit')) return send(res, 403, { ok: false, error: 'forbidden' });
  const buf = await readBody(req, 3 * 1024 * 1024);
  const kind = MAGIC.find(([sig]) => sig.every((b, i) => buf[i] === b));
  if (!kind || (kind[1] === 'webp' && buf.slice(8, 12).toString() !== 'WEBP')) return send(res, 415, { ok: false, error: 'unsupported_image' });
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}.${kind[1]}`;
  await fsp.writeFile(path.join(UPLOADS, name), buf);
  send(res, 200, { ok: true, data: { url: `uploads/${name}` } });
}

async function handlePrint(req, res) {
  const user = await userFor(bearer(req));
  if (!user) return send(res, 401, { ok: false, error: 'auth_required' });
  const { target, data } = await readJson(req, 8 * 1024 * 1024);
  try {
    await sendToPrinter(target, Buffer.from(String(data || ''), 'base64'));
    send(res, 200, { ok: true, data: true });
  } catch (e) {
    console.error('[print]', e.message);
    send(res, 502, { ok: false, error: e.message });
  }
}
async function handlePrinters(req, res, url) {
  const user = await userFor(bearer(req));
  if (!user) return send(res, 401, { ok: false, error: 'auth_required' });
  const host = url.searchParams.get('host');
  const [printers, reachable] = await Promise.all([listPrinters(), host ? tcpCheck(host, url.searchParams.get('port') || 9100) : Promise.resolve(undefined)]);
  send(res, 200, { ok: true, data: { ok: true, version: VERSION, platform: process.platform, printers, reachable } });
}

/* ---------------- static files ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};
const BLOCKED = /^\/(server|data|node_modules|_dev|docs\/private)(\/|$)|\/\.|\.(bat|json\.tmp|ps1)$/i;
async function serveStatic(req, res, url) {
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { return send(res, 400, { ok: false }); }
  if (BLOCKED.test(p) && !p.startsWith('/uploads/')) return send(res, 404, { ok: false, error: 'not_found' });
  let base = ROOT, rel = p;
  if (p.startsWith('/uploads/')) { base = UPLOADS; rel = p.slice('/uploads'.length); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(base, path.normalize(rel));
  if (!file.startsWith(base + path.sep) && file !== base) return send(res, 403, { ok: false });
  let st;
  try { st = await fsp.stat(file); } catch { return send(res, 404, { ok: false, error: 'not_found' }); }
  if (st.isDirectory()) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  const ext = path.extname(file).toLowerCase();
  const cache = base === UPLOADS ? 'public, max-age=31536000, immutable' : ext === '.html' ? 'no-cache' : 'public, max-age=120';
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, ...SEC });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ---------------- router ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { app: 'myfitness', mode: 'server', version: VERSION, time: Date.now(), demo: DEMO_LOGINS, ips: lanIPs(), port: PORT });
    if (url.pathname === '/api/rpc' && req.method === 'POST') return await handleRpc(req, res);
    if (url.pathname === '/api/events' && req.method === 'GET') return await handleEvents(req, res, url);
    if (url.pathname === '/api/upload' && req.method === 'POST') return await handleUpload(req, res);
    if (url.pathname === '/api/print' && req.method === 'POST') return await handlePrint(req, res);
    if (url.pathname === '/api/printers' && req.method === 'GET') return await handlePrinters(req, res, url);
    if (url.pathname.startsWith('/api/')) return send(res, 404, { ok: false, error: 'not_found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { ok: false });
    return await serveStatic(req, res, url);
  } catch (e) {
    if (!res.headersSent) send(res, e.status || 500, { ok: false, error: e.message === 'too_large' ? 'too_large' : 'server_error' });
    if (!e.status) console.error(e);
  }
});

/* ---------------- daily backup ---------------- */
async function backup() {
  const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const file = path.join(BACKUPS, `myfitness-${day}.json`);
  if (fs.existsSync(file)) return;
  const out = { app: 'myfitness', version: VERSION, exportedAt: Date.now() };
  for (const k of KEYS) if (k !== 'sessions') out[k] = mem[k];
  await fsp.writeFile(file, JSON.stringify(out));
  const old = (await fsp.readdir(BACKUPS)).filter((f) => f.endsWith('.json')).sort();
  for (const f of old.slice(0, Math.max(0, old.length - 30))) await fsp.unlink(path.join(BACKUPS, f)).catch(() => {});
}

/* ---------------- start ---------------- */
async function start() {
  const fresh = await svc._ensureSeed({ demo: false });
  if (fresh && STAFF_PASSWORD) {
    const sys = { user: { id: 'system', username: 'system', role: 'owner' } };
    try {
      for (const u of await svc.listUsers(sys)) await svc.saveUser(sys, { ...u, password: STAFF_PASSWORD });
    } catch (e) { console.error(`  STAFF_PASSWORD was not applied (${e.code || e.message}) — it needs at least 6 characters.`); }
  }
  if (fresh && DEMO) await svc._generateDemo({ days: 70 });
  setInterval(() => svc.releaseDue().catch((e) => console.error('release', e)), 15000);
  svc.releaseDue().catch(() => {});
  backup().catch(() => {});
  setInterval(() => backup().catch(() => {}), 6 * 3600e3);
  server.listen(PORT, HOST, () => {
    const ips = lanIPs();
    const lan = ips[0] ? `http://${ips[0]}:${PORT}/` : null;
    const line = '─'.repeat(64);
    console.log(`\n${line}\n  MY FITNESS ordering server v${VERSION} is running ${DEMO ? '(demo data)' : ''}\n${line}`);
    console.log(`  Staff panel (this PC):  http://localhost:${PORT}/admin/`);
    console.log(`  Kitchen screen:         http://localhost:${PORT}/admin/#/kitchen`);
    if (lan) console.log(`  Customer menu (Wi-Fi):  ${lan}   ← use this for the table QR codes`);
    ips.slice(1).forEach((ip) => console.log(`                          http://${ip}:${PORT}/`));
    if (fresh && STAFF_PASSWORD) console.log(`\n  First start: staff accounts admin · manager · cashier · kitchen use your STAFF_PASSWORD.`);
    else if (fresh) console.log(`\n  First start: default logins  admin / admin123  ·  cashier / cashier123  ·  kitchen / kitchen123\n  Change them in Staff → right away.`);
    console.log(`  Data folder: ${DATA}\n${line}\n`);
    if (process.argv.includes('--open')) {
      const u = `http://localhost:${PORT}/admin/`;
      const cmd = process.platform === 'win32' ? `start "" "${u}"` : process.platform === 'darwin' ? `open "${u}"` : `xdg-open "${u}"`;
      exec(cmd, () => {});
    }
  });
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { try { flushSync(); } catch {} process.exit(0); });
process.on('exit', () => { try { flushSync(); } catch {} });
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`\n  Port ${PORT} is already in use. Close the other program or run with another port, e.g.  set PORT=8090\n`);
  else console.error(e);
  process.exit(1);
});
start();
