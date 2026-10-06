// Export dialog: pick a period and what to include → one Excel workbook (or a CSV of the orders list).
import { html, render, $, raw, csv, download, dayKey, hhmm, bizTs, fmtNum, sum, weekdayOf } from '../core/util.js';
import { t, L, isRtl, clock, weekdayName } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { sfx } from '../core/sound.js';
import { xlsxCompressed, XLSX_TYPE } from '../core/xlsx.js';
import { analyze, rangePreset } from '../core/analytics.js';
import { A, money, can, catById } from './ctx.js';
import { call, modal, modalHead, toast } from './ui.js';

const DAY = 86400000;
const RANGES = ['today', 'yesterday', '7', '30', 'month', 'lastMonth', 'custom'];
const SHEETS = [['summary', 'dashboard'], ['orders', 'receipt'], ['lines', 'list'], ['items', 'utensils'], ['daily', 'calendar'], ['customers', 'users']];
const P = { range: 'today', from: '', to: '', fmt: 'xlsx', sheets: new Set(SHEETS.map((s) => s[0])) };

function rangeOf() {
  if (P.range === 'custom' && P.from && P.to) {
    const [a, b] = P.from <= P.to ? [P.from, P.to] : [P.to, P.from];
    return { from: bizTs(a), to: bizTs(b) + DAY };
  }
  if (P.range === 'lastMonth') {
    const first = bizTs(dayKey().slice(0, 8) + '01');
    return { from: bizTs(dayKey(first - DAY).slice(0, 8) + '01'), to: first };
  }
  return rangePreset(P.range === 'custom' ? 'today' : P.range);
}
const isSale = (o) => o.status !== 'cancelled' && o.status !== 'scheduled';
const nm = (n) => L(n) || n?.en || '';
const optText = (l) => (l.options || []).map((x) => nm(x.cn)).join(', ');
const prepMin = (o) => {
  const start = o.times?.new || o.releasedAt;
  return o.times?.ready && start && o.times.ready > start ? Math.round((o.times.ready - start) / 6000) / 10 : null;
};
const whereCols = (o) => (o.type === 'dinein' && o.table ? [t('dineinLabel'), o.table, t('floor_' + (o.floor || 'ladies'))] : [t('pickupLabel'), '', '']);
const orderCols = () => [
  { h: t('order'), f: 'num', w: 8 }, { h: t('placedAt'), f: 'datetime', w: 17 }, { h: t('status'), w: 13 }, { h: t('type'), w: 11 },
  { h: t('col_table'), w: 8 }, { h: t('floor'), w: 13 }, { h: t('customer'), w: 18 }, { h: t('phone'), w: 14 }, { h: t('items'), w: 46 },
  { h: t('qty'), f: 'int', w: 7 }, { h: t('subtotal'), f: 'money', w: 12 }, { h: t('service'), f: 'money', w: 11 }, { h: t('tax'), f: 'money', w: 10 },
  { h: t('total'), f: 'money', w: 12 }, { h: t('payment'), w: 11 }, { h: t('col_payStatus'), w: 12 }, { h: t('source'), w: 11 },
  { h: t('col_staff'), w: 11 }, { h: t('col_schedFor'), f: 'datetime', w: 17 }, { h: t('col_prepMin'), f: 'num', w: 12 }, { h: t('note'), w: 30 },
];
const orderRow = (o) => [
  o.no, o.createdAt, t('st_' + o.status), ...whereCols(o), o.customer?.name || '', o.customer?.phone || '',
  o.items.map((l) => `${l.qty}× ${nm(l.name)}${optText(l) ? ` (${optText(l)})` : ''}`).join('; '),
  sum(o.items, (l) => l.qty), o.subtotal, o.service || 0, o.tax || 0, o.total,
  t('pay_' + (o.payment?.method || 'cash')), o.payment?.status === 'paid' ? t('paid') : t('unpaid'), o.source === 'pos' ? t('src_pos') : t('src_qr'),
  o.staff || '', o.when === 'later' ? o.scheduledFor : null, prepMin(o),
  [o.note, o.cancelReason ? `${t('reason')}: ${o.cancelReason}` : ''].filter(Boolean).join(' · '),
];

