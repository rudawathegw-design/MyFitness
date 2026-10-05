// MY FITNESS — staff panel (Windows PC first, works on tablets & phones too).
import { html, render, $, $$, setTz, startOfDay } from '../core/util.js';
import { t, setLang, lang, LANGS, detectLang, clock } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { sfx, soundEnabled, setSound, unlock, audioReady } from '../core/sound.js';
import { createStore } from '../core/store.js';
import { mountCharts } from '../core/charts.js';
import { A, can, upsert, setPref, money } from './ctx.js';
import { toast, call, installOrderActions, tickTimers, printTickets, openOrder, whereText, modal, modalHead } from './ui.js';
import { VIEWS } from './views/index.js';
import { setLanBase } from '../core/receipt.js';

const root = $('#root');
const NAV = [
  { group: 'grp_live', items: ['dashboard', 'orders', 'kitchen', 'pos', 'requests'] },
  { group: 'grp_manage', items: ['menu', 'tables'] },
  { group: 'grp_insights', items: ['analytics'] },
  { group: 'grp_system', items: ['staff', 'logs', 'printer', 'settings'] },
];
const baseTitle = 'MY FITNESS · Staff';
let renderTimer = null, alertTimer = null, flashTimer = null, simTimer = null, releaseTimer = null;

document.documentElement.dataset.theme = (() => { try { return localStorage.getItem('mf.theme') || 'light'; } catch { return 'light'; } })();

async function boot() {
  try { A.store = await createStore(); } catch (e) { render(root, html`<div class="empty-state">${icon('alert')}<p>${String(e)}</p></div>`); return; }
  setLang(detectLang('en'), false);
  installOrderActions();
  A.store.on('*', onEvent);
  window.addEventListener('hashchange', () => { if (A.user) route(); });
  setInterval(tickTimers, 15000);
  // demo page can open the panel already signed in (demo mode only)
  const q = new URLSearchParams(location.search);
  if (!A.store.user && A.store.mode === 'local' && q.get('demo') === '1') {
    try { await A.store.login('admin', 'admin123'); } catch {}
  }
  if (A.store.user) { A.user = A.store.user; await startApp(); } else renderLogin();
}

/* ---------------- login ---------------- */
function renderLogin() {
  document.body.classList.add('is-login');
  const demo = A.store.mode === 'local' || A.store.health?.demo;
  render(root, html`<div class="login">
    <div class="login__glow"></div>
    <div class="login__card">
      <div class="login__logos"><img src="../assets/brand/logo-myfitness-160.webp" alt="MY FITNESS"><img src="../assets/brand/logo-ladies-160.webp" alt="MY FITNESS Ladies"></div>
      <div class="login__badge">${icon('shield')} ${t('staffPanel')}</div>
      <h1>${t('login')}</h1>
      <p class="muted">${t('loginSub')}</p>
      <form id="login-form" class="login__form" autocomplete="on">
        <label class="field"><span>${t('username')}</span><div class="input-icon">${icon('user')}<input class="input" name="u" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus></div></label>
        <label class="field"><span>${t('password')}</span><div class="input-icon pw">${icon('lock')}<input class="input" name="p" type="password" autocomplete="current-password" required><button type="button" class="pw__eye" data-eye aria-label="show">${icon('eye')}</button></div></label>
        <p class="err" id="login-err" hidden>${t('badLogin')}</p>
        <button class="btn btn--gold btn--lg btn--block" type="submit" id="login-btn">${icon('lock')}<span>${t('signIn')}</span></button>
      </form>
      ${demo ? html`<div class="login__demo"><p>${t('demoAccounts')}</p><div>${[['admin', 'admin123', 'role_owner'], ['manager', 'manager123', 'role_manager'], ['cashier', 'cashier123', 'role_cashier'], ['kitchen', 'kitchen123', 'role_kitchen']].map(([u, p, r]) => html`<button type="button" class="chip" data-fill="${u}" data-pw="${p}">${icon('user')}${t(r)}</button>`)}</div></div>` : ''}
      <div class="login__foot">
        <div class="seg">${LANGS.map((l) => html`<button type="button" class="${lang() === l.code ? 'is-on' : ''}" data-lang="${l.code}">${l.label}</button>`)}</div>
        <a href="../" class="login__back">${icon('arrowLeft', 'flip-rtl')} ${t('customerMenu')}</a>
      </div>
    </div>
  </div>`);
  const form = $('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    unlock();
    const btn = $('#login-btn');
    btn.classList.add('is-busy');
    $('#login-err').hidden = true;
    try {
      A.user = await A.store.login(form.u.value, form.p.value);
      sfx('success');
      document.body.classList.remove('is-login');
      await startApp();
      toast(t('welcomeBack', { name: A.user.name }), { ic: 'user' });
    } catch (err) {
      btn.classList.remove('is-busy');
      sfx('error');
      const el = $('#login-err');
      el.textContent = err.code === 'bad_login' ? t('badLogin') : err.code === 'network' ? t('err_network') : t('err_generic');
      el.hidden = false;
      form.querySelector('.login__form, .field:last-of-type .input')?.classList.add('is-error');
      setTimeout(() => form.querySelector('.is-error')?.classList.remove('is-error'), 900);
    }
  });
  root.querySelector('.login').addEventListener('click', (e) => {
    const f = e.target.closest('[data-fill]');
    if (f) { form.u.value = f.dataset.fill; form.p.value = f.dataset.pw; sfx('tap'); form.requestSubmit(); return; }
    const l = e.target.closest('[data-lang]');
    if (l) { setLang(l.dataset.lang); renderLogin(); return; }
    const eye = e.target.closest('[data-eye]');
    if (eye) { form.p.type = form.p.type === 'password' ? 'text' : 'password'; render(eye, icon(form.p.type === 'password' ? 'eye' : 'eyeOff')); }
  });
}

