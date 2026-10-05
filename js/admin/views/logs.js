import { html, render, $, csv, download, dayKey } from '../../core/util.js';
import { t, dateTime } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { call, emptyState } from '../ui.js';

const S = { q: '', list: null };
const ACTION_IC = { auth: 'lock', order: 'receipt', item: 'utensils', category: 'layers', table: 'qr', settings: 'settings', user: 'users', request: 'service', data: 'database' };
function rows() {
  const q = S.q.trim().toLowerCase();
  const list = (S.list || []).filter((l) => !q || [l.user, l.action, l.detail, l.ref].join(' ').toLowerCase().includes(q));
  return list.length ? html`<div class="table-wrap"><table class="tbl tbl--compact"><thead><tr><th>${t('time')}</th><th>${t('user')}</th><th>${t('action')}</th><th>${t('details')}</th></tr></thead>
    <tbody>${list.slice(0, 600).map((l) => html`<tr><td class="tabular nowrap">${dateTime(l.at)}</td><td><b>${l.user}</b>${l.role ? html` <small class="muted">${t('role_' + l.role)}</small>` : ''}</td><td><span class="log-act">${icon(ACTION_IC[l.action.split('.')[0]] || 'activity')}${l.action}</span></td><td class="clip">${l.detail || ''}</td></tr>`)}</tbody></table></div>` : emptyState('activity', '—');
}
export default {
  id: 'logs', icon: 'activity', perm: 'logs.view', refreshOn: ['orders', 'menu', 'settings', 'users', 'tables', 'requests'],
  async render(el) {
    render(el, html`<div class="logs card-box">
      <header class="box-head"><h3>${icon('activity')} ${t('logsTitle')}</h3><div class="row-gap"><div class="input-icon">${icon('search')}<input class="input input--sm" id="lg-q" value="${S.q}" placeholder="${t('searchOrders').split(',')[0]}…"></div><button class="btn btn--sm" id="lg-csv">${icon('download')} CSV</button></div></header>
      <div id="lg-body"><div class="skel" style="height:280px"></div></div>
    </div>`);
    S.list = await call('listLogs', { limit: 2000 });
    if (!$('#lg-body', el)) return;
    render($('#lg-body', el), rows());
    el.oninput = (e) => { if (e.target.id === 'lg-q') { S.q = e.target.value; render($('#lg-body', el), rows()); } };
    $('#lg-csv', el).onclick = () => download(`myfitness-activity-${dayKey()}.csv`, csv([['Time', 'User', 'Role', 'Action', 'Ref', 'Details'], ...S.list.map((l) => [new Date(l.at).toISOString(), l.user, l.role || '', l.action, l.ref || '', l.detail || ''])]), 'text/csv;charset=utf-8');
  },
  update(el) { if (!document.activeElement || document.activeElement.id !== 'lg-q') this.render(el); },
};
