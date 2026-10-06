// Kitchen display: one ticket per row in each column, timers turn amber/red, tap items to tick them off.
// Each column scrolls on its own and shows "more below" when tickets are hidden under the fold.
import { html, render, $ } from '../../core/util.js';
import { t, clock } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { A, setPref } from '../ctx.js';
import { orderCard, whereText, dueLabel } from '../ui.js';

let clockTimer = null, onResize = null;
// card size on this screen: s (compact) · m (same as the Orders board) · l (big, for a wall screen)
const SIZES = ['s', 'm', 'l'];
const sizePref = () => { try { const v = localStorage.getItem('mf.kdsSize'); return SIZES.includes(v) ? v : 'm'; } catch { return 'm'; } };
function columns() {
  const cols = ['new', 'preparing', 'ready'];
  const act = A.d.orders.filter((o) => cols.includes(o.status)).sort((a, b) => (a.times?.new || a.createdAt) - (b.times?.new || b.createdAt));
  const soon = A.d.orders.filter((o) => o.status === 'scheduled').sort((a, b) => a.scheduledFor - b.scheduledFor).slice(0, 12);
  return html`
    ${soon.length ? html`<div class="kds-soon">${icon('calendar')}<span class="kds-soon__lbl">${t('upcoming')}</span>${soon.map((o) => html`<button class="kds-soon__chip" data-oact="open" data-id="${o.id}"><b class="tabular" data-due-long="${o.scheduledFor}">${dueLabel(o.scheduledFor)}</b> · #${o.no} · ${whereText(o)}</button>`)}</div>` : ''}
    ${act.length ? html`<div class="kds-cols">${cols.map((c) => {
      const list = act.filter((o) => o.status === c);
      return html`<section class="kds-col kds-col--${c}"><header><span class="badge st-${c}">${t('col_' + c)}</span><b>${list.length}</b></header>
        <div class="kds-scroll"><div class="kds-list" data-list="${c}">${list.map((o) => orderCard(o, { variant: 'kitchen' }))}</div>
          <button type="button" class="kds-more" data-more hidden>${icon('arrowDown')}<span></span></button></div></section>`;
    })}</div>` : html`<div class="kds-empty">${icon('chef')}<h3>${t('noActive')}</h3><p class="muted">${t('kitchenEmpty')}</p></div>`}`;
}

/** Columns fill the screen height and scroll on their own (side-by-side layout only). */
function fit(root) {
  const stacked = window.matchMedia('(max-width: 1050px)').matches;
  root.querySelectorAll('.kds-list').forEach((list) => {
    if (stacked) list.style.maxHeight = '';
    else {
      const top = list.getBoundingClientRect().top + (document.fullscreenElement ? 0 : window.scrollY);
      list.style.maxHeight = Math.max(240, window.innerHeight - top - 14) + 'px';
    }
    edges(list);
  });
}
/** Fades and the "N more below" button show what is hidden above or below. */
function edges(list) {
  const box = list.parentElement;
  const below = list.scrollHeight - list.scrollTop - list.clientHeight > 6;
  box.classList.toggle('has-above', list.scrollTop > 6);
  box.classList.toggle('has-more', below);
  const btn = box.querySelector('[data-more]');
  if (!below) { btn.hidden = true; return; }
  const edge = list.getBoundingClientRect().bottom - 8;
  const n = [...list.children].filter((c) => c.getBoundingClientRect().bottom > edge).length;
  btn.querySelector('span').textContent = t('moreBelow', { n: Math.max(1, n) });
  btn.hidden = false;
}
let sizeWatch = null;
function bindLists(el, keep = {}) {
  fit(el);
  sizeWatch?.disconnect();
  // tickets change height when fonts load, items are ticked or the card size changes
  sizeWatch = typeof ResizeObserver === 'function' ? new ResizeObserver(() => el.querySelectorAll('.kds-list').forEach(edges)) : null;
  el.querySelectorAll('.kds-list').forEach((list) => {
    if (keep[list.dataset.list]) list.scrollTop = keep[list.dataset.list];
    list.addEventListener('scroll', () => edges(list), { passive: true });
    list.addEventListener('animationend', () => edges(list)); // tickets slide in; measure again once they settle
    [...list.children].forEach((card) => sizeWatch?.observe(card));
    edges(list);
  });
  document.fonts?.ready.then(() => { if (el.isConnected) fit(el); });
  setTimeout(() => { if (el.isConnected) el.querySelectorAll('.kds-list').forEach(edges); }, 600);
}

export default {
  id: 'kitchen', icon: 'chef', perm: 'orders.view', refreshOn: ['orders'],
  render(el) {
    const size = sizePref();
    render(el, html`<div class="kds kds--${size}" id="kds">
      <header class="kds-head">
        <div class="kds-clock tabular" id="kds-clock">${clock(Date.now())}</div>
        <div class="kds-head__info"><b>${t('kitchenTitle')}</b><small class="muted">${A.printStation ? t('printStationOn') : t('printStationOff')}</small></div>
        <div class="seg kds-size" role="group" aria-label="${t('cardSize')}">${SIZES.map((k) => html`<button type="button" class="${size === k ? 'is-on' : ''}" data-kds-size="${k}" title="${t('cardSize')}: ${t('size_' + k)}"><span class="kds-a kds-a--${k}">A</span><span class="hide-sm">${t('size_' + k)}</span></button>`)}</div>
        <button class="btn btn--sm" id="kds-fs">${icon('maximize')} <span class="hide-sm">${document.fullscreenElement ? t('exitFullscreen') : t('fullscreen')}</span></button>
      </header>
      <div id="kds-body">${columns()}</div>
    </div>`);
    const kds = $('#kds', el);
    kds.addEventListener('click', (e) => {
      const more = e.target.closest('[data-more]');
      if (more) {
        const list = more.parentElement.querySelector('.kds-list');
        list.scrollBy({ top: Math.round(list.clientHeight * 0.85), behavior: 'smooth' });
        sfx('tap');
        return;
      }
      const b = e.target.closest('[data-kds-size]');
      if (!b) return;
      const k = b.dataset.kdsSize;
      setPref('mf.kdsSize', k);
      SIZES.forEach((x) => kds.classList.toggle('kds--' + x, x === k));
      el.querySelectorAll('[data-kds-size]').forEach((x) => x.classList.toggle('is-on', x === b));
      sfx('toggle');
      requestAnimationFrame(() => fit(el));
    });
    $('#kds-fs', el).addEventListener('click', async () => {
      sfx('tap');
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await kds.requestFullscreen();
      } catch {}
    });
    if (onResize) { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onResize); }
    onResize = () => requestAnimationFrame(() => fit(el));
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    requestAnimationFrame(() => bindLists(el));
    clearInterval(clockTimer);
    clockTimer = setInterval(() => { const c = document.getElementById('kds-clock'); if (c) c.textContent = clock(Date.now()); }, 10000);
  },
  update(el) {
    const body = $('#kds-body', el);
    if (!body) { this.render(el); return; }
    const keep = {};
    body.querySelectorAll('.kds-list').forEach((l) => { keep[l.dataset.list] = l.scrollTop; });
    render(body, columns());
    bindLists(el, keep);
  },
  destroy() {
    clearInterval(clockTimer);
    if (onResize) { window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onResize); onResize = null; }
    sizeWatch?.disconnect();
    sizeWatch = null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  },
};