/* ---------------- app shell ---------------- */
async function startApp() {
  document.body.classList.remove('is-login');
  const h = A.store.health;
  if (A.store.mode === 'server' && h?.ips?.[0]) setLanBase(`http://${h.ips[0]}:${h.port}/`);
  await reload(true);
  renderShell();
  route();
  startTimers();
  if (A.store.mode === 'server') A.store.connect?.();
}
async function reload(full = false) {
  const b = await call('bootstrap');
  setTz(b.settings.tzOffset ?? 180);
  const prevOrders = full ? [] : A.d.orders;
  A.d = { ...A.d, settings: b.settings, categories: b.categories, items: b.items, tables: b.tables, users: b.users, requests: b.requests, meta: b.meta, orders: prevOrders };
  A.user = { ...A.user, ...b.me };
  const recent = await call('listOrders', { from: startOfDay(Date.now()) - 14 * 86400000 });
  const map = new Map(recent.map((o) => [o.id, o]));
  for (const o of b.orders) map.set(o.id, o);
  A.d.orders = [...map.values()].sort((x, y) => x.createdAt - y.createdAt);
}

function renderShell() {
  const u = A.user;
  render(root, html`<div class="shell">
    <aside class="side" id="side" aria-label="Navigation">
      <div class="side__head"><span class="side__title">${t('staffPanel')}</span><span class="mode-badge ${A.store.mode === 'server' ? 'is-server' : ''}">${A.store.mode === 'server' ? t('serverMode') : t('demoMode')}</span></div>
      <nav class="side__nav">${NAV.map((g) => {
        const items = g.items.filter((id) => VIEWS[id] && (!VIEWS[id].perm || can(VIEWS[id].perm)));
        return items.length ? html`<div class="side__group"><p>${t(g.group)}</p>${items.map((id) => html`<a class="side__link" href="#/${id}" data-nav="${id}">${icon(VIEWS[id].icon)}<span>${t('nav_' + id)}</span><b class="side__badge" data-badge="${id}" hidden></b></a>`)}</div>` : '';
      })}</nav>
      <div class="side__foot">
        <a class="side__link side__link--ext" href="../" target="_blank" rel="noopener">${icon('external')}<span>${t('customerMenu')}</span></a>
        <div class="me"><span class="me__av">${(u.name || u.username || '?').slice(0, 1).toUpperCase()}</span><div class="grow"><b>${u.name}</b><small>${t('role_' + u.role)}</small></div><button class="btn btn--ghost btn--icon btn--sm" id="logout" title="${t('logout')}" aria-label="${t('logout')}">${icon('logout', 'flip-rtl')}</button></div>
      </div>
    </aside>
    <div class="side-scrim" data-act="drawer"></div>
    <div class="main">
      <header class="top">
        <button class="btn btn--ghost btn--icon top__menu" data-act="drawer" aria-label="Menu">${icon('menu')}</button>
        <h1 class="top__title" id="top-title"></h1>
        <div class="top__actions">
          <span class="conn ${A.online ? '' : 'is-off'}" id="conn"><i></i><span>${A.online ? t('live') : t('reconnecting')}</span></span>
          ${can('settings.edit') ? html`<button class="open-toggle" id="t-open" data-on="${A.d.settings.ordering.open}"><span class="open-toggle__dot"></span><span class="open-toggle__lbl"></span></button>` : ''}
          <button class="btn btn--sm station ${A.printStation ? 'is-on' : ''}" id="t-station" title="${A.printStation ? t('printStationOn') : t('printStationOff')}">${icon('printer')}<span class="hide-sm">${t('printStation')}</span></button>
          <button class="btn btn--sm btn--icon" id="t-sound" title="${t('sound')}" aria-label="${t('sound')}">${icon(soundEnabled() ? 'volume' : 'volumeX')}</button>
          <button class="btn btn--sm btn--icon" id="t-lang" title="${t('language')}" aria-label="${t('language')}">${icon('globe')}</button>
          <button class="btn btn--sm btn--icon" id="t-theme" title="${t('theme')}" aria-label="${t('theme')}">${icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')}</button>
        </div>
      </header>
      <div id="banners"></div>
      <main class="view" id="view"></main>
    </div>
  </div>`);
  updateOpenToggle();
  renderBanners();
  $('#logout').addEventListener('click', async () => { await A.store.logout(); A.user = null; stopTimers(); location.hash = ''; renderLogin(); });
  root.querySelector('.shell').addEventListener('click', onShellClick);
}
function onShellClick(e) {
  const b = e.target.closest('button, [data-act]');
  if (!b) return;
  if (b.dataset.act === 'drawer') { document.body.classList.toggle('drawer-open'); return; }
  switch (b.id) {
    case 't-open': toggleOrdering(); break;
    case 't-station': toggleStation(); break;
    case 't-sound': setSound(!soundEnabled()); render(b, icon(soundEnabled() ? 'volume' : 'volumeX')); sfx('toggle'); renderBanners(); askNotify(); break;
    case 't-lang': openLangMenu(); break;
    case 't-theme': {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next; setPref('mf.theme', next);
      render(b, icon(next === 'light' ? 'moon' : 'sun')); sfx('toggle');
      renderView();
      break;
    }
    default: break;
  }
}
function updateOpenToggle() {
  const b = $('#t-open');
  if (!b) return;
  const on = !!A.d.settings.ordering.open;
  b.dataset.on = on;
  b.querySelector('.open-toggle__lbl').textContent = on ? t('orderingOpen') : t('orderingClosed');
}
async function toggleOrdering() {
  const on = !A.d.settings.ordering.open;
  try {
    A.d.settings = await call('saveSettings', { ordering: { ...A.d.settings.ordering, open: on } });
    sfx(on ? 'success' : 'toggle');
    updateOpenToggle(); renderBanners();
  } catch {}
}
function toggleStation() {
  A.printStation = !A.printStation;
  setPref('mf.printStation', A.printStation ? '1' : '0');
  const b = $('#t-station');
  b.classList.toggle('is-on', A.printStation);
  b.title = A.printStation ? t('printStationOn') : t('printStationOff');
  unlock();
  sfx('toggle');
  toast(A.printStation ? t('printStationOn') : t('printStationOff'), { ic: 'printer', type: A.printStation ? 'ok' : 'info' });
  askNotify();
  if (A.view?.id === 'printer') renderView();
}
function openLangMenu() {
  const m = modal(html`${modalHead(t('language'), 'globe')}<div class="modal__body lang-menu">${LANGS.map((l) => html`<button class="lang-opt ${lang() === l.code ? 'is-on' : ''}" data-l="${l.code}"><b>${l.label}</b>${lang() === l.code ? icon('checkCircle') : ''}</button>`)}</div>`, { cls: 'modal--sm' });
  m.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-l]');
    if (!b) return;
    setLang(b.dataset.l);
    m.close();
    renderShell();
    route();
  });
}
function renderBanners() {
  const el = $('#banners');
  if (!el) return;
  const out = [];
  if (soundEnabled() && !audioReady()) out.push(html`<button class="banner banner--gold" id="b-sound">${icon('volume')}<span>${t('enableSound')}</span></button>`);
  if (!A.d.settings.ordering.open) out.push(html`<div class="banner banner--red">${icon('alert')}<span>${t('orderingClosedBanner')}</span></div>`);
  if (A.store.mode === 'server' && A.user?.defaultPw) out.push(html`<a class="banner banner--red" href="#/staff">${icon('lock')}<span>${t('defaultPwWarn')}</span></a>`);
  if (A.simulate) out.push(html`<div class="banner banner--violet">${icon('zap')}<span>${t('simOn')}</span></div>`);
  render(el, out);
  $('#b-sound')?.addEventListener('click', () => { unlock(); setTimeout(() => { sfx('success'); renderBanners(); }, 150); askNotify(); });
}
function askNotify() {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {}
}

