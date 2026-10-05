// MY FITNESS — customer QR menu (mobile first).
import { html, raw, render, $, $$, fmtNum, clamp, debounce, validPhone, normPhone, fmtPhone, clone, setTz, dayKey, addDays, weekdayOf, bizTs } from '../core/util.js';
import { t, L, setLang, lang, LANGS, detectLang, hasSavedLang, clock, whenLabel, dateShort, weekdayName } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { sfx, haptic, soundEnabled, setSound, unlock } from '../core/sound.js';
import { createStore } from '../core/store.js';
import { scheduleSlots, isOpenNow } from '../core/service.js';

const app = $('#app');
const layer = $('#layer');
const toastsEl = $('#toasts');
const cartRoot = $('#cartbar-root');

const S = {
  store: null,
  menu: null,
  cart: [],
  filters: new Set(),
  search: '',
  table: null,
  menuRendered: false,
  sheet: null,
  sheetFromMenu: false,
  route: null,
  trackUnsub: null,
  trackTimer: null,
  checkout: null,
};

/* ---------------- tiny persistence ---------------- */
const ls = (k, v) => {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null');
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
  } catch { return null; }
};
const saveCart = () => ls('mf.cart', { at: Date.now(), items: S.cart });
const loadCart = () => { const c = ls('mf.cart'); return c && Date.now() - c.at < 8 * 3600e3 ? c.items || [] : []; };
const myOrders = () => ls('mf.myOrders') || [];
function rememberOrder(o, token) {
  const list = myOrders().filter((x) => x.id !== o.id);
  list.unshift({ id: o.id, token, no: o.no, at: o.createdAt });
  ls('mf.myOrders', list.slice(0, 12));
}

/* ---------------- helpers ---------------- */
const cur = () => 'IQD'; // Iraqi Dinar in every language
const price = (n) => html`<span class="price">${fmtNum(n)}<small>${cur()}</small></span>`;
const itemById = (id) => S.menu.items.find((i) => i.id === id);
const catById = (id) => S.menu.categories.find((c) => c.id === id);
const img = (src, w, h) => S.store.img(src, w, h);
const tableById = (id) => S.menu.tables.find((x) => x.id === id);
const floorName = (f) => (f ? t('floor_' + f) : '');
const settings = () => S.menu.settings;
const fmtHM = (hm) => clock(bizTs(dayKey(), hm));

function toast(msg, { type = 'ok', sub = '', ic, ms = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  render(el, html`<div class="toast__ic">${icon(ic || (type === 'err' ? 'alert' : type === 'info' ? 'info' : 'check'))}</div><div class="toast__body">${msg}${sub ? html`<small>${sub}</small>` : ''}</div>`);
  toastsEl.appendChild(el);
  setTimeout(() => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 320); }, ms);
}

function lineKey(id, options, note) {
  const o = Object.keys(options || {}).sort().map((k) => `${k}:${[].concat(options[k]).sort().join('+')}`).join(',');
  return `${id}|${o}|${(note || '').trim()}`;
}
function unitPrice(item, options) {
  let p = item.price;
  for (const g of item.options || []) {
    const sel = [].concat(options?.[g.id] || []);
    for (const cid of sel) { const c = g.choices.find((x) => x.id === cid); if (c) p += c.price || 0; }
  }
  return p;
}
function defaultOptions(item) {
  const o = {};
  for (const g of item.options || []) if (g.type === 'one' && g.required && g.choices[0]) o[g.id] = g.choices[0].id;
  return o;
}
const cartCount = () => S.cart.reduce((a, l) => a + l.qty, 0);
const cartTotal = () => S.cart.reduce((a, l) => { const it = itemById(l.id); return a + (it ? unitPrice(it, l.options) * l.qty : 0); }, 0);
const qtyOf = (id) => S.cart.filter((l) => l.id === id).reduce((a, l) => a + l.qty, 0);
function totals() {
  const sub = cartTotal();
  const s = settings().charges || {};
  const r = (n) => Math.round(n / 250) * 250;
  const service = r((sub * (s.servicePct || 0)) / 100);
  const tax = r((sub * (s.taxPct || 0)) / 100);
  return { sub, service, tax, total: sub + service + tax };
}
function optionText(item, options) {
  const out = [];
  for (const g of item.options || []) for (const cid of [].concat(options?.[g.id] || [])) { const c = g.choices.find((x) => x.id === cid); if (c) out.push(L(c.name)); }
  return out.join(' · ');
}

function addToCart(id, options, qty = 1, note = '', fromEl) {
  const it = itemById(id);
  if (!it || it.available === false) return;
  const key = lineKey(id, options, note);
  const ex = S.cart.find((l) => l.key === key);
  if (ex) ex.qty = clamp(ex.qty + qty, 1, 50);
  else S.cart.push({ key, id, options: clone(options || {}), qty, note: note.trim() });
  saveCart();
  sfx('add'); haptic(12);
  if (fromEl) flyToCart(fromEl, it);
  updateCartUI(true);
}
function changeLine(key, delta) {
  const l = S.cart.find((x) => x.key === key);
  if (!l) return;
  l.qty += delta;
  if (l.qty <= 0) S.cart = S.cart.filter((x) => x.key !== key);
  saveCart();
  sfx(delta > 0 ? 'pop' : 'remove'); haptic(8);
  updateCartUI(delta > 0);
}
function removeOneOf(id) {
  for (let i = S.cart.length - 1; i >= 0; i--) if (S.cart[i].id === id) { changeLine(S.cart[i].key, -1); return; }
}

/* ---------------- boot ---------------- */
async function boot() {
  S.store = await createStore();
  try {
    S.menu = await S.store.call('menu');
  } catch (e) {
    render(app, html`<div class="fatal">${icon('wifi')}<h2>${t('err_network')}</h2><button class="btn btn--gold" onclick="location.reload()">${icon('refresh')} OK</button></div>`);
    return;
  }
  setTz(settings().tzOffset ?? 180);
  setLang(detectLang(settings().defaultLang || 'ckb'), false);
  document.title = `${L(settings().brand?.cafeName)} · ${t('scanToOrder')}`;
  S.cart = loadCart().filter((l) => itemById(l.id));

  // table from the QR code (?t=L5)
  const q = new URLSearchParams(location.search);
  const qt = (q.get('t') || q.get('table') || '').toUpperCase();
  if (qt && tableById(qt)) {
    S.table = qt;
    ls('mf.table', { id: qt, at: Date.now() });
    q.delete('t'); q.delete('table');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  } else {
    const saved = ls('mf.table');
    if (saved && Date.now() - saved.at < 6 * 3600e3 && tableById(saved.id)) S.table = saved.id;
  }

  // live updates
  S.store.on('menu.updated', refreshMenu);
  S.store.on('settings.updated', refreshMenu);
  S.store.on('tables.updated', refreshMenu);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshMenu(); });
  setInterval(refreshMenu, 120000);

  window.addEventListener('hashchange', route);
  route();
  if (!hasSavedLang()) showWelcome();
}

async function refreshMenu() {
  try {
    const m = await S.store.call('menu');
    S.menu = m;
    S.cart = S.cart.filter((l) => itemById(l.id));
    saveCart();
    if (S.route === 'menu' || S.route === 'item' || S.route === 'cart') { S.menuRendered = false; renderMenu(); }
    updateCartUI();
  } catch {}
}

/* ---------------- routing ---------------- */
function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, query] = h.split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(query || '') };
}
function route() {
  const { parts, q } = parseHash();
  const page = parts[0] || 'menu';
  const prev = S.route;
  S.route = page;
  if (S.trackUnsub && page !== 'order') { S.trackUnsub(); S.trackUnsub = null; clearInterval(S.trackTimer); }
  if (page === 'menu' || page === 'item' || page === 'cart') {
    if (!S.menuRendered) renderMenu();
    if (page === 'item') openItem(parts[1], q.get('edit'));
    else if (page === 'cart') openCart();
    else closeSheet(false);
    S.sheetFromMenu = page !== 'menu' && (prev === 'menu' || prev === 'item' || prev === 'cart') && prev !== null;
  } else {
    closeSheet(false);
    S.menuRendered = false;
    if (page === 'checkout') renderCheckout();
    else if (page === 'order') renderTracking(parts[1], q.get('k'), q.get('new') === '1');
    else if (page === 'orders') renderMyOrders();
    else location.replace('#/');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }
  updateCartUI();
}
const go = (h) => { location.hash = h; };
function back() {
  if (S.sheetFromMenu) history.back(); else location.replace('#/');
}

