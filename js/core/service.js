// MY FITNESS — business logic. Runs unchanged in two places:
//   • in the browser (demo mode, data in IndexedDB), and
//   • inside server/server.js (real mode, data in JSON files, shared by all devices).
// Prices are always recomputed here from the menu — never trusted from the client.
import { uid, rid, slug, clamp, clone, dayKey, startOfDay, minuteOfDay, parseHM, bizTs, setTz, hourOf, normPhone, validPhone, addDays } from './util.js';
import { SEED_SETTINGS, SEED_CATEGORIES, SEED_ITEMS, SEED_TABLES, SEED_USERS, generateHistory, liveDemoOrders, buildRandomLine, randomCustomer } from './seed.js';

export const VERSION = '1.0.0';

export class AppError extends Error {
  constructor(code, status = 400, data) { super(code); this.code = code; this.status = status; this.data = data; }
}

/** Methods anyone (customers) may call without logging in. */
export const PUBLIC_METHODS = new Set(['menu', 'placeOrder', 'trackOrder', 'callStaff', 'login']);

export const ROLES = ['owner', 'manager', 'cashier', 'kitchen'];
export const PERMS = {
  'orders.view': ['owner', 'manager', 'cashier', 'kitchen'],
  'orders.update': ['owner', 'manager', 'cashier', 'kitchen'],
  'orders.pos': ['owner', 'manager', 'cashier'],
  'orders.cancel': ['owner', 'manager', 'cashier'],
  'orders.pay': ['owner', 'manager', 'cashier'],
  'menu.edit': ['owner', 'manager'],
  'menu.stock': ['owner', 'manager', 'cashier', 'kitchen'],
  'tables.edit': ['owner', 'manager'],
  'settings.edit': ['owner', 'manager'],
  'analytics.view': ['owner', 'manager'],
  'requests.update': ['owner', 'manager', 'cashier', 'kitchen'],
  'staff.manage': ['owner', 'manager'],
  'logs.view': ['owner', 'manager'],
  'data.manage': ['owner', 'manager'],
  'demo.simulate': ['owner', 'manager', 'cashier'],
};
export const can = (user, perm) => !!user && (PERMS[perm] || []).includes(user.role);

export const ACTIVE = ['new', 'preparing', 'ready'];
const FLOW = {
  scheduled: ['new', 'cancelled'],
  new: ['preparing', 'ready', 'completed', 'cancelled'],
  preparing: ['ready', 'new', 'completed', 'cancelled'],
  ready: ['completed', 'preparing', 'cancelled'],
  completed: ['ready'],
  cancelled: [],
};
const PAYMENTS = ['cash', 'card', 'fib', 'fastpay'];
const TAGS = ['popular', 'protein', 'veg', 'new', 'spicy'];
const REQ_TYPES = ['waiter', 'bill', 'water'];

/* ---------- opening hours & scheduling (shared with the UI) ---------- */
export function withinHours(s, ts) {
  const o = parseHM(s.hours?.open), c = parseHM(s.hours?.close), m = minuteOfDay(ts);
  if (o === c) return true;
  return o < c ? m >= o && m < c : m >= o || m < c;
}
export const isOpenNow = (s, ts = Date.now()) => !!s.ordering?.open && withinHours(s, ts);

/** Bookable slots: [{ day:'2026-10-06', slots:[ts…] }] */
export function scheduleSlots(s, t = Date.now()) {
  setTz(s.tzOffset ?? 180);
  const o = s.ordering || {};
  const step = Math.max(5, o.slotMinutes || 15);
  const earliest = t + (o.scheduleMinMinutes ?? 30) * 60000;
  const open = parseHM(s.hours?.open), close = parseHM(s.hours?.close);
  const end = close > open ? close : close + 1440;
  const seen = new Set();
  const out = [];
  const today = dayKey(t);
  for (let d = 0; d <= (o.scheduleMaxDays ?? 3); d++) {
    const day = addDays(today, d);
    const base = bizTs(day, '00:00');
    const slots = [];
    for (let m = open; m <= end - step; m += step) {
      const ts = base + m * 60000;
      if (ts >= earliest && !seen.has(ts)) { seen.add(ts); slots.push(ts); }
    }
    if (slots.length) out.push({ day, slots });
  }
  return out;
}

/* ---------- views ---------- */
export function publicSettings(s) {
  const { printer, ...rest } = s;
  return clone({ ...rest, printer: { logo: printer?.logo } });
}
export function publicOrder(o, s) {
  return {
    id: o.id, no: o.no, status: o.status, type: o.type, table: o.table, floor: o.floor,
    createdAt: o.createdAt, updatedAt: o.updatedAt, when: o.when, scheduledFor: o.scheduledFor,
    releasedAt: o.releasedAt, times: o.times,
    items: o.items.map((l) => ({ id: l.id, cat: l.cat, name: l.name, qty: l.qty, unit: l.unit, total: l.total, note: l.note, options: l.options.map((x) => ({ g: x.g, c: x.c, gn: x.gn, cn: x.cn, price: x.price })) })),
    subtotal: o.subtotal, service: o.service, tax: o.tax, total: o.total,
    payment: { method: o.payment.method, status: o.payment.status },
    customer: { name: o.customer?.name || '' }, note: o.note, lang: o.lang,
    prepMinutes: s?.ordering?.prepMinutes ?? 15,
  };
}
export const safeUser = (u) => u && ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active !== false, createdAt: u.createdAt, lastLogin: u.lastLogin || null, defaultPw: !!u.defaultPw });

