// Business analytics: revenue, orders, AOV, prep time, peak hours, best sellers, mixes, insights.
import { html, render, $, fmtNum, dayKey, csv, download, bizTs, startOfDay } from '../../core/util.js';
import { t, L, clock, dateShort, weekdayName } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { chart, hbars, stackBar } from '../../core/charts.js';
import { analyze, rangePreset, pctChange } from '../../core/analytics.js';
import { A, money, itemById, catById } from '../ctx.js';
import { call, emptyState } from '../ui.js';

const S = { key: '30', from: '', to: '', table: false };
const DAY = 86400000;
let cache = { key: null, orders: [] };

function currentRange() {
  if (S.key === 'custom' && S.from && S.to) return { from: bizTs(S.from), to: bizTs(S.to) + DAY };
  return rangePreset(S.key === 'custom' ? '30' : S.key);
}
async function ordersFor(r) {
  const prevFrom = r.from - (r.to - r.from);
  const key = `${prevFrom}:${r.to}`;
  if (cache.key !== key) cache = { key, orders: await call('listOrders', { from: prevFrom, to: r.to }) };
  return cache.orders;
}
function kpi(label, value, delta, goodUp = true, ic) {
  const good = delta == null ? null : goodUp ? delta >= 0 : delta <= 0;
  return html`<div class="kpi"><div class="kpi__top"><span class="kpi__ic">${icon(ic)}</span><span class="kpi__lbl">${label}</span></div><div class="kpi__val">${value}</div>
    ${delta != null && Number.isFinite(delta) ? html`<div class="kpi__delta ${good ? 'is-good' : 'is-bad'}">${icon(delta >= 0 ? 'arrowUp' : 'arrowDown')}<b>${Math.abs(delta).toFixed(0)}%</b><span>${t('vsPrev')}</span></div>` : html`<div class="kpi__delta">&nbsp;</div>`}</div>`;
}
function insights(a, prev) {
  const out = [];
  let bestW = 0, bestH = 0, bestV = -1;
  a.heat.forEach((row, w) => row.forEach((v, h) => { if (v > bestV) { bestV = v; bestW = w; bestH = h; } }));
  if (bestV > 0) out.push(['flame', t('ins_peak', { day: weekdayName(bestW), hour: clock(bizTs(dayKey(), `${String(bestH).padStart(2, '0')}:00`)) })]);
  if (a.topItems[0]) out.push(['star', t('ins_best', { item: L(itemById(a.topItems[0].id)?.name || a.topItems[0].name), qty: a.topItems[0].qty })]);
  const g = pctChange(a.revenue, prev.revenue);
  if (g != null && Number.isFinite(g)) out.push([g >= 0 ? 'trend' : 'arrowDown', t('ins_growth', { dir: g >= 0 ? t('ins_up') : t('ins_down'), pct: Math.abs(g).toFixed(0) })]);
  const cats = Object.entries(a.catRev).sort((x, y) => y[1] - x[1]);
  if (cats[0] && a.revenue) out.push(['layers', t('ins_cat', { cat: L(catById(cats[0][0])?.name) || cats[0][0], pct: Math.round((cats[0][1] / a.revenue) * 100) })]);
  if (a.count) out.push(['qr', t('ins_qr', { pct: Math.round(((a.source.qr || 0) / a.count) * 100) })]);
  if (a.count && a.scheduled) out.push(['calendar', t('ins_sched', { pct: Math.round((a.scheduled / a.count) * 100) })]);
  return out;
}
function exportOrders(orders, r) {
  const rows = [['Order', 'Date', 'Time', 'Status', 'Type', 'Table', 'Floor', 'Customer', 'Phone', 'Items', 'Total (IQD)', 'Payment', 'Paid', 'Source', 'Scheduled']];
  orders.filter((o) => o.createdAt >= r.from && o.createdAt < r.to).forEach((o) => rows.push([o.no, dayKey(o.createdAt), clock(o.createdAt, 'en'), o.status, o.type, o.table || '', o.floor || '', o.customer?.name || '', o.customer?.phone || '', o.items.map((l) => `${l.qty}x ${l.name?.en}`).join('; '), o.total, o.payment.method, o.payment.status, o.source, o.when === 'later' ? 'yes' : '']));
  download(`myfitness-orders-${dayKey(r.from)}_${dayKey(r.to - 1)}.csv`, csv(rows), 'text/csv;charset=utf-8');
}
function exportItems(a, r) {
  const rows = [['Item', 'Kurdish', 'Arabic', 'Category', 'Quantity', 'Revenue (IQD)']];
  a.topItems.forEach((i) => { const it = itemById(i.id); rows.push([i.name?.en, i.name?.ckb, i.name?.ar, L(catById(i.cat)?.name, 'en'), i.qty, i.rev]); void it; });
  download(`myfitness-item-sales-${dayKey(r.from)}_${dayKey(r.to - 1)}.csv`, csv(rows), 'text/csv;charset=utf-8');
}