/* ---------------- welcome / language ---------------- */
function showWelcome() {
  const ov = document.createElement('div');
  ov.className = 'welcome';
  const tb = S.table ? tableById(S.table) : null;
  render(ov, html`<div class="welcome__glow"></div>
    <div class="welcome__card">
      <img class="welcome__emblem" src="assets/icons/icon-192.png" alt="" width="96" height="96">
      <p class="welcome__hi"><span>بەخێربێیت</span> · <span>أهلاً بك</span> · <span>Welcome</span></p>
      <h1 class="welcome__title">MY FITNESS <em>Café</em></h1>
      ${tb ? html`<p class="welcome__table">${icon('utensils')} ${tb.name} · ${floorName(tb.floor)}</p>` : ''}
      <div class="welcome__langs">${LANGS.map((l, i) => html`<button class="welcome__lang" data-lang="${l.code}" style="--d:${i}"><b>${l.label}</b><span>${l.code === 'ckb' ? 'Kurdî · Sorani' : l.code === 'ar' ? 'Arabic' : 'English'}</span>${icon('arrowRight')}</button>`)}</div>
    </div>`);
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    unlock();
    setLang(b.dataset.lang, true);
    sfx('success'); haptic(15);
    ov.classList.add('is-leaving');
    setTimeout(() => ov.remove(), 500);
    S.menuRendered = false;
    route();
  });
}
function openLanguage() {
  const sh = openSheet(html`<div class="sheet__grab"></div>
    <div class="sheet__scroll pad"><h2 class="sheet-title">${icon('globe')} ${t('language')}</h2>
      <div class="lang-list">${LANGS.map((l) => html`<button class="lang-opt ${lang() === l.code ? 'is-on' : ''}" data-lang="${l.code}"><b>${l.label}</b>${lang() === l.code ? icon('checkCircle') : ''}</button>`)}</div></div>`, { cls: 'sheet--small' });
  sh.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lang]');
    if (!b) return;
    setLang(b.dataset.lang, true);
    sfx('toggle');
    closeSheet(true);
    S.menuRendered = false;
    route();
  });
}

/* ---------------- menu page ---------------- */
function statusInfo() {
  const s = settings();
  const open = isOpenNow(s, Date.now());
  return { open, canSchedule: !!s.ordering?.allowSchedule, paused: !s.ordering?.open };
}
function heroImgs() {
  const f = S.menu.items.filter((i) => i.featured && i.img).slice(0, 3);
  const extra = S.menu.items.filter((i) => i.img && !f.includes(i));
  return [...f, ...extra].slice(0, 3);
}
function activeOrder() {
  const o = myOrders()[0];
  return o && Date.now() - o.at < 5 * 3600e3 ? o : null;
}
function filteredItems(catId) {
  const qv = S.search.trim().toLowerCase();
  return S.menu.items.filter((i) => {
    if (catId && i.cat !== catId) return false;
    if (S.filters.has('protein') && !(i.tags || []).includes('protein') && (i.protein || 0) < 25) return false;
    if (S.filters.has('light') && !((i.kcal || 0) > 0 && i.kcal < 400)) return false;
    if (S.filters.has('veg') && !(i.tags || []).includes('veg')) return false;
    if (qv) {
      const hay = [i.name?.en, i.name?.ckb, i.name?.ar, i.desc?.en, i.desc?.ckb, i.desc?.ar].join(' ').toLowerCase();
      if (!hay.includes(qv)) return false;
    }
    return true;
  });
}
function tagChips(item, max = 2) {
  const map = { popular: ['flame', 'tag_popular'], protein: ['dumbbell', 'tag_protein'], veg: ['leaf', 'tag_veg'], new: ['sparkles', 'tag_new'], spicy: ['flame', 'tag_spicy'] };
  return (item.tags || []).slice(0, max).map((tg) => html`<span class="tag tag--${tg}">${icon(map[tg]?.[0] || 'tag')}${t(map[tg]?.[1] || tg)}</span>`);
}
function cardAdd(item) {
  if (item.available === false) return html`<span class="soldout">${t('soldOut')}</span>`;
  const q = qtyOf(item.id);
  return q
    ? html`<div class="stepper stepper--card" data-id="${item.id}"><button data-act="dec" data-id="${item.id}" aria-label="−">${icon('minus')}</button><b class="tabular">${q}</b><button data-act="inc" data-id="${item.id}" aria-label="+">${icon('plus')}</button></div>`
    : html`<button class="add-btn" data-act="quick" data-id="${item.id}" aria-label="${t('add')} ${L(item.name)}">${icon('plus')}</button>`;
}
function itemCard(item, i = 0) {
  const cat = catById(item.cat);
  return html`<article class="card reveal ${item.available === false ? 'is-out' : ''}" data-card="${item.id}" style="--d:${i % 6}">
    <button class="card__main" data-act="open" data-id="${item.id}">
      <div class="card__img ph" data-icon="${cat?.icon || 'utensils'}">${icon(cat?.icon || 'utensils', 'ph__ic')}${item.img ? html`<img src="${img(item.img, 300)}" alt="" loading="lazy" decoding="async">` : ''}${item.featured ? html`<span class="card__star">${icon('star')}</span>` : ''}</div>
      <div class="card__body">
        <div class="card__tags">${tagChips(item)}</div>
        <h3 class="card__name">${L(item.name)}</h3>
        <p class="card__desc">${L(item.desc)}</p>
        <div class="card__meta">${item.kcal ? html`<span>${icon('flame')}${item.kcal} ${t('kcal')}</span>` : ''}${item.protein ? html`<span>${icon('dumbbell')}${item.protein}g</span>` : ''}</div>
        <div class="card__price">${price(item.price)}</div>
      </div>
    </button>
    <div class="card__add" data-add="${item.id}">${cardAdd(item)}</div>
  </article>`;
}
function featuredCard(item, i) {
  return html`<article class="feat reveal" style="--d:${i}" data-card="${item.id}">
    <button class="feat__main" data-act="open" data-id="${item.id}">
      <div class="feat__img ph">${icon(catById(item.cat)?.icon || 'utensils', 'ph__ic')}<img src="${img(item.img, 640, 420)}" alt="" loading="lazy" decoding="async"></div>
      <div class="feat__shade"></div>
      <div class="feat__info">
        <div class="card__tags">${tagChips(item, 1)}</div>
        <h3>${L(item.name)}</h3>
        <div class="feat__meta"><span>${item.kcal} ${t('kcal')}</span><span>${item.protein}g ${t('protein')}</span></div>
      </div>
    </button>
    <div class="feat__bottom">${price(item.price)}<div class="card__add" data-add="${item.id}">${cardAdd(item)}</div></div>
  </article>`;
}