export function buildSheets(all, r) {
  const rtl = isRtl();
  const list = all.filter((o) => o.createdAt >= r.from && o.createdAt < r.to).sort((a, b) => a.createdAt - b.createdAt);
  const sales = list.filter(isSale);
  const a = analyze(list, r);
  const period = `${dayKey(r.from)} → ${dayKey(r.to - 1)}`;
  const out = [];
  const want = (k) => P.sheets.has(k);

  if (want('summary')) {
    const sec = (label) => [[], [{ v: label, b: true }]];
    const paid = sum(sales.filter((o) => o.payment?.status === 'paid'), (o) => o.total);
    const rows = [
      [t('revenue'), { v: a.revenue, f: 'money' }],
      [t('orders'), { v: a.count, f: 'int' }],
      [t('aov'), { v: Math.round(a.aov), f: 'money' }],
      [t('itemsSold'), { v: a.itemsSold, f: 'int' }],
      [`${t('prepTime')} (${t('min')})`, a.avgPrep ? { v: Math.round(a.avgPrep * 10) / 10, f: 'num' } : '—'],
      [t('rep_paidTotal'), { v: paid, f: 'money' }],
      [t('rep_unpaidTotal'), { v: a.revenue - paid, f: 'money' }],
      [t('rep_cancelledCount'), { v: a.cancelled, f: 'int' }],
      [t('cancelRate'), { v: a.cancelRate, f: 'pct' }],
      ...sec(t('ch_pay')), ...Object.entries(a.pay).sort((x, y) => y[1] - x[1]).map(([m, v]) => [t('pay_' + m), { v, f: 'money' }]),
      ...sec(t('ch_cats')), ...A.d.categories.filter((c) => a.catRev[c.id]).map((c) => [nm(c.name), { v: a.catRev[c.id], f: 'money' }]),
      ...sec(t('ch_type')), [t('dineinLabel'), { v: a.type.dinein || 0, f: 'int' }], [t('pickupLabel'), { v: a.type.pickup || 0, f: 'int' }],
      ...sec(t('ch_src')), [t('src_qr'), { v: a.source.qr || 0, f: 'int' }], [t('src_pos'), { v: a.source.pos || 0, f: 'int' }],
    ];
    out.push({
      name: t('sh_summary'), rtl, plain: true, title: t('rep_title'),
      sub: [`${t('rep_period')}: ${period}`, `${t('rep_generated')}: ${dayKey()} ${clock(Date.now())} · ${t('rep_by')} ${A.user?.name || ''}`, t('rep_note')],
      cols: [{ h: t('rep_metric'), w: 34 }, { h: t('rep_value'), w: 20 }], rows,
    });
  }
  if (want('orders')) {
    const foot = orderCols().map(() => '');
    foot[0] = t('rep_totalSales');
    foot[9] = sum(sales, (o) => sum(o.items, (l) => l.qty));
    foot[10] = sum(sales, (o) => o.subtotal); foot[11] = sum(sales, (o) => o.service || 0); foot[12] = sum(sales, (o) => o.tax || 0); foot[13] = a.revenue;
    out.push({ name: t('sh_orders'), rtl, cols: orderCols(), rows: list.map(orderRow), foot });
  }
  if (want('lines')) {
    const rows = [];
    for (const o of list) for (const l of o.items) rows.push([o.no, o.createdAt, nm(l.name), nm(catById(l.cat)?.name) || l.cat || '', optText(l), l.qty, Math.round(l.total / (l.qty || 1)), l.total, l.note || '', t('st_' + o.status)]);
    const sl = sales.flatMap((o) => o.items);
    out.push({
      name: t('sh_lines'), rtl,
      cols: [{ h: t('order'), f: 'num', w: 8 }, { h: t('placedAt'), f: 'datetime', w: 17 }, { h: t('itemName'), w: 26 }, { h: t('category'), w: 16 }, { h: t('options'), w: 28 }, { h: t('qty'), f: 'int', w: 7 }, { h: t('col_unit'), f: 'money', w: 12 }, { h: t('col_lineTotal'), f: 'money', w: 13 }, { h: t('note'), w: 22 }, { h: t('status'), w: 13 }],
      rows, foot: [t('rep_totalSales'), '', '', '', '', sum(sl, (l) => l.qty), '', sum(sl, (l) => l.total), '', ''],
    });
  }
  if (want('items')) {
    const items = [...a.topItems].sort((x, y) => y.rev - x.rev || y.qty - x.qty);
    out.push({
      name: t('sh_items'), rtl,
      cols: [{ h: t('itemName'), w: 28 }, { h: t('category'), w: 18 }, { h: t('qty'), f: 'int', w: 9 }, { h: t('revenue'), f: 'money', w: 14 }, { h: t('col_avgPrice'), f: 'money', w: 14 }, { h: t('col_share'), f: 'pct', w: 14 }],
      rows: items.map((i) => [nm(i.name), nm(catById(i.cat)?.name) || i.cat || '', i.qty, i.rev, Math.round(i.rev / (i.qty || 1)), a.revenue ? i.rev / a.revenue : 0]),
      foot: [t('total'), '', a.itemsSold, a.revenue, '', a.revenue ? 1 : 0],
    });
  }
  if (want('daily')) {
    const methods = Object.keys(a.pay);
    const rows = [];
    for (let d = r.from; d < r.to; d += DAY) {
      const key = dayKey(d + 3600000);
      const day = list.filter((o) => dayKey(o.createdAt) === key);
      const ds = day.filter(isSale);
      const rev = sum(ds, (o) => o.total);
      rows.push([bizTs(key), weekdayName(weekdayOf(bizTs(key, '12:00'))), ds.length, sum(ds, (o) => sum(o.items, (l) => l.qty)), rev, ds.length ? Math.round(rev / ds.length) : 0, day.filter((o) => o.status === 'cancelled').length, ...methods.map((m) => sum(ds.filter((o) => (o.payment?.method || 'cash') === m), (o) => o.total))]);
    }
    out.push({
      name: t('sh_daily'), rtl,
      cols: [{ h: t('col_date'), f: 'date', w: 12 }, { h: t('col_weekday'), w: 13 }, { h: t('orders'), f: 'int', w: 9 }, { h: t('itemsSold'), f: 'int', w: 11 }, { h: t('revenue'), f: 'money', w: 14 }, { h: t('aov'), f: 'money', w: 14 }, { h: t('st_cancelled'), f: 'int', w: 10 }, ...methods.map((m) => ({ h: t('pay_' + m), f: 'money', w: 13 }))],
      rows, foot: [t('total'), '', a.count, a.itemsSold, a.revenue, Math.round(a.aov), a.cancelled, ...methods.map((m) => a.pay[m])],
    });
  }
  if (want('customers')) {
    const map = new Map();
    for (const o of sales) {
      const phone = String(o.customer?.phone || '').replace(/\D/g, '');
      const name = (o.customer?.name || '').trim();
      if (!phone && !name) continue;
      const key = phone || name.toLowerCase();
      const c = map.get(key) || { name, phone: o.customer?.phone || '', n: 0, spent: 0, first: o.createdAt, last: o.createdAt, fav: new Map() };
      c.n++; c.spent += o.total; c.last = Math.max(c.last, o.createdAt); c.first = Math.min(c.first, o.createdAt);
      if (name) c.name = name;
      for (const l of o.items) c.fav.set(nm(l.name), (c.fav.get(nm(l.name)) || 0) + l.qty);
      map.set(key, c);
    }
    const custs = [...map.values()].sort((x, y) => y.spent - x.spent);
    out.push({
      name: t('sh_customers'), rtl,
      cols: [{ h: t('name'), w: 20 }, { h: t('phone'), w: 15 }, { h: t('orders'), f: 'int', w: 9 }, { h: t('col_spent'), f: 'money', w: 14 }, { h: t('aov'), f: 'money', w: 14 }, { h: t('col_firstOrder'), f: 'datetime', w: 17 }, { h: t('col_lastOrder'), f: 'datetime', w: 17 }, { h: t('col_favorite'), w: 24 }],
      rows: custs.map((c) => [c.name || '—', c.phone, c.n, c.spent, Math.round(c.spent / c.n), c.first, c.last, [...c.fav.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] || '']),
      foot: [t('total'), '', sum(custs, (c) => c.n), sum(custs, (c) => c.spent), '', '', '', ''],
    });
  }
  return out;
}

