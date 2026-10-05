// Business analytics computed from orders (same results in demo and server mode).
import { dayKey, hourOf, weekdayOf, startOfDay, bizTs, sum } from './util.js';

const DAY = 86400000;
export function rangePreset(key, now = Date.now()) {
  const today = startOfDay(now);
  switch (key) {
    case 'today': return { from: today, to: today + DAY };
    case 'yesterday': return { from: today - DAY, to: today };
    case '7': return { from: today - 6 * DAY, to: today + DAY };
    case '30': return { from: today - 29 * DAY, to: today + DAY };
    case 'month': return { from: bizTs(dayKey(now).slice(0, 8) + '01'), to: today + DAY };
    default: return { from: today - 6 * DAY, to: today + DAY };
  }
}

export function analyze(orders, { from, to }) {
  const inRange = orders.filter((o) => o.createdAt >= from && o.createdAt < to && o.status !== 'scheduled');
  const done = inRange.filter((o) => o.status !== 'cancelled');
  const revenue = sum(done, (o) => o.total);
  const count = done.length;
  const cancelled = inRange.length - count;
  const itemsSold = sum(done, (o) => sum(o.items, (l) => l.qty));
  const prep = done
    .map((o) => (o.times?.ready && (o.times.new || o.releasedAt) ? (o.times.ready - (o.times.new || o.releasedAt)) / 60000 : null))
    .filter((v) => v != null && v > 0 && v < 180);
  const days = [];
  for (let t = from; t < to; t += DAY) days.push(dayKey(t + 3600000));
  const byDay = Object.fromEntries(days.map((d) => [d, { rev: 0, n: 0 }]));
  const byHour = Array(24).fill(0);
  const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
  const itemMap = new Map();
  const pay = {}, type = {}, source = {}, floor = {};
  for (const o of done) {
    const ts = o.releasedAt || o.createdAt;
    const d = byDay[dayKey(o.createdAt)];
    if (d) { d.rev += o.total; d.n++; }
    byHour[hourOf(ts)]++;
    heat[weekdayOf(ts)][hourOf(ts)]++;
    for (const l of o.items) {
      const m = itemMap.get(l.id) || { id: l.id, name: l.name, cat: l.cat, qty: 0, rev: 0 };
      m.qty += l.qty; m.rev += l.total;
      itemMap.set(l.id, m);
    }
    const pm = o.payment?.method || 'cash';
    pay[pm] = (pay[pm] || 0) + o.total;
    type[o.type] = (type[o.type] || 0) + 1;
    source[o.source || 'qr'] = (source[o.source || 'qr'] || 0) + 1;
    const fl = o.type === 'pickup' ? 'pickup' : o.floor || 'ladies';
    floor[fl] = (floor[fl] || 0) + 1;
  }
  const topItems = [...itemMap.values()].sort((a, b) => b.qty - a.qty || b.rev - a.rev);
  const catRev = {};
  topItems.forEach((i) => { catRev[i.cat] = (catRev[i.cat] || 0) + i.rev; });
  return {
    revenue, count, aov: count ? revenue / count : 0, cancelled,
    cancelRate: inRange.length ? cancelled / inRange.length : 0,
    itemsSold, avgPrep: prep.length ? sum(prep) / prep.length : 0,
    days, byDay, byHour, heat, topItems, catRev, pay, type, source, floor,
    scheduled: done.filter((o) => o.when === 'later').length,
  };
}
export const pctChange = (a, b) => (b ? ((a - b) / b) * 100 : null);
