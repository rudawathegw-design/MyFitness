import { html, render, fmtNum, startOfDay, sum, hourOf, parseHM } from '../../core/util.js';
import { t, L, clock, dateShort, weekdayName, ago } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { chart, hbars } from '../../core/charts.js';
import { analyze, pctChange } from '../../core/analytics.js';
import { A, money, can, itemById } from '../ctx.js';
import { orderCard, emptyState, whereText, call, dueLabel, dueShort } from '../ui.js';
import { openExport } from '../export.js';

const DAY = 86400000;
function kpi({ label, value, delta, goodUp = true, spark, ic, sub }) {
  const good = delta == null ? null : goodUp ? delta >= 0 : delta <= 0;
  return html`<div class="kpi">
    <div class="kpi__top"><span class="kpi__ic">${icon(ic)}</span><span class="kpi__lbl">${label}</span></div>
    <div class="kpi__val">${value}</div>
    ${delta != null && Number.isFinite(delta) ? html`<div class="kpi__delta ${good ? 'is-good' : 'is-bad'}">${icon(delta >= 0 ? 'arrowUp' : 'arrowDown')}<b>${Math.abs(delta).toFixed(0)}%</b><span>${sub || t('vsLastWeek')}</span></div>` : html`<div class="kpi__delta">${sub || ''}</div>`}
    ${spark ? html`<div class="kpi__spark">${chart('spark', { data: spark })}</div>` : ''}
  </div>`;
}