function renderMenu() {
  const s = settings();
  const st = statusInfo();
  const tb = S.table ? tableById(S.table) : null;
  const ao = activeOrder();
  const feats = S.menu.items.filter((i) => i.featured);
  const prep = s.ordering?.prepMinutes || 15;
  render(app, html`<div class="page page--menu">
    <section class="hero">
      <div class="hero__glow hero__glow--gold"></div><div class="hero__glow hero__glow--red"></div>
      <div class="hero__bar">
        <span class="pill ${st.open ? 'pill--open' : 'pill--closed'}"><i></i>${st.open ? t('openNow') : t('closedNow')} <small>${fmtHM(s.hours.open)} – ${fmtHM(s.hours.close)}</small></span>
        <div class="hero__tools">
          <button class="icon-btn" data-act="lang" aria-label="${t('language')}">${icon('globe')}<span>${LANGS.find((l) => l.code === lang())?.short}</span></button>
          <button class="icon-btn" data-act="sound" aria-label="${t('sound')}">${icon(soundEnabled() ? 'volume' : 'volumeX')}</button>
          <button class="icon-btn" data-act="theme" aria-label="${t('theme')}">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')}</button>
        </div>
      </div>
      <p class="hero__kicker">${L(s.printer?.header) || t('heroKicker')}</p>
      <h1 class="hero__title"><span class="hero__line">${t('heroTitle1')}</span><span class="hero__line hero__line--gold">${t('heroTitle2')}</span></h1>
      <p class="hero__sub">${t('heroSub')}</p>
      <div class="hero__chips">
        <button class="pill pill--table" data-act="table">${icon('utensils')}${tb ? html`${t('table', { t: tb.name })} · ${floorName(tb.floor)}` : t('chooseTable')}</button>
        <span class="pill">${icon('clock')}${t('readyIn', { n: prep })}</span>
      </div>
      <div class="hero__floats" aria-hidden="true">${heroImgs().map((it, i) => html`<div class="hero__float f${i}"><img src="${img(it.img, 260)}" alt="" decoding="async"></div>`)}</div>
      ${ao ? html`<a class="active-order" href="#/order/${ao.id}?k=${ao.token}"><span class="active-order__pulse"></span><span class="grow"><b>${t('orderNo')} #${ao.no}</b><small>${t('track')}</small></span>${icon('arrowRight')}</a>` : ''}
      ${!st.open ? html`<div class="notice">${icon('info')}<span>${st.canSchedule ? t('closedSchedule') : t('orderingPaused')}</span></div>` : ''}
    </section>

    <div class="toolbar" id="toolbar">
      <label class="search">${icon('search')}<input type="search" id="q" value="${S.search}" placeholder="${t('searchPh')}" autocomplete="off" enterkeyhint="search"></label>
      <nav class="cats" id="cats" aria-label="${t('categories')}">
        ${feats.length ? html`<button class="cat-chip" data-act="cat" data-cat="featured">${icon('star')}${t('featured')}</button>` : ''}
        ${S.menu.categories.map((c) => html`<button class="cat-chip" data-act="cat" data-cat="${c.id}">${icon(c.icon || 'utensils')}${L(c.name)}</button>`)}
      </nav>
    </div>
    <div class="filters" role="group">
      ${[['protein', 'dumbbell', 'f_protein'], ['light', 'flame', 'f_light'], ['veg', 'leaf', 'f_veg']].map(([k, ic, lb]) => html`<button class="chip ${S.filters.has(k) ? 'is-on' : ''}" data-act="filter" data-f="${k}" aria-pressed="${S.filters.has(k)}">${icon(ic)}${t(lb)}</button>`)}
    </div>

    <div id="sections">${renderSections()}</div>

    <footer class="foot">
      <h2 class="foot__title">${t('footerTitle')}</h2>
      <div class="foot__floors">
        <div class="floor floor--men"><img src="assets/brand/logo-myfitness-160.webp" alt="MY FITNESS" loading="lazy"><p>${t('footerMen')}</p></div>
        <div class="floor floor--ladies"><img src="assets/brand/logo-ladies-160.webp" alt="MY FITNESS Ladies" loading="lazy"><p>${t('footerLadies')}</p></div>
      </div>
      <div class="foot__contact">
        <a class="btn btn--outline" href="tel:${(s.brand?.phone || '').replace(/\s/g, '')}">${icon('phone')}<span dir="ltr">${s.brand?.phone}</span></a>
        <span class="foot__addr">${icon('pin')}${L(s.brand?.address) || t('address')}</span>
      </div>
      <div class="foot__links"><a href="#/orders">${icon('receipt')}${t('myOrders')}</a><a href="admin/">${icon('lock')}${t('staffPanel')}</a>${S.store.mode === 'local' ? html`<a href="demo.html">${icon('monitor')}Demo</a>` : ''}</div>
      <p class="foot__small">© MY FITNESS · Ranya</p>
    </footer>
  </div>`);
  S.menuRendered = true;
  bindMenu();
}
function renderSections() {
  const feats = S.menu.items.filter((i) => i.featured);
  const anyFilter = S.filters.size || S.search.trim();
  let n = 0;
  const secs = S.menu.categories.map((c) => {
    const list = filteredItems(c.id);
    n += list.length;
    if (!list.length) return '';
    return html`<section class="sec" id="cat-${c.id}" data-sec="${c.id}">
      <header class="sec__head reveal"><span class="sec__ic">${icon(c.icon || 'utensils')}</span><div><h2>${L(c.name)}</h2>${L(c.tagline) ? html`<p class="sec__tag">${L(c.tagline)}</p>` : ''}</div></header>
      <div class="grid">${list.map((it, i) => itemCard(it, i))}</div>
    </section>`;
  });
  return html`${!anyFilter && feats.length ? html`<section class="sec sec--feat" id="cat-featured" data-sec="featured">
      <header class="sec__head reveal"><span class="sec__ic sec__ic--star">${icon('star')}</span><div><h2>${t('featured')}</h2><p class="sec__tag">${t('featuredSub')}</p></div></header>
      <div class="feat-row">${feats.map(featuredCard)}</div></section>` : ''}
    ${secs}
    ${!n ? html`<div class="empty">${icon('search')}<p>${t('noResults')}</p><button class="btn btn--outline" data-act="clear-filters">${icon('x')} ${t('clearFilters')}</button></div>` : ''}`;
}
function rerenderSections() {
  render($('#sections'), renderSections());
  observeReveal();
  observeSections();
}

let revealIO = null, secIO = null;
function observeReveal() {
  revealIO?.disconnect();
  revealIO = new IntersectionObserver((ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el) => revealIO.observe(el));
}
function observeSections() {
  secIO?.disconnect();
  const chips = $$('.cat-chip');
  secIO = new IntersectionObserver((ents) => {
    ents.forEach((e) => {
      if (!e.isIntersecting) return;
      const id = e.target.dataset.sec;
      chips.forEach((c) => c.classList.toggle('is-on', c.dataset.cat === id));
      const on = chips.find((c) => c.dataset.cat === id);
      if (on) { const bar = on.parentElement; bar.scrollTo({ left: on.offsetLeft + on.offsetWidth / 2 - bar.clientWidth / 2, behavior: 'smooth' }); }
    });
  }, { rootMargin: `-${Math.round(window.innerHeight * 0.3)}px 0px -60% 0px` });
  $$('[data-sec]').forEach((s) => secIO.observe(s));
}

function bindMenu() {
  observeReveal();
  observeSections();
  const q = $('#q');
  q?.addEventListener('input', debounce(() => { S.search = q.value; rerenderSections(); }, 180));
}
function refreshCardAdds(id) {
  $$(`[data-add${id ? `="${id}"` : ''}]`).forEach((el) => { const it = itemById(el.dataset.add); if (it) render(el, cardAdd(it)); });
}

/* ---------------- global click handling ---------------- */
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (!a) return;
  const act = a.dataset.act;
  const id = a.dataset.id;
  switch (act) {
    case 'open': sfx('open'); go(`#/item/${id}`); break;
    case 'quick': {
      const it = itemById(id);
      addToCart(id, defaultOptions(it), 1, '', a);
      toast(L(it.name), { sub: t('added'), ic: 'bag', ms: 1800 });
      refreshCardAdds(id);
      break;
    }
    case 'inc': { const it = itemById(id); addToCart(id, defaultOptions(it), 1, '', a); refreshCardAdds(id); break; }
    case 'dec': removeOneOf(id); refreshCardAdds(id); break;
    case 'cat': {
      sfx('tap');
      const sec = document.getElementById('cat-' + a.dataset.cat);
      if (sec) {
        const off = ($('.brandbar')?.offsetHeight || 60) + ($('#toolbar')?.offsetHeight || 60);
        window.scrollTo({ top: sec.getBoundingClientRect().top + window.scrollY - off - 8, behavior: 'smooth' });
      }
      break;
    }
    case 'filter': {
      const f = a.dataset.f;
      S.filters.has(f) ? S.filters.delete(f) : S.filters.add(f);
      a.classList.toggle('is-on', S.filters.has(f));
      a.setAttribute('aria-pressed', S.filters.has(f));
      sfx('toggle'); haptic(6);
      rerenderSections();
      break;
    }
    case 'clear-filters': S.filters.clear(); S.search = ''; sfx('tap'); S.menuRendered = false; renderMenu(); break;
    case 'lang': sfx('tap'); openLanguage(); break;
    case 'sound': setSound(!soundEnabled()); render(a, icon(soundEnabled() ? 'volume' : 'volumeX')); sfx('toggle'); break;
    case 'table': sfx('tap'); openTablePicker(); break;
    case 'theme': {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem('mf.theme', next); } catch {}
      render(a, icon(next === 'dark' ? 'sun' : 'moon'));
      sfx('toggle'); haptic(6);
      break;
    }
    case 'cart': sfx('open'); go('#/cart'); break;
    case 'close-sheet': sfx('tap'); back(); break;
    default: break;
  }
});
// ripple on buttons
document.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.btn, .add-btn, .chip, .cat-chip, .opt, .choice');
  if (!b) return;
  const r = b.getBoundingClientRect();
  const s = Math.max(r.width, r.height);
  const sp = document.createElement('span');
  sp.className = 'ripple';
  sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
  if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
  b.style.overflow = 'hidden';
  b.appendChild(sp);
  setTimeout(() => sp.remove(), 650);
}, { passive: true });
// fade images in; show icon placeholder if a photo fails
document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('is-loaded'); }, true);
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.classList.add('is-broken'); }, true);

