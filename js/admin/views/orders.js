import { html, render, $, fmtNum, fmtPhone, csv, download, dayKey, normDigits } from '../../core/util.js';
import { t, L, clock, dateShort } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { rangePreset } from '../../core/analytics.js';
import { A, money } from '../ctx.js';
import { orderCard, emptyState, statusBadge, whereText, call } from '../ui.js';

const st = { tab: 'active', range: 'today', status: 'all', q: '', loaded: null, list: null, page: 0 };
const PAGE = 60;

async function historyOrders() {
  const r = rangePreset(st.range);
  const key = `${st.range}:${r.from}`;
  const inMemory = r.from >= Math.min(...A.d.orders.map((o) => o.createdAt), Date.now());
  if (inMemory || st.range === 'today' || st.range === 'yesterday' || st.range === '7') return A.d.orders.filter((o) => o.createdAt >= r.from && o.createdAt < r.to);
  if (st.loaded !== key) {
    st.list = await call('listOrders', r);
    st.loaded = key;
  }
  return st.list;
}

function board() {
  const cols = ['new', 'preparing', 'ready'];
  const act = A.d.orders.filter((o) => cols.includes(o.status)).sort((a, b) => (a.times?.new || a.createdAt) - (b.times?.new || b.createdAt));
  return html`<div class="board">${cols.map((c) => {
    const list = act.filter((o) => o.status === c);
    return html`<section class="col col--${c}"><header class="col__head"><span class="badge st-${c}">${t('col_' + c)}</span><b>${list.length}</b></header>
      <div class="col__list">${list.length ? list.map((o) => orderCard(o)) : html`<p class="col__empty">—</p>`}</div></section>`;
  })}</div>`;
}
function scheduled() {
  const list = A.d.orders.filter((o) => o.status === 'scheduled').sort((a, b) => a.scheduledFor - b.scheduledFor);
  return list.length ? html`<div class="cards-grid">${list.map((o) => orderCard(o))}</div>` : emptyState('calendar', t('noScheduled'));
}
function matches(o) {
  if (st.status !== 'all' && o.status !== st.status) return false;
  const q = normDigits(st.q).trim().toLowerCase().replace(/^#/, '');
  if (!q) return true;
  return [String(o.no), o.customer?.name, o.customer?.phone, o.table, ...o.items.map((l) => L(l.name))].join(' ').toLowerCase().includes(q);
}
function historyTable(list) {
  const rows = list.filter(matches).sort((a, b) => b.createdAt - a.createdAt);
  const page = rows.slice(st.page * PAGE, st.page * PAGE + PAGE);
  const total = rows.filter((o) => o.status !== 'cancelled').reduce((a, o) => a + o.total, 0);
  return html`<div class="table-wrap">
    <table class="tbl">
      <thead><tr><th>#</th><th>${t('placedAt')}</th><th>${t('type')}</th><th>${t('customer')}</th><th>${t('items')}</th><th>${t('status')}</th><th>${t('payment')}</th><th class="num">${t('total')}</th></tr></thead>
      <tbody>${page.map((o) => html`<tr data-oact="open" data-id="${o.id}" tabindex="0">
        <td><b>#${o.no}</b></td><td class="tabular">${dateShort(o.createdAt)} · ${clock(o.createdAt)}</td><td>${whereText(o)}${o.when === 'later' ? html` ${icon('calendar')}` : ''}</td>
        <td>${o.customer?.name || '—'}<small class="muted" dir="ltr">${o.customer?.phone ? fmtPhone(o.customer.phone) : ''}</small></td>
        <td class="clip">${o.items.map((l) => `${l.qty}× ${L(l.name)}`).join(', ')}</td><td>${statusBadge(o.status)}</td>
        <td>${t('pay_' + o.payment.method)} <small class="${o.payment.status === 'paid' ? 'ok' : 'muted'}">${o.payment.status === 'paid' ? t('paid') : t('unpaid')}</small></td>
        <td class="num tabular"><b>${fmtNum(o.total)}</b></td></tr>`)}</tbody>
    </table>
    ${!rows.length ? emptyState('search', t('noOrdersFound')) : ''}
  </div>
  <div class="tbl-foot"><span class="muted">${rows.length} ${t('orders')} · ${money(total)}</span>
    <div class="pager">${st.page > 0 ? html`<button class="btn btn--sm" data-page="-1">${icon('chevronLeft', 'flip-rtl')}</button>` : ''}<span class="tabular">${st.page + 1} / ${Math.max(1, Math.ceil(rows.length / PAGE))}</span>${(st.page + 1) * PAGE < rows.length ? html`<button class="btn btn--sm" data-page="1">${icon('chevronRight', 'flip-rtl')}</button>` : ''}</div>
  </div>`;
}
function exportCsv(list) {
  const rows = [['Order', 'Date', 'Time', 'Status', 'Type', 'Table', 'Floor', 'Customer', 'Phone', 'Items', 'Subtotal', 'Service', 'Tax', 'Total (IQD)', 'Payment', 'Paid', 'Source', 'Scheduled for']];
  list.filter(matches).sort((a, b) => a.createdAt - b.createdAt).forEach((o) => rows.push([
    o.no, dayKey(o.createdAt), clock(o.createdAt, 'en'), o.status, o.type, o.table || '', o.floor || '', o.customer?.name || '', o.customer?.phone || '',
    o.items.map((l) => `${l.qty}x ${l.name?.en || ''}${l.options?.length ? ' (' + l.options.map((x) => x.cn?.en).join(', ') + ')' : ''}`).join('; '),
    o.subtotal, o.service, o.tax, o.total, o.payment.method, o.payment.status, o.source, o.scheduledFor ? new Date(o.scheduledFor).toISOString() : '',
  ]));
  download(`myfitness-orders-${st.range}-${dayKey()}.csv`, csv(rows), 'text/csv;charset=utf-8');
}

export default {
  id: 'orders', icon: 'receipt', perm: 'orders.view', refreshOn: ['orders'],
  async render(el) {
    if (A.route.q.get('tab')) st.tab = A.route.q.get('tab');
    const nNew = A.d.orders.filter((o) => ['new', 'preparing', 'ready'].includes(o.status)).length;
    const nSch = A.d.orders.filter((o) => o.status === 'scheduled').length;
    render(el, html`<div class="orders">
      <div class="toolbar-row">
        <div class="seg seg--tabs" role="tablist">
          <button class="${st.tab === 'active' ? 'is-on' : ''}" data-tab="active">${icon('activity')} ${t('filter_active')} <b class="cnt">${nNew}</b></button>
          <button class="${st.tab === 'scheduled' ? 'is-on' : ''}" data-tab="scheduled">${icon('calendar')} ${t('filter_scheduled')} <b class="cnt">${nSch}</b></button>
          <button class="${st.tab === 'history' ? 'is-on' : ''}" data-tab="history">${icon('history')} ${t('filter_history')}</button>
        </div>
        ${st.tab === 'history' ? html`<div class="filters-row">
          <select class="select select--sm" id="o-range">${['today', 'yesterday', '7', '30', 'month'].map((r) => html`<option value="${r}" ${st.range === r ? 'selected' : ''}>${t('range_' + r)}</option>`)}</select>
          <select class="select select--sm" id="o-status"><option value="all">${t('all')}</option>${['completed', 'cancelled', 'new', 'preparing', 'ready', 'scheduled'].map((s) => html`<option value="${s}" ${st.status === s ? 'selected' : ''}>${t('st_' + s)}</option>`)}</select>
          <div class="input-icon search-sm">${icon('search')}<input class="input input--sm" id="o-q" value="${st.q}" placeholder="${t('searchOrders')}"></div>
          <button class="btn btn--sm" id="o-csv">${icon('download')} ${t('exportCsv')}</button>
        </div>` : ''}
      </div>
      <div id="o-body">${st.tab === 'active' ? board() : st.tab === 'scheduled' ? scheduled() : html`<div class="skel" style="height:320px"></div>`}</div>
    </div>`);
    el.onclick = null;
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; st.page = 0; history.replaceState(null, '', `#/orders?tab=${st.tab}`); A.route.q = new URLSearchParams(`tab=${st.tab}`); this.render(el); }));
    if (st.tab === 'history') {
      const list = await historyOrders();
      if (A.view?.id !== 'orders' || st.tab !== 'history') return;
      render($('#o-body', el), historyTable(list));
      $('#o-range', el).addEventListener('change', (e) => { st.range = e.target.value; st.page = 0; this.render(el); });
      $('#o-status', el).addEventListener('change', (e) => { st.status = e.target.value; st.page = 0; render($('#o-body', el), historyTable(list)); });
      let tmr;
      $('#o-q', el).addEventListener('input', (e) => { clearTimeout(tmr); tmr = setTimeout(() => { st.q = e.target.value; st.page = 0; render($('#o-body', el), historyTable(list)); }, 200); });
      $('#o-csv', el).addEventListener('click', () => exportCsv(list));
      el.onclick = (e) => { const p = e.target.closest('[data-page]'); if (p) { st.page += Number(p.dataset.page); render($('#o-body', el), historyTable(list)); } };
    }
  },
  update(el) {
    if (st.tab === 'history') return; // don't disturb filters while typing
    this.render(el);
  },
};
