// Kitchen display: big tickets, timers turn amber/red, tap items to tick them off.
import { html, render, $ } from '../../core/util.js';
import { t, clock } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { A } from '../ctx.js';
import { orderCard, whereText, dueLabel } from '../ui.js';

let clockTimer = null;
function columns() {
  const cols = ['new', 'preparing', 'ready'];
  const act = A.d.orders.filter((o) => cols.includes(o.status)).sort((a, b) => (a.times?.new || a.createdAt) - (b.times?.new || b.createdAt));
  const soon = A.d.orders.filter((o) => o.status === 'scheduled').sort((a, b) => a.scheduledFor - b.scheduledFor).slice(0, 12);
  return html`
    ${soon.length ? html`<div class="kds-soon">${icon('calendar')}<span class="kds-soon__lbl">${t('upcoming')}</span>${soon.map((o) => html`<button class="kds-soon__chip" data-oact="open" data-id="${o.id}"><b class="tabular" data-due-long="${o.scheduledFor}">${dueLabel(o.scheduledFor)}</b> · #${o.no} · ${whereText(o)}</button>`)}</div>` : ''}
    ${act.length ? html`<div class="kds-cols">${cols.map((c) => {
      const list = act.filter((o) => o.status === c);
      return html`<section class="kds-col kds-col--${c}"><header><span class="badge st-${c}">${t('col_' + c)}</span><b>${list.length}</b></header><div class="kds-list">${list.map((o) => orderCard(o, { variant: 'kitchen' }))}</div></section>`;
    })}</div>` : html`<div class="kds-empty">${icon('chef')}<h3>${t('noActive')}</h3><p class="muted">${t('kitchenEmpty')}</p></div>`}`;
}

export default {
  id: 'kitchen', icon: 'chef', perm: 'orders.view', refreshOn: ['orders'],
  render(el) {
    render(el, html`<div class="kds" id="kds">
      <header class="kds-head">
        <div class="kds-clock tabular" id="kds-clock">${clock(Date.now())}</div>
        <div class="kds-head__info"><b>${t('kitchenTitle')}</b><small class="muted">${A.printStation ? t('printStationOn') : t('printStationOff')}</small></div>
        <button class="btn btn--sm" id="kds-fs">${icon('maximize')} <span class="hide-sm">${document.fullscreenElement ? t('exitFullscreen') : t('fullscreen')}</span></button>
      </header>
      <div id="kds-body">${columns()}</div>
    </div>`);
    $('#kds-fs', el).addEventListener('click', async () => {
      sfx('tap');
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await $('#kds', el).requestFullscreen();
      } catch {}
    });
    clearInterval(clockTimer);
    clockTimer = setInterval(() => { const c = document.getElementById('kds-clock'); if (c) c.textContent = clock(Date.now()); }, 10000);
  },
  update(el) {
    const body = $('#kds-body', el);
    if (body) render(body, columns()); else this.render(el);
  },
  destroy() { clearInterval(clockTimer); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); },
};