/* ---------------- sheets ---------------- */
function openSheet(content, { cls = '' } = {}) {
  closeSheet(false);
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  const sh = document.createElement('div');
  sh.className = `sheet ${cls}`;
  sh.setAttribute('role', 'dialog');
  sh.setAttribute('aria-modal', 'true');
  render(sh, content);
  layer.append(bd, sh);
  document.body.classList.add('no-scroll');
  bd.addEventListener('click', () => { if (S.route === 'item' || S.route === 'cart') back(); else closeSheet(true); });
  S.sheet = { bd, sh };
  enableSwipe(sh);
  setTimeout(() => sh.querySelector('[autofocus]')?.focus(), 350);
  return sh;
}
function closeSheet(animated = true) {
  const s = S.sheet;
  if (!s) return;
  S.sheet = null;
  document.body.classList.remove('no-scroll');
  if (!animated) { s.bd.remove(); s.sh.remove(); return; }
  s.bd.classList.add('is-leaving'); s.sh.classList.add('is-leaving');
  setTimeout(() => { s.bd.remove(); s.sh.remove(); }, 300);
}
function enableSwipe(sh) {
  if (window.matchMedia('(min-width: 760px)').matches) return;
  const grab = sh.querySelector('.sheet__grab');
  const scroller = sh.querySelector('.sheet__scroll');
  let y0 = null, dy = 0;
  const start = (e) => {
    if (scroller && scroller.scrollTop > 0 && !e.target.closest('.sheet__grab, .sheet__head')) return;
    y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none';
  };
  const move = (e) => {
    if (y0 == null) return;
    dy = Math.max(0, e.touches[0].clientY - y0);
    if (dy > 4) { sh.style.transform = `translateY(${dy}px)`; if (e.cancelable && dy > 10) e.preventDefault(); }
  };
  const end = () => {
    if (y0 == null) return;
    sh.style.transition = '';
    if (dy > 110) { if (S.route === 'item' || S.route === 'cart') back(); else closeSheet(true); }
    else sh.style.transform = '';
    y0 = null;
  };
  (grab?.parentElement || sh).addEventListener('touchstart', start, { passive: true });
  sh.addEventListener('touchmove', move, { passive: false });
  sh.addEventListener('touchend', end);
}

