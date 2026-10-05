import { createService, scheduleSlots, AppError } from '../js/core/service.js';
import { webcrypto } from 'node:crypto';
const mem = {}; let q = Promise.resolve();
const db = { read: async (k) => mem[k], tx: (fn) => { const run = q.then(() => fn({ read: async (k) => mem[k], write: async (k, v) => { mem[k] = v; } })); q = run.catch(() => {}); return run; } };
const events = [];
const svc = createService({ db, emit: (e) => events.push(e.type), subtle: webcrypto.subtle });
const t0 = Date.now();
await svc._ensureSeed({ demo: true });
console.log('seeded in', Date.now() - t0, 'ms; orders:', mem.orders.length, 'counter:', mem.counter);
const menu = await svc.menu();
console.log('menu items', menu.items.length, 'cats', menu.categories.length, 'tables', menu.tables.length);
// place a customer order
const r = await svc.placeOrder({}, { items: [{ id: 'latte', qty: 2, options: { size: 'l', milk: 'oat', extras: ['shot', 'vanilla'] } }, { id: 'protein-bowl', qty: 1, options: { add: ['chicken'] } }], customer: { name: 'Sara', phone: '٠٧٥٠ ٨٢١ ٢٥٢٤' }, type: 'dinein', table: 'L3', when: 'now', payment: 'cash', lang: 'ckb' }).catch(e => e);
if (r instanceof Error) { console.log('placeOrder error (maybe closed hours):', r.code); } else {
  console.log('order', r.order.no, r.order.status, 'total', r.order.total, 'lines', r.order.items.map(l => `${l.qty}x${l.name.en}@${l.unit}`).join(', '));
  const tr = await svc.trackOrder({}, { id: r.order.id, token: r.token }); console.log('track ok', tr.status);
}
// scheduled order
const slots = scheduleSlots(mem.settings, Date.now());
console.log('slot days', slots.map(d => d.day + ':' + d.slots.length).join(' '));
const ts = slots[slots.length - 1].slots[3];
const s2 = await svc.placeOrder({}, { items: [{ id: 'espresso' }], customer: { name: 'Lana', phone: '07701234567' }, type: 'pickup', when: 'later', scheduledFor: ts });
console.log('scheduled', s2.order.status, new Date(s2.order.scheduledFor).toISOString());
// bad phone
const bad = await svc.placeOrder({ sim: true }, { items: [{ id: 'espresso' }], customer: { name: 'X', phone: '123' }, type: 'pickup' }).catch(e => e.code);
console.log('bad phone ->', bad);
// login + admin ops
const u = await svc.login({}, { username: 'admin', password: 'admin123' });
const ctx = { user: u };
const boot = await svc.bootstrap(ctx);
console.log('bootstrap orders', boot.orders.length, 'active', boot.orders.filter(o => ['new','preparing','ready'].includes(o.status)).length, 'scheduled', boot.orders.filter(o => o.status === 'scheduled').length);
const newest = boot.orders.find(o => o.status === 'new');
const up = await svc.updateOrder(ctx, { id: newest.id, status: 'preparing' }); console.log('update ->', up.status);
const badT = await svc.updateOrder(ctx, { id: newest.id, status: 'scheduled' }).catch(e => e.code); console.log('bad transition ->', badT);
const sim = await svc.simulateOrder(ctx); console.log('sim order', sim.no, sim.status, sim.source);
const it = await svc.saveItem(ctx, { name: { en: 'Green Smoothie', ckb: 'سموودی سەوز' }, cat: 'shakes', price: 5000, options: [{ name: { en: 'Size' }, type: 'one', required: true, choices: [{ name: { en: 'Regular' }, price: 0 }, { name: { en: 'Large' }, price: 1000 }] }] });
console.log('new item', it.id, it.sort, it.options[0].id, it.options[0].choices.map(c => c.id));
const k = await svc.login({}, { username: 'kitchen', password: 'kitchen123' });
const forb = await svc.saveItem({ user: k }, { name: { en: 'x' }, cat: 'shakes' }).catch(e => e.code); console.log('kitchen edit menu ->', forb);
const bl = await svc.login({}, { username: 'admin', password: 'nope' }).catch(e => e.code); console.log('bad login ->', bl);
console.log('released', await svc.releaseDue());
await svc.saveSettings(ctx, { ordering: { scheduleLeadMinutes: 20, payments: ['cash', 'fib', 'bogus'] }, hours: { open: '07:30' } });
console.log('settings', mem.settings.ordering.scheduleLeadMinutes, mem.settings.ordering.payments, mem.settings.hours);
console.log('events', [...new Set(events)].join(','));
console.log('logs', mem.logs.length, mem.logs.slice(-3).map(l => l.action).join(','));
const days = {}; for (const o of mem.orders) days[o.day] = (days[o.day] || 0) + 1;
console.log('days', Object.keys(days).length, 'sample', Object.entries(days).slice(-4).map(([d, n]) => d + '=' + n).join(' '));