/* ---------------- routing ---------------- */
const defaultView = () => (A.user.role === 'kitchen' ? 'kitchen' : A.user.role === 'cashier' ? 'orders' : 'dashboard');
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const ok = path && VIEWS[path] && (!VIEWS[path].perm || can(VIEWS[path].perm));
  const id = ok ? path : defaultView();
  if (!ok && path) { location.replace('#/' + id); return; }
  A.route = { id, q: new URLSearchParams(qs || '') };
  if (A.view && A.view.id !== id) {
    A.view.destroy?.();
    const v = $('#view');
    if (v) v.onclick = v.oninput = v.onchange = v.onsubmit = v.onkeydown = null;
  }
  A.view = VIEWS[id];
  $$('[data-nav]').forEach((a) => a.classList.toggle('is-on', a.dataset.nav === id));
  const tt = $('#top-title');
  if (tt) tt.textContent = t('nav_' + id);
  document.body.dataset.view = id;
  document.body.classList.remove('drawer-open');
  renderView(true);
}
function renderView(enter = false) {
  const el = $('#view');
  if (!el || !A.view) return;
  if (enter) { el.classList.remove('view-in'); void el.offsetWidth; el.classList.add('view-in'); window.scrollTo(0, 0); }
  A.view.render(el);
  mountCharts(el);
  updateBadges();
}
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => { if (A.view?.update) A.view.update($('#view')); else renderView(); mountCharts($('#view')); }, 120);
}
function updateBadges() {
  const active = A.d.orders.filter((o) => o.status === 'new').length;
  const reqs = A.d.requests.filter((r) => r.status === 'open').length;
  const set = (id, n) => { const b = $(`[data-badge="${id}"]`); if (b) { b.hidden = !n; b.textContent = n; } };
  set('orders', active); set('kitchen', active); set('requests', reqs);
}