export default {
  id: 'dashboard', icon: 'dashboard', perm: 'dashboard.view', refreshOn: ['orders', 'requests'],
  render(el) {
    const now = Date.now();
    const d0 = startOfDay(now);
    const orders = A.d.orders;
    const T = analyze(orders, { from: d0, to: d0 + DAY });
    const LW = analyze(orders, { from: d0 - 7 * DAY, to: now - 7 * DAY });
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const f = d0 - i * DAY;
      const a = orders.filter((o) => o.createdAt >= f && o.createdAt < f + DAY && o.status !== 'cancelled' && o.status !== 'scheduled');
      days.push({ ts: f, rev: sum(a, (o) => o.total), n: a.length });
    }
    const active = orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status)).sort((a, b) => (a.times?.new || a.createdAt) - (b.times?.new || b.createdAt));
    const sched = orders.filter((o) => o.status === 'scheduled').sort((a, b) => a.scheduledFor - b.scheduledFor);
    const reqs = A.d.requests.filter((r) => r.status === 'open');
    const h = hourOf(now);
    const greet = h < 12 ? t('gm') : h < 17 ? t('ga') : t('ge');
    const s = A.d.settings;
    const oh = Math.floor(parseHM(s.hours.open) / 60), ch = Math.ceil(parseHM(s.hours.close) / 60);
    const hours = [];
    if (parseHM(s.hours.open) === parseHM(s.hours.close)) for (let x = 0; x < 24; x++) hours.push(x); // open 24 hours
    else for (let x = oh; x !== (ch % 24) && hours.length < 24; x = (x + 1) % 24) hours.push(x);
    const counts = { new: 0, preparing: 0, ready: 0 };
    active.forEach((o) => { counts[o.status]++; });
    const showMoney = can('analytics.view');

    render(el, html`<div class="dash">
      <section class="dash__hello">
        <div><h2>${greet}, ${A.user.name} 👋</h2><p class="muted">${weekdayName(new Date(now + (s.tzOffset ?? 180) * 60000).getUTCDay())} · ${dateShort(now)} · ${clock(now)}</p></div>
        <div class="dash__quick">
          ${can('orders.pos') ? html`<a class="btn btn--gold" href="#/pos">${icon('plus')} ${t('nav_pos')}</a>` : ''}
          <a class="btn" href="#/kitchen">${icon('chef')} ${t('nav_kitchen')}</a>
          ${can('analytics.view') ? html`<button class="btn" id="d-export">${icon('download')} ${t('exportData')}</button>` : ''}
        </div>
      </section>

      <section class="kpis">
        ${showMoney ? kpi({ label: t('kpi_revenue'), value: money(T.revenue), delta: pctChange(T.revenue, LW.revenue), spark: days.map((d) => d.rev), ic: 'cash' }) : ''}
        ${kpi({ label: t('kpi_orders'), value: fmtNum(T.count), delta: pctChange(T.count, LW.count), spark: days.map((d) => d.n), ic: 'receipt' })}
        ${showMoney ? kpi({ label: t('kpi_aov'), value: money(T.aov), delta: pctChange(T.aov, LW.aov), ic: 'bag' }) : ''}
        ${kpi({ label: t('kpi_prep'), value: T.avgPrep ? `${T.avgPrep.toFixed(1)} ${t('min')}` : '—', delta: T.avgPrep && LW.avgPrep ? pctChange(T.avgPrep, LW.avgPrep) : null, goodUp: false, ic: 'timer' })}
        <div class="kpi kpi--live">
          <div class="kpi__top"><span class="kpi__ic">${icon('activity')}</span><span class="kpi__lbl">${t('kpi_active')}</span></div>
          <div class="kpi__val">${active.length}</div>
          <div class="kpi__chips"><span class="badge st-new">${counts.new}</span><span class="badge st-preparing">${counts.preparing}</span><span class="badge st-ready">${counts.ready}</span></div>
        </div>
        <div class="kpi">
          <div class="kpi__top"><span class="kpi__ic">${icon('calendar')}</span><span class="kpi__lbl">${t('kpi_sched')}</span></div>
          <div class="kpi__val">${sched.length}</div>
          <div class="kpi__delta">${sched[0] ? `${dueLabel(sched[0].scheduledFor, now)} · #${sched[0].no}` : t('noScheduled')}</div>
        </div>
      </section>

      <section class="dash__grid">
        <div class="dash__col">
          ${showMoney ? html`<div class="card-box">
            <header class="box-head"><h3>${t('ch_revenue14')}</h3><span class="muted">${money(sum(days, (d) => d.rev))}</span></header>
            ${chart('column', { data: days.map((d, i) => ({ l: i === 13 ? t('today') : dateShort(d.ts).replace(/ .*/, '') + '', v: d.rev, t: dateShort(d.ts) })), fmt: 'money', unit: 'IQD', highlight: 'last', height: 230, label: t('ch_revenue14') })}
          </div>` : ''}
          <div class="card-box">
            <header class="box-head"><h3>${t('ch_byHour')}</h3><span class="muted">${fmtNum(T.count)} ${t('orders')}</span></header>
            ${chart('column', { data: hours.map((x) => ({ l: x % 12 === 0 ? 12 : x % 12, v: T.byHour[x], t: clock(d0 + x * 3600000) })), fmt: 'num', unit: t('orders'), highlight: 'max', height: 200, label: t('ch_byHour') })}
          </div>
          <div class="card-box">
            <header class="box-head"><h3>${t('ch_top')}</h3><a class="link" href="#/analytics">${t('viewAll')} ${icon('chevronRight', 'flip-rtl')}</a></header>
            ${T.topItems.length ? hbars(T.topItems.slice(0, 5).map((i) => ({ l: L(itemById(i.id)?.name || i.name), v: i.qty, sub: showMoney ? money(i.rev) : '', img: itemById(i.id)?.img })), { fmt: (v) => `${v}×`, img: (src) => A.store.img(src, 80) }) : emptyState('chart', t('noOrdersToday'))}
          </div>
        </div>
        <div class="dash__col">
          <div class="card-box">
            <header class="box-head"><h3>${icon('activity')} ${t('liveOrders')}</h3><a class="link" href="#/orders">${t('viewAll')} ${icon('chevronRight', 'flip-rtl')}</a></header>
            <div class="mini-list">${active.length ? active.slice(0, 6).map((o) => orderCard(o, { variant: 'mini' })) : emptyState('checkCircle', t('noActive'))}</div>
          </div>
          <div class="card-box">
            <header class="box-head"><h3>${icon('calendar')} ${t('upcoming')}</h3><a class="link" href="#/orders?tab=scheduled">${t('viewAll')} ${icon('chevronRight', 'flip-rtl')}</a></header>
            ${sched.length ? html`<ul class="sched-list">${sched.slice(0, 5).map((o) => html`<li><button class="sched-row" data-oact="open" data-id="${o.id}"><b class="tabular">${clock(o.scheduledFor)}</b><span class="grow">#${o.no} · ${whereText(o)}<small>${o.customer?.name || ''} · ${o.items.reduce((a, l) => a + l.qty, 0)} ${t('items')}</small></span><span class="badge st-scheduled badge--plain" data-due="${o.scheduledFor}">${dueShort(o.scheduledFor, now)}</span></button></li>`)}</ul>` : emptyState('calendar', t('noScheduled'))}
          </div>
          <div class="card-box">
            <header class="box-head"><h3>${icon('service')} ${t('requestsTitle')}</h3><a class="link" href="#/requests">${t('viewAll')} ${icon('chevronRight', 'flip-rtl')}</a></header>
            ${reqs.length ? html`<ul class="req-list">${reqs.map((r) => html`<li class="req is-open"><span class="req__ic">${icon(r.type === 'bill' ? 'receipt' : r.type === 'water' ? 'water' : 'user')}</span><div class="grow"><b>${t('table', { t: r.table })} · ${t('req_' + r.type)}</b><small>${t('floor_' + r.floor)} · ${ago(r.at)}</small></div><button class="btn btn--sm btn--green" data-req-done="${r.id}">${icon('check')} ${t('done')}</button></li>`)}</ul>` : emptyState('service', t('noRequests'))}
          </div>
        </div>
      </section>
    </div>`);
    el.querySelector('#d-export')?.addEventListener('click', () => openExport({ range: 'today' }));
    el.querySelectorAll('[data-req-done]').forEach((b) => b.addEventListener('click', () => call('resolveRequest', { id: b.dataset.reqDone }).catch(() => {})));
  },
};