/* ---------------- item sheet ---------------- */
function openItem(id, editKey) {
  const it = itemById(id);
  if (!it) { location.replace('#/'); return; }
  const editing = editKey ? S.cart.find((l) => l.key === editKey) : null;
  const st = { qty: editing?.qty || 1, options: clone(editing?.options || defaultOptions(it)), note: editing?.note || '' };
  const cat = catById(it.cat);
  const macro = (k, label, max, unit = 'g') => html`<div class="macro"><div class="macro__top"><b>${it[k] || 0}${unit}</b><span>${label}</span></div><div class="macro__bar"><i style="width:${Math.min(100, ((it[k] || 0) / max) * 100)}%"></i></div></div>`;
  const sh = openSheet(html`
    <div class="sheet__grab"></div>
    <button class="sheet__x" data-act="close-sheet" aria-label="${t('close')}">${icon('x')}</button>
    <div class="sheet__scroll">
      <div class="item-hero ph">${icon(cat?.icon || 'utensils', 'ph__ic')}${it.img ? html`<img src="${img(it.img, 900, 640)}" alt="${L(it.name)}" decoding="async">` : ''}</div>
      <div class="item-body">
        <div class="card__tags">${tagChips(it, 4)}</div>
        <h2 class="item-title" id="item-title">${L(it.name)}</h2>
        <p class="item-desc">${L(it.desc)}</p>
        <div class="item-price-row">${price(it.price)}${it.kcal ? html`<span class="kcal-big">${icon('flame')}<b>${it.kcal}</b> ${t('kcal')}</span>` : ''}</div>
        ${it.protein || it.carbs || it.fat ? html`<div class="macros">${macro('protein', t('protein'), 60)}${macro('carbs', t('carbs'), 120)}${macro('fat', t('fat'), 50)}</div>` : ''}
        <div id="opts">${(it.options || []).map((g) => html`<fieldset class="opt-group" data-g="${g.id}">
          <legend><span>${L(g.name)}</span><small class="${g.required ? 'req' : ''}">${g.required ? t('required') : t('optional')} · ${g.type === 'one' ? t('choose1') : t('chooseUpTo', { n: g.max || g.choices.length })}</small></legend>
          <div class="opt-list">${g.choices.map((c) => {
            const checked = [].concat(st.options[g.id] || []).includes(c.id);
            return html`<label class="opt ${checked ? 'is-on' : ''}"><input type="${g.type === 'one' ? 'radio' : 'checkbox'}" name="g-${g.id}" value="${c.id}" ${checked ? raw('checked') : ''}><span class="opt__box"></span><span class="opt__name">${L(c.name)}</span>${c.price ? html`<span class="opt__price">+${fmtNum(c.price)}</span>` : ''}</label>`;
          })}</div></fieldset>`)}</div>
        <label class="field note-field"><span>${icon('note')} ${t('note')}</span><textarea class="textarea" id="item-note" maxlength="140" rows="2" placeholder="${t('notePh')}">${st.note}</textarea></label>
      </div>
    </div>
    <div class="sheet__foot item-foot">
      <div class="stepper stepper--lg"><button data-q="-1" aria-label="−">${icon('minus')}</button><b id="iq" class="tabular">${st.qty}</b><button data-q="1" aria-label="+">${icon('plus')}</button></div>
      <button class="btn btn--gold btn--lg grow" id="add-item" ${it.available === false ? raw('disabled') : ''}>${it.available === false ? t('soldOut') : html`${icon(editing ? 'check' : 'bag')}<span class="add-lbl">${editing ? t('updateItem') : t('add')}</span><span class="add-total tabular" id="it-total"></span>`}</button>
    </div>`, { cls: 'item-sheet' });

  const totalEl = $('#it-total', sh);
  const upd = () => { if (totalEl) totalEl.textContent = `${fmtNum(unitPrice(it, st.options) * st.qty)} ${cur()}`; $('#iq', sh).textContent = st.qty; };
  upd();
  sh.addEventListener('change', (e) => {
    const inp = e.target;
    const fs = inp.closest('[data-g]');
    if (!fs) return;
    const g = it.options.find((x) => x.id === fs.dataset.g);
    if (g.type === 'one') st.options[g.id] = inp.value;
    else {
      let arr = [].concat(st.options[g.id] || []);
      if (inp.checked) arr.push(inp.value); else arr = arr.filter((v) => v !== inp.value);
      if (g.max && arr.length > g.max) { const drop = arr.shift(); const dEl = fs.querySelector(`input[value="${drop}"]`); if (dEl) dEl.checked = false; }
      st.options[g.id] = arr;
    }
    fs.querySelectorAll('.opt').forEach((l) => l.classList.toggle('is-on', l.querySelector('input').checked));
    sfx('toggle'); haptic(5);
    upd();
  });
  sh.addEventListener('click', (e) => {
    const qb = e.target.closest('[data-q]');
    if (qb) { st.qty = clamp(st.qty + Number(qb.dataset.q), 1, 50); sfx(Number(qb.dataset.q) > 0 ? 'pop' : 'remove'); upd(); $('#iq', sh).animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' }); }
  });
  $('#add-item', sh)?.addEventListener('click', (e) => {
    st.note = $('#item-note', sh).value;
    if (editing) S.cart = S.cart.filter((l) => l.key !== editing.key);
    addToCart(it.id, st.options, st.qty, st.note, e.currentTarget);
    toast(L(it.name), { sub: t('added'), ic: 'bag', ms: 1800 });
    refreshCardAdds(it.id);
    if (editing) { location.replace('#/cart'); } else back();
  });
}

/* ---------------- cart ---------------- */
function cartLineHTML(l) {
  const it = itemById(l.id);
  if (!it) return '';
  const ot = optionText(it, l.options);
  return html`<li class="line" data-key="${l.key}">
    <button class="line__img ph" data-edit="${l.key}">${icon(catById(it.cat)?.icon || 'utensils', 'ph__ic')}${it.img ? html`<img src="${img(it.img, 140)}" alt="" loading="lazy">` : ''}</button>
    <div class="line__body">
      <button class="line__name" data-edit="${l.key}">${L(it.name)}</button>
      ${ot ? html`<p class="line__opts">${ot}</p>` : ''}
      ${l.note ? html`<p class="line__note">${icon('note')}${l.note}</p>` : ''}
      <div class="line__bottom">${price(unitPrice(it, l.options) * l.qty)}
        <div class="stepper"><button data-line="${l.key}" data-d="-1" aria-label="−">${icon(l.qty === 1 ? 'trash' : 'minus')}</button><b class="tabular">${l.qty}</b><button data-line="${l.key}" data-d="1" aria-label="+">${icon('plus')}</button></div>
      </div>
    </div>
  </li>`;
}
function macrosOfCart() {
  const m = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const l of S.cart) { const it = itemById(l.id); if (!it) continue; for (const k in m) m[k] += (it[k] || 0) * l.qty; }
  return m;
}
function cartSheetHTML() {
  const tt = totals();
  const m = macrosOfCart();
  const n = cartCount();
  return html`<div class="sheet__grab"></div>
    <div class="sheet__head"><h2>${icon('bag')} ${t('yourOrder')}</h2><span class="muted">${n === 1 ? t('itemCount1') : t('itemsCount', { n })}</span><button class="sheet__x sheet__x--static" data-act="close-sheet" aria-label="${t('close')}">${icon('x')}</button></div>
    <div class="sheet__scroll pad">
      ${S.cart.length ? html`<ul class="lines">${S.cart.map(cartLineHTML)}</ul>
        <div class="macro-sum"><p>${icon('dumbbell')} ${t('macrosTitle')}</p><div><span><b>${fmtNum(m.kcal)}</b>${t('kcal')}</span><span><b>${m.protein}g</b>${t('protein')}</span><span><b>${m.carbs}g</b>${t('carbs')}</span><span><b>${m.fat}g</b>${t('fat')}</span></div></div>
        <button class="btn btn--outline btn--block" data-act="close-sheet">${icon('plus')} ${t('continueShopping')}</button>`
      : html`<div class="empty empty--cart"><div class="empty__ic">${icon('bag')}</div><p>${t('cartEmpty')}</p><button class="btn btn--gold" data-act="close-sheet">${t('backToMenu')}</button></div>`}
    </div>
    ${S.cart.length ? html`<div class="sheet__foot">
      <div class="sum">${tt.service ? html`<div><span>${t('subtotal')}</span><b>${fmtNum(tt.sub)}</b></div><div><span>${t('service')}</span><b>${fmtNum(tt.service)}</b></div>` : ''}${tt.tax ? html`<div><span>${t('tax')}</span><b>${fmtNum(tt.tax)}</b></div>` : ''}<div class="sum__total"><span>${t('total')}</span>${price(tt.total)}</div></div>
      <button class="btn btn--gold btn--lg btn--block" id="to-checkout">${t('checkout')} ${icon('arrowRight', 'flip-rtl')}</button>
    </div>` : ''}`;
}
function openCart() {
  const sh = openSheet(cartSheetHTML(), { cls: 'cart-sheet' });
  sh.addEventListener('click', (e) => {
    const d = e.target.closest('[data-line]');
    if (d) { changeLine(d.dataset.line, Number(d.dataset.d)); return; }
    const ed = e.target.closest('[data-edit]');
    if (ed) { const l = S.cart.find((x) => x.key === ed.dataset.edit); if (l) { sfx('open'); location.replace(`#/item/${l.id}?edit=${encodeURIComponent(l.key)}`); } return; }
    if (e.target.closest('#to-checkout')) { sfx('tap'); location.replace('#/checkout'); }
  });
}
function rerenderCartSheet() {
  if (S.route !== 'cart' || !S.sheet) return;
  const sc = S.sheet.sh.querySelector('.sheet__scroll');
  const top = sc ? sc.scrollTop : 0;
  render(S.sheet.sh, cartSheetHTML());
  const sc2 = S.sheet.sh.querySelector('.sheet__scroll');
  if (sc2) sc2.scrollTop = top;
}