/* ---------- pricing ---------- */
export function priceLines(menuItems, inputLines, relaxed = false) {
  if (!Array.isArray(inputLines) || !inputLines.length) throw new AppError('empty_order');
  if (inputLines.length > 40) throw new AppError('too_many_items');
  return inputLines.map((ln) => {
    const it = menuItems.find((x) => x.id === ln?.id);
    if (!it || it.hidden) throw new AppError('item_not_found', 400, { id: ln?.id });
    if (it.available === false && !relaxed) throw new AppError('item_unavailable', 409, { id: it.id, name: it.name });
    const qty = clamp(Math.floor(Number(ln.qty) || 1), 1, 50);
    const sel = ln.options && typeof ln.options === 'object' ? ln.options : {};
    const options = [];
    let unit = Number(it.price) || 0;
    for (const g of it.options || []) {
      const raw = sel[g.id];
      let ids = g.type === 'many' ? (Array.isArray(raw) ? raw : raw ? [raw] : []) : raw ? [Array.isArray(raw) ? raw[0] : raw] : [];
      ids = [...new Set(ids.map(String))].filter((cid) => g.choices.some((c) => c.id === cid));
      if (g.type === 'many' && g.max) ids = ids.slice(0, g.max);
      if (g.type === 'one' && g.required && !ids.length && g.choices[0]) ids = [g.choices[0].id];
      for (const cid of ids) {
        const c = g.choices.find((x) => x.id === cid);
        unit += Number(c.price) || 0;
        options.push({ g: g.id, c: c.id, gn: g.name, cn: c.name, price: Number(c.price) || 0 });
      }
    }
    return { id: it.id, cat: it.cat, name: it.name, qty, base: Number(it.price) || 0, unit, options, note: String(ln.note ?? '').trim().slice(0, 140), total: unit * qty };
  });
}
const roundIQD = (n) => Math.round(n / 250) * 250;

/* ---------- passwords (PBKDF2 via WebCrypto in both browser and Node) ---------- */
const enc = (s) => new TextEncoder().encode(String(s));
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
function weakHash(str) { // fallback only when WebCrypto is unavailable (insecure http demo)
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let r = 0; r < 500; r++) for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i) + r;
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