export default {
  id: 'analytics', icon: 'chart', perm: 'analytics.view', refreshOn: [],
  async render(el) {
    const r = currentRange();
    render(el, html`<div class="analytics">
      <div class="filter-bar">
        <span class="label">${icon('calendar')} ${t('rangeLabel')}</span>
        <div class="seg seg--wrap">${['today', 'yesterday', '7', '30', 'month', 'custom'].map((k) => html`<button class="${S.key === k ? 'is-on' : ''}" data-range="${k}">${t('range_' + k)}</button>`)}</div>
        ${S.key === 'custom' ? html`<div class="custom-range"><input type="date" class="input input--sm" id="a-from" value="${S.from || dayKey(r.from)}"><span>→</span><input type="date" class="input input--sm" id="a-to" value="${S.to || dayKey(r.to - 1)}"><button class="btn btn--sm btn--gold" id="a-apply">${t('apply')}</button></div>` : ''}
        <span class="grow"></span>
        <button class="btn btn--sm" id="a-csv">${icon('download')} ${t('exportCsv')}</button>
        <button class="btn btn--sm" id="a-items">${icon('download')} ${t('exportItems')}</button>
      </div>
      <div id="a-body" class="is-loading"><div class="kpis">${Array.from({ length: 6 }, () => html`<div class="kpi skel" style="height:118px"></div>`)}</div></div>
    </div>`);
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.range) { S.key = b.dataset.range; this.render(el); }
      if (b.id === 'a-apply') { S.from = $('#a-from', el).value; S.to = $('#a-to', el).value; this.render(el); }
      if (b.id === 'a-table') { S.table = !S.table; this.render(el); }
    };
    const all = await ordersFor(r);
    if (A.view?.id !== 'analytics') return;
    const a = analyze(all, r);
    const prev = analyze(all, { from: r.from - (r.to - r.from), to: r.from });
    const single = r.to - r.from <= DAY;
    const s = A.d.settings;
    const hrs = [];
    for (let h = 0; h < 24; h++) if (a.byHour[h] || (h >= 8 && h <= 22)) hrs.push(h);
    const revSeries = single
      ? hrs.map((h) => ({ l: h % 12 || 12, v: all.filter((o) => o.createdAt >= r.from && o.createdAt < r.to && o.status !== 'cancelled' && o.status !== 'scheduled' && new Date(o.createdAt + (s.tzOffset ?? 180) * 60000).getUTCHours() === h).reduce((x, o) => x + o.total, 0), t: clock(r.from + h * 3600000) }))
      : a.days.map((d) => ({ l: dateShort(bizTs(d)).replace(/ .*/, ''), v: a.byDay[d].rev, t: `${weekdayName(new Date(bizTs(d, '12:00') + (s.tzOffset ?? 180) * 60000).getUTCDay(), undefined, true)} ${dateShort(bizTs(d))}` }));
    const wdOrder = [6, 0, 1, 2, 3, 4, 5]; // Saturday first (Iraqi week)
    const heatHours = hrs;
    const ins = insights(a, prev);
    const catSegs = A.d.categories.map((c, i) => ({ l: L(c.name), v: a.catRev[c.id] || 0, c: (i % 4) + 1 }));
    const pays = ['cash', 'card', 'fib', 'fastpay'].map((p, i) => ({ l: t('pay_' + p), v: a.pay[p] || 0, c: i + 1 })).filter((x) => x.v);
    render($('#a-body', el), html`
      <section class="kpis">
        ${kpi(t('revenue'), money(a.revenue), pctChange(a.revenue, prev.revenue), true, 'cash')}
        ${kpi(t('orders'), fmtNum(a.count), pctChange(a.count, prev.count), true, 'receipt')}
        ${kpi(t('aov'), money(a.aov), pctChange(a.aov, prev.aov), true, 'bag')}
        ${kpi(t('itemsSold'), fmtNum(a.itemsSold), pctChange(a.itemsSold, prev.itemsSold), true, 'utensils')}
        ${kpi(t('prepTime'), a.avgPrep ? `${a.avgPrep.toFixed(1)} ${t('min')}` : '—', a.avgPrep && prev.avgPrep ? pctChange(a.avgPrep, prev.avgPrep) : null, false, 'timer')}
        ${kpi(t('cancelRate'), `${(a.cancelRate * 100).toFixed(1)}%`, prev.cancelRate ? pctChange(a.cancelRate, prev.cancelRate) : null, false, 'xCircle')}
      </section>
      ${ins.length ? html`<section class="card-box insights"><header class="box-head"><h3>${icon('sparkles')} ${t('insights')}</h3></header><ul>${ins.map(([ic, txt]) => html`<li>${icon(ic)}<span>${txt}</span></li>`)}</ul></section>` : ''}
      <section class="an-grid">
        <div class="card-box span-2">
          <header class="box-head"><h3>${t('ch_revenue')} <small class="muted">· ${single ? t('hourly') : t('daily')}</small></h3><button class="btn btn--sm btn--ghost" id="a-table">${icon(S.table ? 'chart' : 'list')} ${S.table ? t('showChart') : t('showTable')}</button></header>
          ${S.table ? html`<div class="table-wrap"><table class="tbl tbl--compact"><thead><tr><th>${single ? t('hour') : t('day')}</th><th class="num">${t('revenue')} (IQD)</th></tr></thead><tbody>${revSeries.map((p) => html`<tr><td>${p.t}</td><td class="num tabular">${fmtNum(p.v)}</td></tr>`)}</tbody></table></div>`
            : single ? chart('column', { data: revSeries, fmt: 'money', unit: 'IQD', highlight: 'max', height: 260, label: t('ch_revenue') }) : chart('line', { data: revSeries, fmt: 'money', unit: 'IQD', height: 260, label: t('ch_revenue') })}
        </div>
        <div class="card-box">
          <header class="box-head"><h3>${t('ch_hours')}</h3></header>
          ${chart('column', { data: heatHours.map((h) => ({ l: h % 12 || 12, v: a.byHour[h], t: clock(bizTs(dayKey(), `${String(h).padStart(2, '0')}:00`)) })), fmt: 'num', unit: t('orders'), highlight: 'max', height: 230, label: t('ch_hours') })}
        </div>
        <div class="card-box">
          <header class="box-head"><h3>${t('ch_heat')}</h3></header>
          ${chart('heat', { rows: wdOrder.map((w) => weekdayName(w, undefined, true)), cols: heatHours.map((h) => String(h % 12 || 12)), values: wdOrder.map((w) => heatHours.map((h) => a.heat[w][h])), fmt: 'num', unit: t('orders'), less: '0', label: t('ch_heat') })}
        </div>
        <div class="card-box">
          <header class="box-head"><h3>${t('ch_items')}</h3></header>
          ${a.topItems.length ? hbars(a.topItems.slice(0, 10).map((i) => ({ l: L(itemById(i.id)?.name || i.name), v: i.qty, sub: money(i.rev), img: itemById(i.id)?.img })), { fmt: (v) => `${fmtNum(v)}×`, img: (src) => A.store.img(src, 80) }) : emptyState('chart', t('noOrdersFound'))}
        </div>
        <div class="card-box mixes">
          <header class="box-head"><h3>${t('ch_cats')}</h3></header>
          ${stackBar(catSegs, { fmt: (v) => money(v), label: t('ch_cats') })}
          <h4 class="mix-h">${t('ch_pay')}</h4>${stackBar(pays, { fmt: (v) => money(v), label: t('ch_pay') })}
          <h4 class="mix-h">${t('ch_type')}</h4>${stackBar([{ l: t('dineinLabel'), v: a.type.dinein || 0, c: 1 }, { l: t('pickupLabel'), v: a.type.pickup || 0, c: 2 }], { label: t('ch_type') })}
          <h4 class="mix-h">${t('ch_src')}</h4>${stackBar([{ l: t('src_qr'), v: a.source.qr || 0, c: 1 }, { l: t('src_pos'), v: a.source.pos || 0, c: 2 }], { label: t('ch_src') })}
          <h4 class="mix-h">${t('ch_floor')}</h4>${stackBar([{ l: t('floor_ladies'), v: a.floor.ladies || 0, c: 1 }, { l: t('floor_men'), v: a.floor.men || 0, c: 2 }, { l: t('pickupLabel'), v: a.floor.pickup || 0, c: 3 }], { label: t('ch_floor') })}
        </div>
      </section>`);
    $('#a-body', el).classList.remove('is-loading');
    $('#a-csv', el).onclick = () => exportOrders(all, r);
    $('#a-items', el).onclick = () => exportItems(a, r);
    const { mountCharts } = await import('../../core/charts.js');
    mountCharts(el);
  },
};