function exportCsv(all, r) {
  const list = all.filter((o) => o.createdAt >= r.from && o.createdAt < r.to).sort((a, b) => a.createdAt - b.createdAt);
  const when = (ts) => (ts ? `${dayKey(ts)} ${hhmm(ts)}` : '');
  const rows = [orderCols().map((c) => c.h), ...list.map((o) => orderRow(o).map((v, i) => (orderCols()[i].f === 'datetime' ? when(v) : v ?? '')))];
  return csv(rows);
}
const fileBase = (r) => `myfitness-${dayKey(r.from) === dayKey(r.to - 1) ? dayKey(r.from) : `${dayKey(r.from)}_${dayKey(r.to - 1)}`}`;

/** Open the export dialog. init: { range, from, to } (same keys as the analytics range picker). */
export function openExport(init = {}) {
  if (!can('analytics.view')) return;
  if (init.range && RANGES.includes(init.range)) P.range = init.range;
  if (init.from) P.from = init.from;
  if (init.to) P.to = init.to;
  let orders = null, loadedKey = null, seq = 0;
  const m = modal(html`${modalHead(t('exportData'), 'download')}
    <div class="modal__body xp" id="xp-body"></div>
    <footer class="modal__foot"><span class="xp-count grow" id="xp-count"></span><button class="btn" data-close>${t('cancel')}</button><button class="btn btn--gold" id="xp-go">${icon('download')} ${t('exportBtn')}</button></footer>`, { cls: 'modal--export' });
  const body = $('#xp-body', m.el), countEl = $('#xp-count', m.el), goBtn = $('#xp-go', m.el);

  const paint = () => {
    const r = rangeOf();
    render(body, html`<p class="muted">${t('exportSub')}</p>
      <h4 class="xp__h">${icon('calendar')} ${t('exportPeriod')}</h4>
      <div class="seg seg--wrap">${RANGES.map((k) => html`<button type="button" class="${P.range === k ? 'is-on' : ''}" data-xr="${k}">${t('range_' + k)}</button>`)}</div>
      ${P.range === 'custom' ? html`<div class="custom-range"><input type="date" class="input input--sm" id="xp-from" value="${P.from || dayKey(r.from)}"><span>→</span><input type="date" class="input input--sm" id="xp-to" value="${P.to || dayKey(r.to - 1)}"></div>` : ''}
      <h4 class="xp__h">${icon('box')} ${t('exportFormat')}</h4>
      <div class="xp__fmts">
        <button type="button" class="xp-fmt ${P.fmt === 'xlsx' ? 'is-on' : ''}" data-xf="xlsx"><span class="xp-fmt__ic">XLSX</span><b>Excel</b><small>${t('fmt_xlsxSub')}</small></button>
        <button type="button" class="xp-fmt ${P.fmt === 'csv' ? 'is-on' : ''}" data-xf="csv"><span class="xp-fmt__ic">CSV</span><b>CSV</b><small>${t('fmt_csvSub')}</small></button>
      </div>
      ${P.fmt === 'xlsx' ? html`<h4 class="xp__h">${icon('layers')} ${t('exportInclude')}</h4>
      <div class="xp__sheets">${SHEETS.map(([k, ic]) => html`<label class="xp-sheet ${P.sheets.has(k) ? 'is-on' : ''}"><input type="checkbox" data-xs="${k}" ${P.sheets.has(k) ? raw('checked') : ''}><span>${icon(ic)}</span><b>${t('sh_' + k)}</b></label>`)}</div>` : ''}`);
    updateCount();
  };
  const updateCount = () => {
    const r = rangeOf();
    const key = `${r.from}:${r.to}`;
    if (loadedKey !== key) {
      countEl.className = 'xp-count grow';
      countEl.textContent = t('exportLoading');
      goBtn.disabled = true;
      const my = ++seq;
      call('listOrders', r).then((list) => { if (my !== seq) return; orders = list; loadedKey = key; updateCount(); }).catch(() => {});
      return;
    }
    const inR = orders.filter((o) => o.createdAt >= r.from && o.createdAt < r.to);
    const rev = sum(inR.filter(isSale), (o) => o.total);
    countEl.classList.toggle('is-empty', !inR.length);
    countEl.textContent = inR.length ? `${fmtNum(inR.length)} ${t('orders')} · ${money(rev)}` : t('exportEmpty');
    goBtn.disabled = !inR.length || (P.fmt === 'xlsx' && !P.sheets.size);
  };

  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.xr) { P.range = b.dataset.xr; sfx('tap'); paint(); }
    if (b.dataset.xf) { P.fmt = b.dataset.xf; sfx('toggle'); paint(); }
    if (b.id === 'xp-go') {
      const r = rangeOf();
      b.classList.add('is-busy');
      try {
        if (P.fmt === 'csv') download(`${fileBase(r)}-orders.csv`, exportCsv(orders, r), 'text/csv;charset=utf-8');
        else download(`${fileBase(r)}.xlsx`, new Blob([await xlsxCompressed(buildSheets(orders, r))], { type: XLSX_TYPE }));
        sfx('success');
        toast(t('exportReady'), { ic: 'download', sub: countEl.textContent });
        m.close();
      } catch (err) { console.error(err); b.classList.remove('is-busy'); sfx('error'); toast(t('err_generic'), { type: 'err', sub: String(err?.message || err) }); }
    }
  });
  m.el.addEventListener('change', (e) => {
    const x = e.target;
    if (x.dataset.xs) {
      if (x.checked) P.sheets.add(x.dataset.xs); else P.sheets.delete(x.dataset.xs);
      x.closest('.xp-sheet')?.classList.toggle('is-on', x.checked);
      sfx('toggle');
      updateCount();
    }
    if (x.id === 'xp-from' || x.id === 'xp-to') {
      P.from = $('#xp-from', m.el).value; P.to = $('#xp-to', m.el).value;
      updateCount();
    }
  });
  paint();
}