export function createService({ db, emit = () => {}, now = () => Date.now(), subtle = globalThis.crypto?.subtle } = {}) {
  const svc = {};
  const read = (k) => db.read(k);
  const tx = (fn) => db.tx(fn);

  async function hashPw(password, salt = rid(16)) {
    if (subtle) {
      const key = await subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveBits']);
      const bits = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc(salt), iterations: 100000 }, key, 256);
      return { algo: 'pbkdf2', salt, hash: hex(new Uint8Array(bits)) };
    }
    return { algo: 'weak', salt, hash: weakHash(salt + ':' + password) };
  }
  async function verifyPw(password, u) {
    if (!u?.hash) return false;
    if (u.algo === 'weak') return weakHash(u.salt + ':' + password) === u.hash;
    if (!subtle) return false;
    const h = await hashPw(password, u.salt);
    let diff = h.hash.length ^ u.hash.length;
    for (let i = 0; i < h.hash.length; i++) diff |= h.hash.charCodeAt(i) ^ u.hash.charCodeAt(i);
    return diff === 0;
  }
  async function makeUser({ username, name, role, password, defaultPw = false }) {
    return { id: uid('u'), username, name, role, active: true, createdAt: now(), defaultPw, ...(await hashPw(password)) };
  }

  async function settings() {
    const s = (await read('settings')) || SEED_SETTINGS;
    setTz(s.tzOffset ?? 180);
    return s;
  }
  function need(ctx, perm) {
    if (!ctx?.user) throw new AppError('auth_required', 401);
    if (perm && !can(ctx.user, perm)) throw new AppError('forbidden', 403);
  }
  async function log(w, ctx, action, ref, detail) {
    const logs = (await w.read('logs')) || [];
    logs.push({ id: uid('l'), at: now(), user: ctx?.user?.username || (ctx?.sim ? 'simulator' : 'customer'), role: ctx?.user?.role || null, action, ref: ref ?? null, detail: detail ?? null });
    if (logs.length > 4000) logs.splice(0, logs.length - 4000);
    await w.write('logs', logs);
  }

  /* ===== public ===== */
  svc.menu = async () => {
    const [s, cats, items, tables] = await Promise.all([settings(), read('categories'), read('items'), read('tables')]);
    return {
      settings: publicSettings(s),
      categories: (cats || []).filter((c) => c.active !== false).sort((a, b) => a.sort - b.sort),
      items: (items || []).filter((i) => !i.hidden).sort((a, b) => a.sort - b.sort),
      tables: (tables || []).filter((t) => t.active !== false).map(({ id, name, floor, zone }) => ({ id, name, floor, zone })),
      now: now(),
    };
  };

  svc.placeOrder = async (ctx = {}, input = {}) => {
    const s = await settings();
    const o = s.ordering;
    const isPos = !!ctx.pos;
    if (isPos) need(ctx, 'orders.pos');
    const relaxed = isPos || !!ctx.sim;
    const t = now();
    const when = input.when === 'later' ? 'later' : 'now';
    let scheduledFor = null;
    if (when === 'later') {
      if (!o.allowSchedule && !relaxed) throw new AppError('schedule_disabled');
      scheduledFor = Math.round(Number(input.scheduledFor));
      if (!Number.isFinite(scheduledFor)) throw new AppError('invalid_time');
      if (!relaxed) {
        if (scheduledFor < t + ((o.scheduleMinMinutes ?? 30) - 3) * 60000) throw new AppError('time_too_soon');
        if (scheduledFor > t + ((o.scheduleMaxDays ?? 3) + 1) * 86400000) throw new AppError('time_too_far');
        if (!withinHours(s, scheduledFor)) throw new AppError('outside_hours');
      }
    } else if (!relaxed && !isOpenNow(s, t)) throw new AppError('closed', 409);

    const name = String(input.customer?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const phone = normPhone(input.customer?.phone ?? '').slice(0, 15);
    if (!isPos) {
      if (o.requireName && name.length < 2) throw new AppError('invalid_name');
      if (o.requirePhone && !validPhone(phone)) throw new AppError('invalid_phone');
    }
    let type = input.type === 'pickup' ? 'pickup' : 'dinein';
    if (!relaxed && type === 'dinein' && !o.allowDineIn) type = 'pickup';
    if (!relaxed && type === 'pickup' && !o.allowPickup) throw new AppError('pickup_disabled');
    let table = null, floor = null;
    if (type === 'dinein') {
      const tb = ((await read('tables')) || []).find((x) => x.id === input.table && x.active !== false);
      if (tb) { table = tb.id; floor = tb.floor; } else if (!isPos) throw new AppError('invalid_table');
      else type = 'pickup';
    }
    const allowedPay = isPos ? PAYMENTS : (o.payments || ['cash']);
    const method = allowedPay.includes(input.payment) ? input.payment : allowedPay[0] || 'cash';
    const lines = priceLines((await read('items')) || [], input.items, isPos);
    const subtotal = lines.reduce((a, l) => a + l.total, 0);
    const service = roundIQD((subtotal * (s.charges?.servicePct || 0)) / 100);
    const tax = roundIQD((subtotal * (s.charges?.taxPct || 0)) / 100);
    const lead = (o.scheduleLeadMinutes ?? 15) * 60000;
    const status = when === 'later' && scheduledFor - lead > t ? 'scheduled' : 'new';
    const paidNow = isPos && !!input.paid;

    const order = await tx(async (w) => {
      const orders = (await w.read('orders')) || [];
      const counter = (await w.read('counter')) || { day: '', no: 0 };
      const dk = dayKey(t);
      if (counter.day !== dk) { counter.day = dk; counter.no = 0; }
      counter.no += 1;
      const ord = {
        id: 'o' + t.toString(36) + rid(5), token: rid(18), no: counter.no, day: dk,
        createdAt: t, updatedAt: t, status, type, table, floor,
        customer: { name, phone }, when, scheduledFor, releasedAt: status === 'new' ? t : null,
        items: lines, subtotal, service, tax, total: subtotal + service + tax,
        payment: { method, status: paidNow ? 'paid' : 'unpaid', at: paidNow ? t : null },
        note: String(input.note ?? '').trim().slice(0, 240),
        lang: ['en', 'ckb', 'ar'].includes(input.lang) ? input.lang : 'ckb',
        source: isPos ? 'pos' : 'qr', staff: isPos ? ctx.user.username : null,
        printed: {}, times: { placed: t, ...(status === 'new' ? { new: t } : {}) },
      };
      orders.push(ord);
      await w.write('orders', orders);
      await w.write('counter', counter);
      if (isPos) await log(w, ctx, 'order.pos', ord.id, `#${ord.no} · ${ord.total}`);
      return ord;
    });
    emit({ type: 'order.created', order });
    return isPos || ctx.sim ? order : { order: publicOrder(order, s), token: order.token };
  };

  svc.trackOrder = async (ctx, { id, token } = {}) => {
    const s = await settings();
    const o = ((await read('orders')) || []).find((x) => x.id === id);
    if (!o || !token || o.token !== token) throw new AppError('not_found', 404);
    return publicOrder(o, s);
  };

  svc.callStaff = async (ctx, { table, type, orderId } = {}) => {
    if (!REQ_TYPES.includes(type)) throw new AppError('invalid_request');
    const tb = ((await read('tables')) || []).find((x) => x.id === table && x.active !== false);
    if (!tb) throw new AppError('invalid_table');
    const t = now();
    const req = await tx(async (w) => {
      const reqs = (await w.read('requests')) || [];
      const dup = reqs.find((r) => r.status === 'open' && r.table === tb.id && r.type === type && t - r.at < 120000);
      if (dup) return { ...dup, dup: true };
      const r = { id: uid('r'), table: tb.id, floor: tb.floor, type, orderId: orderId || null, at: t, status: 'open' };
      reqs.push(r);
      if (reqs.length > 500) reqs.splice(0, reqs.length - 500);
      await w.write('requests', reqs);
      return r;
    });
    if (!req.dup) emit({ type: 'request.created', request: req });
    return { id: req.id, at: req.at };
  };

  /** Moves scheduled orders into the kitchen queue when their time comes. */
  svc.releaseDue = async () => {
    const s = await settings();
    const lead = (s.ordering?.scheduleLeadMinutes ?? 15) * 60000;
    const t = now();
    const quick = ((await read('orders')) || []).some((o) => o.status === 'scheduled' && o.scheduledFor - lead <= t);
    if (!quick) return 0;
    const released = await tx(async (w) => {
      const orders = (await w.read('orders')) || [];
      const due = orders.filter((o) => o.status === 'scheduled' && o.scheduledFor - lead <= t);
      for (const o of due) { o.status = 'new'; o.releasedAt = t; o.updatedAt = t; o.times = { ...o.times, new: t }; }
      if (due.length) await w.write('orders', orders);
      return due;
    });
    released.forEach((order) => emit({ type: 'order.released', order }));
    return released.length;
  };

  /* ===== auth ===== */
  svc.login = async (ctx, { username, password } = {}) => {
    const users = (await read('users')) || [];
    const u = users.find((x) => x.username.toLowerCase() === String(username || '').trim().toLowerCase());
    if (!u || u.active === false || !(await verifyPw(String(password || ''), u))) throw new AppError('bad_login', 401);
    await tx(async (w) => {
      const us = (await w.read('users')) || [];
      const x = us.find((y) => y.id === u.id);
      if (x) x.lastLogin = now();
      await w.write('users', us);
      await log(w, { user: u }, 'auth.login', u.id, u.name);
    });
    return safeUser(u);
  };
  svc._userById = async (id) => {
    const u = ((await read('users')) || []).find((x) => x.id === id && x.active !== false);
    return u ? safeUser(u) : null;
  };
  svc.logout = async (ctx) => {
    if (!ctx?.user) return true;
    await tx((w) => log(w, ctx, 'auth.logout', ctx.user.id));
    return true;
  };
  svc.changePassword = async (ctx, { current, next } = {}) => {
    need(ctx);
    if (String(next || '').length < 6) throw new AppError('password_short');
    await tx(async (w) => {
      const us = await w.read('users');
      const u = us.find((x) => x.id === ctx.user.id);
      if (!u || !(await verifyPw(String(current || ''), u))) throw new AppError('bad_password', 400);
      Object.assign(u, await hashPw(String(next)), { defaultPw: false });
      await w.write('users', us);
      await log(w, ctx, 'auth.password', u.id);
    });
    return true;
  };

  /* ===== staff: orders ===== */
  svc.bootstrap = async (ctx) => {
    need(ctx, 'orders.view');
    const [s, cats, items, tables, users, reqs, orders, meta] = await Promise.all([
      settings(), read('categories'), read('items'), read('tables'), read('users'), read('requests'), read('orders'), read('meta'),
    ]);
    const since = startOfDay(now()) - 86400000;
    return {
      settings: s, categories: cats || [], items: items || [], tables: tables || [],
      users: can(ctx.user, 'staff.manage') ? (users || []).map(safeUser) : [],
      requests: (reqs || []).filter((r) => r.status === 'open' || r.at >= since),
      orders: (orders || []).filter((o) => o.createdAt >= since || o.status === 'scheduled' || ACTIVE.includes(o.status)),
      me: ctx.user, meta: meta || {}, now: now(), version: VERSION,
    };
  };

  svc.listOrders = async (ctx, { from = 0, to = Infinity } = {}) => {
    need(ctx, 'orders.view');
    return ((await read('orders')) || []).filter((o) => o.createdAt >= from && o.createdAt < to);
  };

  svc.updateOrder = async (ctx, { id, status, paid, method, reason } = {}) => {
    need(ctx, 'orders.update');
    const t = now();
    const order = await tx(async (w) => {
      const orders = (await w.read('orders')) || [];
      const o = orders.find((x) => x.id === id);
      if (!o) throw new AppError('not_found', 404);
      const changes = [];
      if (status && status !== o.status) {
        if (status === 'cancelled') need(ctx, 'orders.cancel');
        if (!(FLOW[o.status] || []).includes(status)) throw new AppError('bad_transition', 409);
        o.status = status;
        o.times = { ...o.times, [status]: t };
        if (status === 'new' && !o.releasedAt) o.releasedAt = t;
        if (status === 'cancelled') o.cancelReason = String(reason || '').slice(0, 140);
        changes.push(status);
      }
      if (typeof paid === 'boolean') {
        need(ctx, 'orders.pay');
        o.payment = { ...o.payment, status: paid ? 'paid' : 'unpaid', at: paid ? t : null, method: PAYMENTS.includes(method) ? method : o.payment.method };
        changes.push(paid ? 'paid' : 'unpaid');
      }
      if (!changes.length) return o;
      o.updatedAt = t;
      await w.write('orders', orders);
      await log(w, ctx, 'order.update', o.id, `#${o.no} → ${changes.join(', ')}${reason ? ` (${String(reason).slice(0, 60)})` : ''}`);
      return o;
    });
    emit({ type: 'order.updated', order });
    return order;
  };

  svc.markPrinted = async (ctx, { id, kind = 'kitchen' } = {}) => {
    need(ctx, 'orders.view');
    const order = await tx(async (w) => {
      const orders = (await w.read('orders')) || [];
      const o = orders.find((x) => x.id === id);
      if (!o) throw new AppError('not_found', 404);
      o.printed = { ...o.printed, [kind === 'receipt' ? 'receipt' : 'kitchen']: now() };
      await w.write('orders', orders);
      return o;
    });
    emit({ type: 'order.updated', order, quiet: true });
    return order.printed;
  };

  svc.posOrder = (ctx, input) => svc.placeOrder({ ...ctx, pos: true }, input);

  svc.simulateOrder = async (ctx) => {
    need(ctx, 'demo.simulate');
    const [s, items, tables] = await Promise.all([settings(), read('items'), read('tables')]);
    const rnd = Math.random;
    const h = hourOf(now());
    const lines = [buildRandomLine(rnd, items, h)];
    if (rnd() < 0.5) lines.push(buildRandomLine(rnd, items, h));
    const pool = tables.filter((x) => x.active !== false && (rnd() < 0.12 ? x.floor === 'men' : x.floor === 'ladies'));
    const dine = rnd() < 0.8 && pool.length;
    const sched = s.ordering.allowSchedule && rnd() < 0.15;
    const at = Math.ceil((now() + (60 + Math.floor(rnd() * 120)) * 60000) / 900000) * 900000;
    const notes = ['', '', 'Less sugar please', 'No onion', '', 'Extra sauce on the side', ''];
    return svc.placeOrder({ sim: true }, {
      items: lines, customer: randomCustomer(rnd), type: dine ? 'dinein' : 'pickup',
      table: dine ? pool[Math.floor(rnd() * pool.length)].id : null,
      when: sched ? 'later' : 'now', scheduledFor: sched ? at : null,
      payment: rnd() < 0.7 ? 'cash' : 'card', note: notes[Math.floor(rnd() * notes.length)],
      lang: rnd() < 0.6 ? 'ckb' : rnd() < 0.5 ? 'ar' : 'en',
    });
  };

  /* ===== staff: menu ===== */
  function tri(o, n) {
    const str = (v) => String(v ?? '').trim().slice(0, n);
    return { en: str(o?.en), ckb: str(o?.ckb), ar: str(o?.ar) };
  }
  const int = (v, a, b) => clamp(Math.round(Number(v) || 0), a, b);
  function sanitizeItem(it, cats) {
    const name = tri(it.name, 60);
    if (!name.en && !name.ckb && !name.ar) throw new AppError('name_required');
    if (!cats.some((c) => c.id === it.cat)) throw new AppError('invalid_category');
    let img = String(it.img || '');
    if (img && !(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(img) || /^https:\/\/[^\s"'<>]+$/.test(img) || /^uploads\/[\w.-]+$/.test(img))) img = '';
    if (img.length > 3_000_000) throw new AppError('image_too_large');
    const usedG = new Set();
    const options = (Array.isArray(it.options) ? it.options : []).slice(0, 8).map((g, gi) => {
      let gid = slug(g.id || g.name?.en || `group-${gi}`).slice(0, 24) || `g${gi}`;
      while (usedG.has(gid)) gid += '-' + gi;
      usedG.add(gid);
      const usedC = new Set();
      const choices = (Array.isArray(g.choices) ? g.choices : []).slice(0, 12).map((c, ci) => {
        let cid = slug(c.id || c.name?.en || `choice-${ci}`).slice(0, 24) || `c${ci}`;
        while (usedC.has(cid)) cid += '-' + ci;
        usedC.add(cid);
        return { id: cid, name: tri(c.name, 50), price: int(c.price, 0, 1_000_000) };
      }).filter((c) => c.name.en || c.name.ckb || c.name.ar);
      const many = g.type === 'many';
      return { id: gid, type: many ? 'many' : 'one', required: many ? false : !!g.required, ...(many ? { max: int(g.max || choices.length || 1, 1, 12) } : {}), name: tri(g.name, 40), choices };
    }).filter((g) => g.choices.length);
    return {
      id: String(it.id || ''), cat: it.cat, name, desc: tri(it.desc, 300), price: int(it.price, 0, 10_000_000), img,
      kcal: int(it.kcal, 0, 5000), protein: int(it.protein, 0, 500), carbs: int(it.carbs, 0, 1000), fat: int(it.fat, 0, 500),
      tags: (Array.isArray(it.tags) ? it.tags : []).filter((x) => TAGS.includes(x)),
      options, available: it.available !== false, featured: !!it.featured, hidden: !!it.hidden,
    };
  }
  svc.saveItem = async (ctx, item = {}) => {
    need(ctx, 'menu.edit');
    const cats = (await read('categories')) || [];
    const clean = sanitizeItem(item, cats);
    const saved = await tx(async (w) => {
      const items = (await w.read('items')) || [];
      let i = clean.id ? items.findIndex((x) => x.id === clean.id) : -1;
      if (i >= 0) {
        items[i] = { ...items[i], ...clean, updatedAt: now() };
      } else {
        let id = slug(clean.name.en || clean.name.ckb || 'item');
        if (!/[a-z0-9]/.test(id)) id = 'item';
        while (items.some((x) => x.id === id)) id = `${id}-${rid(3)}`;
        clean.id = id;
        clean.sort = Math.max(0, ...items.filter((x) => x.cat === clean.cat).map((x) => x.sort || 0)) + 1;
        items.push({ ...clean, createdAt: now() });
        i = items.length - 1;
      }
      await w.write('items', items);
      await log(w, ctx, item.id ? 'item.update' : 'item.create', items[i].id, items[i].name.en || items[i].name.ckb);
      return items[i];
    });
    emit({ type: 'menu.updated' });
    return saved;
  };
  svc.deleteItem = async (ctx, { id } = {}) => {
    need(ctx, 'menu.edit');
    await tx(async (w) => {
      const items = (await w.read('items')) || [];
      const it = items.find((x) => x.id === id);
      if (!it) throw new AppError('not_found', 404);
      await w.write('items', items.filter((x) => x.id !== id));
      await log(w, ctx, 'item.delete', id, it.name.en);
    });
    emit({ type: 'menu.updated' });
    return true;
  };
  svc.setAvailability = async (ctx, { id, available } = {}) => {
    need(ctx, 'menu.stock');
    const it = await tx(async (w) => {
      const items = (await w.read('items')) || [];
      const x = items.find((y) => y.id === id);
      if (!x) throw new AppError('not_found', 404);
      x.available = !!available;
      await w.write('items', items);
      await log(w, ctx, available ? 'item.instock' : 'item.soldout', id, x.name.en);
      return x;
    });
    emit({ type: 'menu.updated' });
    return it;
  };
  svc.saveCategory = async (ctx, cat = {}) => {
    need(ctx, 'menu.edit');
    const clean = { id: String(cat.id || ''), name: tri(cat.name, 40), tagline: tri(cat.tagline, 60), icon: ['bowl', 'shake', 'coffee', 'pizza', 'utensils', 'leaf', 'flame', 'star', 'sparkles', 'dumbbell'].includes(cat.icon) ? cat.icon : 'utensils', active: cat.active !== false };
    if (!clean.name.en && !clean.name.ckb && !clean.name.ar) throw new AppError('name_required');
    const saved = await tx(async (w) => {
      const cats = (await w.read('categories')) || [];
      let i = clean.id ? cats.findIndex((c) => c.id === clean.id) : -1;
      if (i >= 0) cats[i] = { ...cats[i], ...clean };
      else {
        let id = slug(clean.name.en || 'category');
        while (cats.some((c) => c.id === id)) id = `${id}-${rid(3)}`;
        cats.push({ ...clean, id, sort: cats.length + 1 });
        i = cats.length - 1;
      }
      await w.write('categories', cats);
      await log(w, ctx, cat.id ? 'category.update' : 'category.create', cats[i].id, cats[i].name.en);
      return cats[i];
    });
    emit({ type: 'menu.updated' });
    return saved;
  };
  svc.deleteCategory = async (ctx, { id } = {}) => {
    need(ctx, 'menu.edit');
    await tx(async (w) => {
      const items = (await w.read('items')) || [];
      if (items.some((x) => x.cat === id)) throw new AppError('category_not_empty', 409);
      const cats = (await w.read('categories')) || [];
      await w.write('categories', cats.filter((c) => c.id !== id));
      await log(w, ctx, 'category.delete', id);
    });
    emit({ type: 'menu.updated' });
    return true;
  };
  svc.reorder = async (ctx, { kind, ids } = {}) => {
    need(ctx, 'menu.edit');
    const key = kind === 'categories' ? 'categories' : 'items';
    await tx(async (w) => {
      const list = (await w.read(key)) || [];
      (ids || []).forEach((id, i) => { const x = list.find((y) => y.id === id); if (x) x.sort = i + 1; });
      await w.write(key, list);
    });
    emit({ type: 'menu.updated' });
    return true;
  };

  /* ===== staff: tables ===== */
  svc.saveTable = async (ctx, tb = {}) => {
    need(ctx, 'tables.edit');
    const name = String(tb.name || '').trim().replace(/[^\w؀-ۿ -]/g, '').slice(0, 12);
    if (!name) throw new AppError('name_required');
    const clean = { name, floor: tb.floor === 'men' ? 'men' : 'ladies', zone: String(tb.zone || '').slice(0, 30), seats: int(tb.seats || 4, 1, 30), active: tb.active !== false };
    const saved = await tx(async (w) => {
      const tables = (await w.read('tables')) || [];
      let i = tb.id ? tables.findIndex((x) => x.id === tb.id) : -1;
      if (i >= 0) tables[i] = { ...tables[i], ...clean };
      else {
        let id = name.replace(/\s+/g, '').toUpperCase().replace(/[^\w]/g, '') || 'T' + rid(3);
        while (tables.some((x) => x.id === id)) id = `${id}-${rid(2)}`;
        tables.push({ id, ...clean });
        i = tables.length - 1;
      }
      await w.write('tables', tables);
      await log(w, ctx, tb.id ? 'table.update' : 'table.create', tables[i].id, name);
      return tables[i];
    });
    emit({ type: 'tables.updated' });
    return saved;
  };
  svc.deleteTable = async (ctx, { id } = {}) => {
    need(ctx, 'tables.edit');
    await tx(async (w) => {
      const tables = (await w.read('tables')) || [];
      await w.write('tables', tables.filter((x) => x.id !== id));
      await log(w, ctx, 'table.delete', id);
    });
    emit({ type: 'tables.updated' });
    return true;
  };

  /* ===== staff: settings ===== */
  function mergeByTemplate(tpl, cur, patch) {
    const out = { ...cur };
    for (const k of Object.keys(tpl)) {
      if (!(k in patch)) continue;
      const tv = tpl[k], pv = patch[k];
      if (Array.isArray(tv)) out[k] = (Array.isArray(pv) ? pv : []).map(String).slice(0, 20);
      else if (tv && typeof tv === 'object') out[k] = mergeByTemplate(tv, cur?.[k] || {}, pv || {});
      else if (typeof tv === 'number') out[k] = Number.isFinite(+pv) ? +pv : cur?.[k] ?? tv;
      else if (typeof tv === 'boolean') out[k] = !!pv;
      else out[k] = String(pv ?? '').slice(0, 400);
    }
    return out;
  }
  svc.saveSettings = async (ctx, patch = {}) => {
    need(ctx, 'settings.edit');
    const s = await tx(async (w) => {
      const cur = (await w.read('settings')) || clone(SEED_SETTINGS);
      const next = mergeByTemplate(SEED_SETTINGS, cur, patch);
      next.ordering.payments = (next.ordering.payments || []).filter((p) => PAYMENTS.includes(p));
      if (!next.ordering.payments.length) next.ordering.payments = ['cash'];
      next.ordering.scheduleLeadMinutes = clamp(next.ordering.scheduleLeadMinutes, 0, 240);
      next.ordering.scheduleMinMinutes = clamp(next.ordering.scheduleMinMinutes, 5, 1440);
      next.ordering.scheduleMaxDays = clamp(next.ordering.scheduleMaxDays, 0, 14);
      next.ordering.slotMinutes = clamp(next.ordering.slotMinutes, 5, 120);
      next.ordering.prepMinutes = clamp(next.ordering.prepMinutes, 1, 180);
      next.charges.servicePct = clamp(next.charges.servicePct, 0, 50);
      next.charges.taxPct = clamp(next.charges.taxPct, 0, 50);
      next.printer.port = clamp(next.printer.port, 1, 65535);
      next.printer.kitchenCopies = clamp(next.printer.kitchenCopies, 0, 5);
      next.printer.receiptCopies = clamp(next.printer.receiptCopies, 0, 5);
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.hours.open)) next.hours.open = cur.hours.open;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(next.hours.close)) next.hours.close = cur.hours.close;
      if (next.publicUrl && !/^https?:\/\/[^\s"'<>]+$/.test(next.publicUrl)) next.publicUrl = '';
      await w.write('settings', next);
      const changed = Object.keys(patch).join(', ');
      await log(w, ctx, 'settings.update', null, changed);
      return next;
    });
    emit({ type: 'settings.updated', settings: publicSettings(s) });
    return s;
  };

  /* ===== staff: users ===== */
  svc.saveUser = async (ctx, u = {}) => {
    need(ctx, 'staff.manage');
    const username = String(u.username || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,20}$/.test(username)) throw new AppError('invalid_username');
    if (!ROLES.includes(u.role)) throw new AppError('invalid_role');
    const pw = String(u.password || '');
    if (pw && pw.length < 6) throw new AppError('password_short');
    const saved = await tx(async (w) => {
      const users = (await w.read('users')) || [];
      if (users.some((x) => x.username === username && x.id !== u.id)) throw new AppError('username_taken', 409);
      let x = u.id ? users.find((y) => y.id === u.id) : null;
      if (x) {
        const demotingLastOwner = x.role === 'owner' && (u.role !== 'owner' || u.active === false) && users.filter((y) => y.role === 'owner' && y.active !== false).length <= 1;
        if (demotingLastOwner) throw new AppError('last_owner', 409);
        Object.assign(x, { username, name: String(u.name || username).slice(0, 40), role: u.role, active: u.active !== false });
        if (pw) Object.assign(x, await hashPw(pw), { defaultPw: false });
      } else {
        if (!pw) throw new AppError('password_short');
        x = await makeUser({ username, name: String(u.name || username).slice(0, 40), role: u.role, password: pw });
        users.push(x);
      }
      await w.write('users', users);
      await log(w, ctx, u.id ? 'user.update' : 'user.create', x.id, `${username} (${u.role})`);
      return safeUser(x);
    });
    emit({ type: 'users.updated' });
    return saved;
  };
  svc.deleteUser = async (ctx, { id } = {}) => {
    need(ctx, 'staff.manage');
    if (id === ctx.user.id) throw new AppError('cannot_delete_self', 409);
    await tx(async (w) => {
      const users = (await w.read('users')) || [];
      const x = users.find((y) => y.id === id);
      if (!x) throw new AppError('not_found', 404);
      if (x.role === 'owner' && users.filter((y) => y.role === 'owner').length <= 1) throw new AppError('last_owner', 409);
      await w.write('users', users.filter((y) => y.id !== id));
      await log(w, ctx, 'user.delete', id, x.username);
    });
    emit({ type: 'users.updated' });
    return true;
  };
  svc.listUsers = async (ctx) => {
    need(ctx, 'staff.manage');
    return ((await read('users')) || []).map(safeUser);
  };

  /* ===== staff: service calls & logs ===== */
  svc.resolveRequest = async (ctx, { id } = {}) => {
    need(ctx, 'requests.update');
    const r = await tx(async (w) => {
      const reqs = (await w.read('requests')) || [];
      const x = reqs.find((y) => y.id === id);
      if (!x) throw new AppError('not_found', 404);
      x.status = 'done'; x.doneAt = now(); x.doneBy = ctx.user.username;
      await w.write('requests', reqs);
      await log(w, ctx, 'request.done', id, `${x.table} · ${x.type}`);
      return x;
    });
    emit({ type: 'request.updated', request: r });
    return r;
  };
  svc.listLogs = async (ctx, { limit = 1000 } = {}) => {
    need(ctx, 'logs.view');
    return ((await read('logs')) || []).slice(-clamp(limit, 1, 4000)).reverse();
  };

  /* ===== data management ===== */
  const KEYS = ['settings', 'categories', 'items', 'tables', 'users', 'orders', 'requests', 'logs', 'counter', 'meta'];
  svc.exportData = async (ctx) => {
    need(ctx, 'data.manage');
    const out = { app: 'myfitness', version: VERSION, exportedAt: now() };
    for (const k of KEYS) out[k] = await read(k);
    return out;
  };
  svc.importData = async (ctx, data = {}) => {
    need(ctx, 'data.manage');
    if (data?.app !== 'myfitness' || !Array.isArray(data.items) || !Array.isArray(data.users)) throw new AppError('invalid_backup');
    if (!data.users.some((u) => u.role === 'owner')) throw new AppError('invalid_backup');
    await tx(async (w) => {
      for (const k of KEYS) if (data[k] !== undefined) await w.write(k, data[k]);
      await log(w, ctx, 'data.import', null, `${(data.orders || []).length} orders`);
    });
    emit({ type: 'data.reset' });
    return true;
  };
  svc.clearOrders = async (ctx) => {
    need(ctx, 'data.manage');
    await tx(async (w) => {
      await w.write('orders', []);
      await w.write('requests', []);
      await w.write('counter', { day: '', no: 0 });
      const meta = (await w.read('meta')) || {};
      meta.autoRefresh = false;
      await w.write('meta', meta);
      await log(w, ctx, 'data.clearOrders');
    });
    emit({ type: 'data.reset' });
    return true;
  };
  svc.generateDemo = async (ctx, { days = 70 } = {}) => {
    need(ctx, 'data.manage');
    const r = await svc._generateDemo({ days: clamp(days, 1, 120) });
    await tx((w) => log(w, ctx, 'data.demo', null, `${r.count} orders`));
    return r;
  };
  svc.resetDemo = async (ctx) => {
    need(ctx, 'data.manage');
    await tx(async (w) => { await w.write('meta', null); });
    await svc._ensureSeed({ demo: true });
    emit({ type: 'data.reset' });
    return true;
  };

  /* ===== seeding (internal) ===== */
  svc._ensureSeed = async ({ demo = false } = {}) => {
    const meta = await read('meta');
    if (meta?.version) {
      // one-time migration: the first version opened 08:00–23:00; the café now runs 24 hours
      if (!meta.hours24) {
        await tx(async (w) => {
          const m = (await w.read('meta')) || {};
          if (m.hours24) return;
          const s = await w.read('settings');
          if (s?.hours?.open === '08:00' && s?.hours?.close === '23:00') { s.hours = { open: '00:00', close: '00:00' }; await w.write('settings', s); }
          m.hours24 = true;
          await w.write('meta', m);
        });
        emit({ type: 'settings.updated' });
      }
      return false;
    }
    const users = [];
    for (const u of SEED_USERS) users.push(await makeUser({ ...u, defaultPw: true }));
    await tx(async (w) => {
      await w.write('settings', clone(SEED_SETTINGS));
      await w.write('categories', clone(SEED_CATEGORIES));
      await w.write('items', clone(SEED_ITEMS));
      await w.write('tables', clone(SEED_TABLES));
      await w.write('users', users);
      await w.write('logs', []);
      await w.write('requests', []);
      await w.write('orders', []);
      await w.write('counter', { day: '', no: 0 });
      await w.write('meta', { version: VERSION, seededAt: now(), seededDay: dayKey(now()), demo, autoRefresh: demo, hours24: true });
    });
    if (demo) await svc._generateDemo({ days: 70 });
    return true;
  };
  svc._generateDemo = async ({ days = 70 } = {}) => {
    const [s, items, tables] = await Promise.all([settings(), read('items'), read('tables')]);
    const price = (input) => priceLines(items, input, true);
    const t = now();
    const { orders, counters } = generateHistory({ items, tables, settings: s, days, now: t, price });
    const today = dayKey(t);
    const live = liveDemoOrders({ items, tables, settings: s, now: t, price, startNo: (counters[today] || 0) + 1 });
    const all = orders.concat(live);
    const maxNo = Math.max(0, ...all.filter((o) => o.day === today).map((o) => o.no));
    await tx(async (w) => {
      await w.write('orders', all);
      await w.write('counter', { day: today, no: maxNo });
      const meta = (await w.read('meta')) || { version: VERSION };
      meta.seededDay = today;
      meta.liveAt = t;
      meta.demo = true;
      if (meta.autoRefresh === undefined) meta.autoRefresh = true;
      await w.write('meta', meta);
    });
    emit({ type: 'data.reset' });
    return { count: all.length };
  };
  /** Demo mode: refresh sample orders once per day so "today" always looks alive. */
  svc._refreshDemo = async () => {
    const t = now();
    const today = dayKey(t);
    const go = await tx(async (w) => {
      const m = await w.read('meta');
      if (!m?.demo || m.autoRefresh === false) return false;
      if (m.seededDay !== today) { m.seededDay = today; await w.write('meta', m); return 'full'; }
      // same day: keep the sample live orders looking fresh (real orders are never touched)
      if (m.liveAt && t - m.liveAt > 20 * 60000) {
        const shift = t - m.liveAt;
        const orders = (await w.read('orders')) || [];
        let n = 0;
        for (const o of orders) {
          if (!o.seed || !['scheduled', 'new', 'preparing', 'ready'].includes(o.status)) continue;
          o.createdAt += shift; o.updatedAt += shift;
          if (o.releasedAt) o.releasedAt += shift;
          if (o.scheduledFor) o.scheduledFor += shift;
          o.times = Object.fromEntries(Object.entries(o.times || {}).map(([k, v]) => [k, v + shift]));
          if (o.printed?.kitchen) o.printed.kitchen += shift;
          n++;
        }
        m.liveAt = t;
        if (n) await w.write('orders', orders);
        await w.write('meta', m);
      }
      return false;
    });
    if (go === 'full') await svc._generateDemo({ days: 70 });
    return go;
  };

  return svc;
}