function updateCartUI(bump = false) {
  const n = cartCount();
  const show = n > 0 && (S.route === 'menu' || S.route === 'item');
  let bar = $('.cartbar', cartRoot);
  if (!show) { if (bar) { bar.classList.add('is-leaving'); setTimeout(() => bar.remove(), 280); } }
  else {
    if (!bar || bar.classList.contains('is-leaving')) {
      cartRoot.innerHTML = '';
      bar = document.createElement('button');
      bar.className = 'cartbar';
      bar.dataset.act = 'cart';
      cartRoot.appendChild(bar);
    }
    render(bar, html`<span class="cartbar__ic">${icon('bag')}<b class="cartbar__n tabular">${n}</b></span><span class="cartbar__lbl">${t('viewCart')}</span><span class="cartbar__total tabular">${fmtNum(totals().total)} <small>${cur()}</small></span>`);
    if (bump) { bar.classList.remove('bump'); void bar.offsetWidth; bar.classList.add('bump'); }
  }
  rerenderCartSheet();
  if (S.route === 'menu' || S.route === 'cart' || S.route === 'item') refreshCardAdds();
}
function flyToCart(fromEl, item) {
  const target = $('.cartbar__ic') || $('.cartbar');
  const r0 = fromEl.getBoundingClientRect();
  const dot = document.createElement('div');
  dot.className = 'fly';
  if (item.img) dot.style.backgroundImage = `url("${img(item.img, 120)}")`;
  document.body.appendChild(dot);
  const x0 = r0.left + r0.width / 2 - 28, y0 = r0.top + r0.height / 2 - 28;
  requestAnimationFrame(() => {
    const tr = (target || fromEl).getBoundingClientRect();
    const x1 = tr.left + tr.width / 2 - 28, y1 = tr.top + tr.height / 2 - 28;
    const midX = (x0 + x1) / 2, midY = Math.min(y0, y1) - 120;
    dot.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0}px) scale(1.05)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${midX}px, ${midY}px) scale(.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(.25)`, opacity: 0.4 },
    ], { duration: 720, easing: 'cubic-bezier(.45,.05,.3,1)' }).onfinish = () => dot.remove();
  });
}

/* ---------------- table picker ---------------- */
function openTablePicker(onPick) {
  const floors = ['ladies', 'men'].filter((f) => S.menu.tables.some((x) => x.floor === f));
  const sh = openSheet(html`<div class="sheet__grab"></div>
    <div class="sheet__head"><h2>${icon('utensils')} ${t('chooseTable')}</h2><button class="sheet__x sheet__x--static" data-close aria-label="${t('close')}">${icon('x')}</button></div>
    <div class="sheet__scroll pad">${floors.map((f) => html`<h3 class="mini-title">${floorName(f)}</h3>
      <div class="table-grid">${S.menu.tables.filter((x) => x.floor === f).map((x) => html`<button class="table-btn ${S.table === x.id ? 'is-on' : ''}" data-tb="${x.id}"><b>${x.name}</b><small>${x.zone || ''}</small></button>`)}</div>`)}</div>`, { cls: 'sheet--small' });
  sh.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeSheet(true); return; }
    const b = e.target.closest('[data-tb]');
    if (!b) return;
    S.table = b.dataset.tb;
    ls('mf.table', { id: S.table, at: Date.now() });
    sfx('toggle'); haptic(8);
    closeSheet(true);
    if (onPick) onPick(S.table);
    else { S.menuRendered = false; renderMenu(); }
  });
}

/* ---------------- checkout ---------------- */
function renderCheckout() {
  if (!S.cart.length) { location.replace('#/'); return; }
  const s = settings();
  const o = s.ordering || {};
  const st = statusInfo();
  const saved = ls('mf.customer') || {};
  if (!S.checkout) S.checkout = { name: saved.name || '', phone: saved.phone || '', remember: true, when: st.open ? 'now' : 'later', day: null, slot: null, type: S.table && o.allowDineIn !== false ? 'dinein' : o.allowPickup ? 'pickup' : 'dinein', payment: (o.payments || ['cash'])[0], note: '' };
  const C = S.checkout;
  if (!st.open) C.when = 'later';
  const slotDays = o.allowSchedule ? scheduleSlots(s, Date.now()) : [];
  if (C.when === 'later' && !C.day && slotDays[0]) C.day = slotDays[0].day;
  const dayObj = slotDays.find((d) => d.day === C.day) || slotDays[0];
  if (C.slot && !slotDays.some((d) => d.slots.includes(C.slot))) C.slot = null;
  const tt = totals();
  const tb = S.table ? tableById(S.table) : null;
  const todayKey = dayKey(), tomorrowKey = addDays(todayKey, 1);
  const dayLabel = (d) => (d.day === todayKey ? t('today') : d.day === tomorrowKey ? t('tomorrow') : `${weekdayName(weekdayOf(d.slots[0]), lang(), true)} ${dateShort(d.slots[0])}`);
  const canPlace = st.open || (o.allowSchedule && slotDays.length);
  render(app, html`<div class="page page--checkout">
    <header class="page-head"><button class="icon-btn" data-back aria-label="${t('back')}">${icon('arrowLeft', 'flip-rtl')}</button><h1>${t('checkout')}</h1><span class="page-head__n">${cartCount()}</span></header>
    <form class="co" id="co" novalidate>
      <section class="co-card reveal is-in">
        <h2><span class="co-step">1</span>${t('yourDetails')}</h2>
        <p class="co-hint">${icon('shield')}${t('noAccount')}</p>
        <label class="field"><span>${t('name')}${o.requireName ? ' *' : ''}</span><div class="input-icon">${icon('user')}<input class="input" id="c-name" name="name" autocomplete="name" maxlength="40" value="${C.name}" placeholder="${t('namePh')}" required></div><small class="err" id="e-name" hidden>${t('err_name')}</small></label>
        <label class="field"><span>${t('phone')}${o.requirePhone ? ' *' : ''}</span><div class="input-icon">${icon('phone')}<input class="input" id="c-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" maxlength="18" value="${C.phone}" placeholder="${t('phonePh')}"></div><small class="err" id="e-phone" hidden>${t('err_phone')}</small></label>
        <label class="check"><input type="checkbox" id="c-remember" ${C.remember ? raw('checked') : ''}><span>${t('remember')}</span></label>
      </section>

      ${o.allowSchedule ? html`<section class="co-card reveal is-in">
        <h2><span class="co-step">2</span>${t('whenTitle')}</h2>
        <div class="choice-row">
          <button type="button" class="choice ${C.when === 'now' ? 'is-on' : ''}" data-when="now" ${st.open ? '' : raw('disabled')}>${icon('zap')}<b>${t('now')}</b><small>${st.open ? t('readyIn', { n: o.prepMinutes || 15 }) : t('closedNow')}</small></button>
          <button type="button" class="choice ${C.when === 'later' ? 'is-on' : ''}" data-when="later">${icon('calendar')}<b>${t('later')}</b><small>${t('laterSub')}</small></button>
        </div>
        ${C.when === 'later' ? html`<div class="sched">
          ${slotDays.length ? html`<p class="label">${t('pickDay')}</p>
          <div class="day-row">${slotDays.map((d) => html`<button type="button" class="day-chip ${dayObj && d.day === dayObj.day ? 'is-on' : ''}" data-day="${d.day}">${dayLabel(d)}</button>`)}</div>
          <p class="label">${t('pickTime')}</p>
          <div class="slot-grid">${(dayObj?.slots || []).map((ts) => html`<button type="button" class="slot ${C.slot === ts ? 'is-on' : ''}" data-slot="${ts}">${clock(ts)}</button>`)}</div>
          <small class="err" id="e-time" hidden>${t('err_time')}</small>
          <p class="co-notice">${icon('chef')}${t('scheduleNotice')}</p>` : html`<p class="co-notice">${t('noSlots')}</p>`}
        </div>` : ''}
      </section>` : ''}

      <section class="co-card reveal is-in">
        <h2><span class="co-step">${o.allowSchedule ? 3 : 2}</span>${t('whereTitle')}</h2>
        <div class="choice-row">
          ${o.allowDineIn !== false ? html`<button type="button" class="choice ${C.type === 'dinein' ? 'is-on' : ''}" data-type="dinein">${icon('utensils')}<b>${t('dinein')}</b><small>${tb ? `${t('table', { t: tb.name })} · ${floorName(tb.floor)}` : t('chooseTable')}</small></button>` : ''}
          ${o.allowPickup ? html`<button type="button" class="choice ${C.type === 'pickup' ? 'is-on' : ''}" data-type="pickup">${icon('store')}<b>${t('pickup')}</b><small>${t('counter')}</small></button>` : ''}
        </div>
        ${C.type === 'dinein' ? html`<button type="button" class="table-pick" data-pick-table>${icon('utensils')}<span class="grow">${tb ? html`<b>${t('table', { t: tb.name })}</b> · ${floorName(tb.floor)}` : t('chooseTable')}</span>${icon('chevronDown')}</button><small class="err" id="e-table" hidden>${t('err_table')}</small>` : ''}
      </section>

      <section class="co-card reveal is-in">
        <h2><span class="co-step">${o.allowSchedule ? 4 : 3}</span>${t('payment')}</h2>
        <div class="pay-row">${(o.payments || ['cash']).map((p) => html`<button type="button" class="pay ${C.payment === p ? 'is-on' : ''}" data-pay="${p}">${icon(p === 'cash' ? 'cash' : p === 'card' ? 'card' : 'wallet')}<b>${t('pay_' + p)}</b></button>`)}</div>
        <p class="co-hint">${icon('info')}${t('payNote')}</p>
        <label class="field"><span>${t('orderNote')}</span><textarea class="textarea" id="c-note" maxlength="240" rows="2" placeholder="${t('notePh')}">${C.note}</textarea></label>
      </section>

      <section class="co-card co-summary reveal is-in">
        <h2>${icon('receipt')} ${t('yourOrder')}</h2>
        <ul class="mini-lines">${S.cart.map((l) => { const it = itemById(l.id); return it ? html`<li><span class="q">${l.qty}×</span><span class="grow"><b>${L(it.name)}</b>${optionText(it, l.options) ? html`<small>${optionText(it, l.options)}</small>` : ''}</span><span class="tabular">${fmtNum(unitPrice(it, l.options) * l.qty)}</span></li>` : ''; })}</ul>
        <div class="sum">${tt.service ? html`<div><span>${t('service')}</span><b>${fmtNum(tt.service)}</b></div>` : ''}${tt.tax ? html`<div><span>${t('tax')}</span><b>${fmtNum(tt.tax)}</b></div>` : ''}<div class="sum__total"><span>${t('total')}</span>${price(tt.total)}</div></div>
      </section>
      <div class="co-space"></div>
    </form>
    <div class="co-foot"><button class="btn btn--gold btn--lg btn--block" id="place" ${canPlace ? '' : raw('disabled')}>${icon('send', 'flip-rtl')}<span>${canPlace ? t('placeOrder') : t('err_closed')}</span><span class="tabular add-total">${fmtNum(tt.total)} ${cur()}</span></button></div>
  </div>`);
  bindCheckout();
}
function bindCheckout() {
  const C = S.checkout;
  const page = $('.page--checkout');
  const keep = () => { C.name = $('#c-name').value; C.phone = $('#c-phone').value; C.note = $('#c-note').value; C.remember = $('#c-remember').checked; };
  page.addEventListener('input', keep);
  page.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-back')) { sfx('tap'); location.replace('#/cart'); return; }
    if (b.dataset.when) { keep(); C.when = b.dataset.when; sfx('toggle'); haptic(6); rerenderCheckout(); return; }
    if (b.dataset.day) { keep(); C.day = b.dataset.day; C.slot = null; sfx('tap'); rerenderCheckout(); return; }
    if (b.dataset.slot) { keep(); C.slot = Number(b.dataset.slot); sfx('toggle'); haptic(6); $$('.slot', page).forEach((x) => x.classList.toggle('is-on', x === b)); $('#e-time')?.setAttribute('hidden', ''); return; }
    if (b.dataset.type) { keep(); C.type = b.dataset.type; sfx('toggle'); rerenderCheckout(); return; }
    if (b.dataset.pay) { keep(); C.payment = b.dataset.pay; sfx('toggle'); $$('.pay', page).forEach((x) => x.classList.toggle('is-on', x === b)); return; }
    if (b.hasAttribute('data-pick-table')) { keep(); openTablePicker(() => rerenderCheckout()); return; }
    if (b.id === 'place') { e.preventDefault(); keep(); placeOrder(b); }
  });
  $('#c-phone').addEventListener('blur', (e) => { if (validPhone(e.target.value)) e.target.value = fmtPhone(e.target.value); });
}
function rerenderCheckout() {
  const y = window.scrollY;
  renderCheckout();
  window.scrollTo(0, y);
}
function showErr(id, inputId) {
  $('#' + id)?.removeAttribute('hidden');
  const inp = inputId && $('#' + inputId);
  if (inp) { inp.classList.add('is-error'); inp.focus({ preventScroll: true }); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(() => inp.classList.remove('is-error'), 1200); }
}
async function placeOrder(btn) {
  const C = S.checkout;
  const o = settings().ordering || {};
  $$('.err').forEach((x) => x.setAttribute('hidden', ''));
  let bad = false;
  if (o.requireName && C.name.trim().length < 2) { showErr('e-name', 'c-name'); bad = true; }
  if (!bad && (o.requirePhone || C.phone.trim()) && !validPhone(C.phone)) { showErr('e-phone', 'c-phone'); bad = true; }
  if (!bad && C.when === 'later' && !C.slot) { showErr('e-time'); $('.sched')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); bad = true; }
  if (!bad && C.type === 'dinein' && !S.table) { showErr('e-table'); openTablePicker(() => rerenderCheckout()); bad = true; }
  if (bad) { sfx('error'); haptic([30, 40, 30]); return; }
  if (C.remember) ls('mf.customer', { name: C.name.trim(), phone: normPhone(C.phone) }); else ls('mf.customer', null);
  btn.classList.add('is-busy');
  render(btn, html`<span class="spinner"></span><span>${t('placing')}</span>`);
  try {
    const res = await S.store.call('placeOrder', {
      items: S.cart.map((l) => ({ id: l.id, qty: l.qty, options: l.options, note: l.note })),
      customer: { name: C.name.trim(), phone: normPhone(C.phone) },
      type: C.type, table: C.type === 'dinein' ? S.table : null,
      when: C.when, scheduledFor: C.when === 'later' ? C.slot : null,
      payment: C.payment, note: C.note.trim(), lang: lang(),
    });
    rememberOrder(res.order, res.token);
    S.cart = []; saveCart();
    S.checkout = null;
    location.replace(`#/order/${res.order.id}?k=${res.token}&new=1`);
  } catch (e) {
    sfx('error');
    const code = e.code || e.message;
    const msg = code === 'invalid_phone' ? t('err_phone') : code === 'invalid_name' ? t('err_name') : code === 'invalid_table' ? t('err_table') : code === 'closed' ? t('err_closed')
      : code === 'item_unavailable' ? t('err_unavailable', { name: L(e.data?.name) }) : ['time_too_soon', 'outside_hours', 'invalid_time', 'time_too_far'].includes(code) ? t('err_time') : code === 'network' ? t('err_network') : t('err_generic');
    toast(msg, { type: 'err', ms: 4200 });
    if (code === 'item_unavailable') refreshMenu();
    rerenderCheckout();
  }
}