/* ---------------- realtime ---------------- */
async function onEvent(evt) {
  if (!A.user && evt.type !== 'auth.expired') return;
  let kind = null;
  switch (evt.type) {
    case 'order.created':
      upsert(A.d.orders, evt.order); kind = 'orders';
      if (evt.order.status === 'new') newOrderAlert(evt.order, 'new');
      else if (evt.order.status === 'scheduled') { sfx('soft'); toast(t('schedOrderToast', { n: evt.order.no, when: clock(evt.order.scheduledFor) }), { type: 'info', ic: 'calendar', sub: whereText(evt.order) }); }
      break;
    case 'order.released': upsert(A.d.orders, evt.order); kind = 'orders'; newOrderAlert(evt.order, 'released'); break;
    case 'order.updated':
      upsert(A.d.orders, evt.order); kind = evt.quiet ? null : 'orders';
      if (evt.order.status !== 'new') A.unacked.delete(evt.order.id);
      break;
    case 'request.created':
      upsert(A.d.requests, evt.request); kind = 'requests';
      sfx('bell');
      toast(t('callingFor', { t: t('table', { t: evt.request.table }), type: t('req_' + evt.request.type) }), { type: 'warn', ic: 'service', ms: 8000, action: t('done'), onAction: () => call('resolveRequest', { id: evt.request.id }).catch(() => {}) });
      notify(t('callingFor', { t: t('table', { t: evt.request.table }), type: t('req_' + evt.request.type) }), t('floor_' + evt.request.floor));
      break;
    case 'request.updated': upsert(A.d.requests, evt.request); kind = 'requests'; break;
    case 'menu.updated': case 'tables.updated': case 'settings.updated': case 'users.updated':
      await reload().catch(() => {}); kind = evt.type.split('.')[0];
      updateOpenToggle(); renderBanners();
      break;
    case 'data.reset': await reload(true).catch(() => {}); kind = 'all'; break;
    case 'auth.expired': A.user = null; stopTimers(); renderLogin(); toast(t('sessionExpired'), { type: 'err' }); return;
    case 'connection': {
      const was = A.online;
      A.online = evt.online;
      const c = $('#conn');
      if (c) { c.classList.toggle('is-off', !A.online); c.querySelector('span').textContent = A.online ? t('live') : t('reconnecting'); }
      if (A.online && !was) { await reload(true).catch(() => {}); kind = 'all'; } else return;
      break;
    }
    default: return;
  }
  updateBadges();
  syncAlerts();
  if (kind && A.view && (kind === 'all' || (A.view.refreshOn || []).includes(kind))) scheduleRender();
}
function itemsSummary(o) { return o.items.map((l) => `${l.qty}× ${l.name?.en || ''}`).join(', '); }
function newOrderAlert(o, why) {
  if (o.source === 'pos' && o.staff === A.user?.username) return;
  A.unacked.add(o.id);
  sfx('alert');
  toast(t(why === 'released' ? 'releasedToast' : 'newOrderToast', { n: o.no, where: whereText(o) }), { type: 'warn', ic: 'bell', sub: `${itemsSummary(o)} · ${money(o.total)}`, ms: 8000, action: t('details'), onAction: () => openOrder(o.id) });
  notify(`🔔 #${o.no} · ${whereText(o)}`, itemsSummary(o));
  syncAlerts();
  if (A.printStation && !o.printed?.kitchen) autoPrint(o);
}
async function autoPrint(o) {
  const p = A.d.settings.printer || {};
  const kinds = [];
  if (p.printKitchen !== false) kinds.push('kitchen');
  if (p.printReceipt) kinds.push('receipt');
  if (kinds.length) await printTickets(o, kinds, { auto: true });
}
function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) new Notification(title, { body, icon: '../assets/icons/icon-192.png', silent: false });
  } catch {}
}
/** Keep ringing (every 12 s, up to 3 min) and flash the tab title until new orders are accepted. */
function syncAlerts() {
  for (const id of [...A.unacked]) {
    const o = A.d.orders.find((x) => x.id === id);
    if (!o || o.status !== 'new' || Date.now() - (o.times?.new || o.createdAt) > 180000) A.unacked.delete(id);
  }
  const n = A.unacked.size;
  $$('.ocard').forEach((el) => el.classList.toggle('is-alert', A.unacked.has(el.dataset.oid)));
  if (n && !alertTimer) alertTimer = setInterval(() => { syncAlerts(); if (A.unacked.size) sfx('alert'); }, 12000);
  if (!n && alertTimer) { clearInterval(alertTimer); alertTimer = null; }
  if (n && !flashTimer) {
    let on = false;
    flashTimer = setInterval(() => { on = !on; document.title = on ? `🔔 (${A.unacked.size}) ${t('col_new')} — MY FITNESS` : baseTitle; }, 1100);
  }
  if (!n && flashTimer) { clearInterval(flashTimer); flashTimer = null; document.title = baseTitle; }
}

/* ---------------- timers: release scheduled orders, demo simulator ---------------- */
function startTimers() {
  stopTimers();
  if (A.store.mode === 'local') {
    const tick = () => A.store.releaseDue().catch(() => {});
    tick();
    releaseTimer = setInterval(tick, 15000);
  }
  scheduleSim();
}
function stopTimers() {
  clearInterval(releaseTimer); releaseTimer = null;
  clearTimeout(simTimer); simTimer = null;
}
export function scheduleSim() {
  clearTimeout(simTimer);
  if (!A.simulate || !A.user) return;
  simTimer = setTimeout(async () => {
    try { await A.store.call('simulateOrder'); } catch {}
    scheduleSim();
  }, 32000 + Math.random() * 22000);
}
window.addEventListener('mf:sim', () => { scheduleSim(); renderBanners(); });
document.addEventListener('pointerdown', () => { if (soundEnabled() && !audioReady()) { unlock(); setTimeout(renderBanners, 200); } }, { once: false, passive: true });

boot();
