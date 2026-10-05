import { html, render } from '../../core/util.js';
import { t, clock, ago } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { A } from '../ctx.js';
import { call, emptyState } from '../ui.js';

const ic = (type) => (type === 'bill' ? 'receipt' : type === 'water' ? 'water' : 'user');
export default {
  id: 'requests', icon: 'service', perm: 'requests.update', refreshOn: ['requests'],
  render(el) {
    const open = A.d.requests.filter((r) => r.status === 'open').sort((a, b) => a.at - b.at);
    const done = A.d.requests.filter((r) => r.status === 'done').sort((a, b) => b.doneAt - a.doneAt).slice(0, 30);
    render(el, html`<div class="requests">
      <h3 class="section-title">${icon('bell')} ${t('open')} <span class="muted">· ${open.length}</span></h3>
      ${open.length ? html`<div class="req-grid">${open.map((r) => html`<article class="req-card req-card--${r.type}">
        <span class="req-card__ic">${icon(ic(r.type))}</span>
        <div class="grow"><b>${t('table', { t: r.table })}</b><span>${t('req_' + r.type)} · ${t('floor_' + r.floor)}</span><small data-since="${r.at}">${ago(r.at)}</small></div>
        <button class="btn btn--green" data-done="${r.id}">${icon('check')} ${t('done')}</button>
      </article>`)}</div>` : emptyState('checkCircle', t('noRequests'))}
      ${done.length ? html`<h3 class="section-title">${icon('history')} ${t('done')}</h3>
        <ul class="req-list">${done.map((r) => html`<li class="req"><span class="req__ic">${icon(ic(r.type))}</span><div class="grow"><b>${t('table', { t: r.table })} · ${t('req_' + r.type)}</b><small>${clock(r.at)} → ${clock(r.doneAt)} · ${r.doneBy || ''}</small></div></li>`)}</ul>` : ''}
    </div>`);
    el.onclick = async (e) => {
      const b = e.target.closest('[data-done]');
      if (!b) return;
      b.classList.add('is-busy');
      try { await call('resolveRequest', { id: b.dataset.done }); sfx('success'); } catch { b.classList.remove('is-busy'); }
    };
  },
};