/* ---------------- tracking ---------------- */
const STEPS = ['scheduled', 'new', 'preparing', 'ready', 'completed'];
function statusArt(st) {
  const art = {
    scheduled: html`<div class="art art--sched">${icon('calendar')}<span class="art__tick"></span></div>`,
    new: html`<div class="art art--new">${icon('receipt')}</div>`,
    preparing: html`<div class="art art--prep"><div class="steam"><i></i><i></i><i></i></div>${icon('bowl')}</div>`,
    ready: html`<div class="art art--ready">${icon('bell')}</div>`,
    completed: html`<div class="art art--done"><svg viewBox="0 0 52 52" class="check-anim"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg></div>`,
    cancelled: html`<div class="art art--cancel">${icon('xCircle')}</div>`,
  };
  return art[st] || art.new;
}
function trackingHTML(o, isNew) {
  const steps = STEPS.filter((s) => s !== 'scheduled' || o.when === 'later');
  const idx = steps.indexOf(o.status);
  const eta = o.status === 'scheduled' ? o.scheduledFor : (o.times?.new || o.releasedAt || o.createdAt) + (o.prepMinutes || 15) * 60000;
  const desc = o.status === 'ready' ? t(o.type === 'dinein' ? 'sd_ready_dinein' : 'sd_ready_pickup') : o.status === 'scheduled' ? t('sd_scheduled', { time: clock(o.scheduledFor) }) : t('sd_' + o.status);
  return html`<div class="page page--track">
    ${isNew ? html`<div class="placed-banner"><span>${icon('checkCircle')}</span><div><b>${t('placed')}</b><small>${o.status === 'scheduled' ? t('placedSchedSub', { when: whenLabel(o.scheduledFor) }) : t('placedSub')}</small></div></div>` : ''}
    <div class="ticket st--${o.status}">
      <div class="ticket__top">
        <span class="ticket__lbl">${t('orderNo')}</span>
        <b class="ticket__no tabular">#${String(o.no).padStart(2, '0')}</b>
        <span class="badge st-${o.status}">${t('st_' + o.status)}</span>
      </div>
      <div class="ticket__cut"><i></i><i></i></div>
      <div class="ticket__status">
        ${statusArt(o.status)}
        <h2>${t('st_' + o.status)}</h2>
        <p>${desc}</p>
        ${['scheduled', 'new', 'preparing'].includes(o.status) ? html`<div class="eta">${icon('clock')}<span>${o.status === 'scheduled' ? t('scheduledFor', { when: whenLabel(o.scheduledFor) }) : `${t('estReady')}: ${clock(eta)}`}</span></div>` : ''}
      </div>
      ${o.status !== 'cancelled' ? html`<ol class="steps" style="--p:${Math.max(0, idx) / Math.max(1, steps.length - 1)}">${steps.map((s, i) => html`<li class="${i < idx ? 'is-done' : i === idx ? 'is-now' : ''}"><span class="steps__dot">${i < idx ? icon('check') : ''}</span><span class="steps__lbl">${t('st_' + s)}</span>${o.times?.[s] ? html`<small class="tabular">${clock(o.times[s])}</small>` : ''}</li>`)}</ol>` : ''}
      <div class="ticket__meta">
        <div>${icon(o.type === 'dinein' ? 'utensils' : 'store')}<span>${o.type === 'dinein' && o.table ? `${t('table', { t: o.table })} · ${floorName(o.floor)}` : t('pickup')}</span></div>
        ${o.customer?.name ? html`<div>${icon('user')}<span>${o.customer.name}</span></div>` : ''}
        <div>${icon('calendar')}<span>${dateShort(o.createdAt)} · ${clock(o.createdAt)}</span></div>
      </div>
      <ul class="mini-lines">${o.items.map((l) => html`<li><span class="q">${l.qty}×</span><span class="grow"><b>${L(l.name)}</b>${l.options?.length ? html`<small>${l.options.map((x) => L(x.cn)).join(' · ')}</small>` : ''}${l.note ? html`<small>“${l.note}”</small>` : ''}</span><span class="tabular">${fmtNum(l.total)}</span></li>`)}</ul>
      <div class="sum"><div class="sum__total"><span>${t('total')}</span>${price(o.total)}</div><div><span>${t('payment')}</span><b>${t('pay_' + o.payment.method)} · ${o.payment.status === 'paid' ? t('paid') : t('unpaid')}</b></div></div>
    </div>
    <div class="track-actions">
      ${o.type === 'dinein' && o.table && !['completed', 'cancelled'].includes(o.status) ? html`<button class="btn btn--outline btn--lg" data-call>${icon('service')} ${t('callStaff')}</button>` : ''}
      <button class="btn btn--gold btn--lg" data-again>${icon('refresh')} ${t('orderAgain')}</button>
      <a class="btn btn--ghost" href="#/">${icon('arrowLeft', 'flip-rtl')} ${t('backToMenu')}</a>
    </div>
    <p class="live-dot"><i></i>${t('liveUpdates')}</p>
  </div>`;
}
async function renderTracking(id, token, isNew) {
  if (!token) { const m = myOrders().find((x) => x.id === id); token = m?.token; }
  render(app, html`<div class="page page--track"><div class="skel" style="height:420px;border-radius:28px"></div></div>`);
  let order;
  try { order = await S.store.call('trackOrder', { id, token }); } catch { render(app, html`<div class="fatal">${icon('alert')}<h2>${t('err_generic')}</h2><a class="btn btn--gold" href="#/">${t('backToMenu')}</a></div>`); return; }
  let last = order;
  const paint = (o, first) => {
    render(app, trackingHTML(o, first && isNew));
    bindTracking(o, token);
  };
  paint(order, true);
  if (isNew) { sfx('success'); haptic([20, 40, 20]); confetti(); history.replaceState(null, '', `#/order/${id}?k=${token}`); }
  const onChange = (o) => {
    const pub = o.token ? { ...last, ...pickPublic(o) } : { ...last, ...o };
    if (pub.status !== last.status) {
      if (pub.status === 'ready') { sfx('ready'); haptic([60, 80, 60, 80, 120]); toast(t('st_ready'), { sub: t(pub.type === 'dinein' ? 'sd_ready_dinein' : 'sd_ready_pickup'), ic: 'bell', ms: 6000 }); }
      else if (pub.status === 'preparing') sfx('soft');
      else if (pub.status === 'new' && last.status === 'scheduled') sfx('soft');
    }
    if (pub.status !== last.status || pub.payment?.status !== last.payment?.status) { last = pub; paint(pub, false); }
  };
  S.trackUnsub = S.store.subscribeOrder(id, token, onChange);
  clearInterval(S.trackTimer);
  S.trackTimer = setInterval(async () => { try { onChange(await S.store.call('trackOrder', { id, token })); } catch {} }, 10000);
}
function pickPublic(o) { return { status: o.status, times: o.times, payment: { method: o.payment?.method, status: o.payment?.status }, releasedAt: o.releasedAt, scheduledFor: o.scheduledFor }; }
function bindTracking(o, token) {
  const page = $('.page--track');
  page.querySelector('[data-call]')?.addEventListener('click', () => openCallStaff(o));
  page.querySelector('[data-again]')?.addEventListener('click', () => {
    let added = 0;
    for (const l of o.items) {
      const it = itemById(l.id);
      if (!it || it.available === false) continue;
      const opts = {};
      for (const x of l.options || []) { const g = it.options?.find((gg) => gg.id === x.g); if (!g) continue; if (g.type === 'many') (opts[g.id] = opts[g.id] || []).push(x.c); else opts[g.id] = x.c; }
      const key = lineKey(l.id, opts, l.note);
      const ex = S.cart.find((c) => c.key === key);
      if (ex) ex.qty += l.qty; else S.cart.push({ key, id: l.id, options: opts, qty: l.qty, note: l.note || '' });
      added++;
    }
    saveCart();
    if (added) { sfx('add'); go('#/cart'); }
  });
}
function openCallStaff(o) {
  const sh = openSheet(html`<div class="sheet__grab"></div>
    <div class="sheet__scroll pad"><h2 class="sheet-title">${icon('service')} ${t('needAnything')}</h2>
      <div class="call-grid">${[['waiter', 'user'], ['bill', 'receipt'], ['water', 'water']].map(([k, ic]) => html`<button class="call-btn" data-req="${k}">${icon(ic)}<b>${t('req_' + k)}</b></button>`)}</div></div>`, { cls: 'sheet--small' });
  sh.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-req]');
    if (!b) return;
    b.classList.add('is-busy');
    try {
      await S.store.call('callStaff', { table: o.table, type: b.dataset.req, orderId: o.id });
      sfx('bell'); haptic(20);
      closeSheet(true);
      toast(t('staffNotified'), { ic: 'service' });
    } catch { sfx('error'); toast(t('err_generic'), { type: 'err' }); b.classList.remove('is-busy'); }
  });
}

/* ---------------- my orders ---------------- */
async function renderMyOrders() {
  const list = myOrders();
  render(app, html`<div class="page page--orders">
    <header class="page-head"><a class="icon-btn" href="#/" aria-label="${t('back')}">${icon('arrowLeft', 'flip-rtl')}</a><h1>${t('myOrders')}</h1></header>
    ${list.length ? html`<ul class="my-orders" id="my-orders">${list.map((o) => html`<li><a href="#/order/${o.id}?k=${o.token}" class="my-order"><b class="tabular">#${String(o.no).padStart(2, '0')}</b><span class="grow"><span>${dateShort(o.at)} · ${clock(o.at)}</span><small class="muted" data-st="${o.id}">…</small></span>${icon('chevronRight', 'flip-rtl')}</a></li>`)}</ul>`
      : html`<div class="empty empty--cart"><div class="empty__ic">${icon('receipt')}</div><p>${t('noOrdersYet')}</p><a class="btn btn--gold" href="#/">${t('backToMenu')}</a></div>`}
  </div>`);
  for (const o of list) {
    S.store.call('trackOrder', { id: o.id, token: o.token }).then((r) => {
      const el = document.querySelector(`[data-st="${o.id}"]`);
      if (el) render(el, html`<span class="badge st-${r.status}">${t('st_' + r.status)}</span> ${fmtNum(r.total)} ${cur()}`);
    }).catch(() => {});
  }
}

/* ---------------- confetti ---------------- */
function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const x = c.getContext('2d');
  x.scale(dpr, dpr);
  const colors = ['#ffc629', '#f2a900', '#e5121b', '#ffffff', '#ff6b6f'];
  const P = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.32,
    vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 13 - 4,
    s: 5 + Math.random() * 7, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    c: colors[(Math.random() * colors.length) | 0], shape: Math.random() < 0.3 ? 'c' : 'r',
  }));
  const t0 = performance.now();
  const step = (now) => {
    const el = now - t0;
    x.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of P) {
      p.vy += 0.32; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.max(0, 1 - el / 2800); x.fillStyle = p.c;
      if (p.shape === 'c') { x.beginPath(); x.arc(0, 0, p.s / 2.2, 0, Math.PI * 2); x.fill(); } else x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      x.restore();
    }
    if (el < 2900) requestAnimationFrame(step); else c.remove();
  };
  requestAnimationFrame(step);
}

boot();
