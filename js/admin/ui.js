// Staff-panel UI building blocks: toasts, modals, order cards & actions, printing.
import { html, raw, render, $, $$, fmtNum, fmtPhone, dayKey } from '../core/util.js';
import { t, L, clock, dateShort, whenLabel } from '../core/i18n.js';
import { icon } from '../core/icons.js';
import { sfx } from '../core/sound.js';
import { printOrder } from '../core/receipt.js';
import { A, money, can, tableById, setPref } from './ctx.js';

/* ---------------- toast ---------------- */
export function toast(msg, { type = 'ok', sub = '', ic, ms = 3600, action, onAction } = {}) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  render(el, html`<div class="toast__ic">${icon(ic || (type === 'err' ? 'alert' : type === 'info' ? 'info' : type === 'warn' ? 'bell' : 'check'))}</div><div class="toast__body">${msg}${sub ? html`<small>${sub}</small>` : ''}</div>${action ? html`<button>${action}</button>` : ''}`);
  box.appendChild(el);
  const kill = () => { el.classList.add('is-leaving'); setTimeout(() => el.remove(), 300); };
  el.querySelector('button')?.addEventListener('click', () => { onAction?.(); kill(); });
  setTimeout(kill, ms);
  return kill;
}

const ERRS = {
  forbidden: 'forbidden', auth_required: 'sessionExpired', category_not_empty: 'err_catNotEmpty', username_taken: 'err_usernameTaken',
  last_owner: 'err_lastOwner', password_short: 'err_passwordShort', invalid_username: 'err_invalidUsername', bad_password: 'err_badPassword',
  image_too_large: 'err_imageTooLarge', invalid_backup: 'err_invalidBackup', name_required: 'err_nameRequired', network: 'err_network',
  cannot_delete_self: 'err_deleteSelf', bad_transition: 'err_staleOrder', invalid_category: 'err_generic',
};
export const errText = (e) => t(ERRS[e?.code] || 'err_generic');
/** store.call with a friendly error toast. */
export async function call(method, args, { quiet = false } = {}) {
  try {
    return await A.store.call(method, args);
  } catch (e) {
    if (!quiet) { sfx('error'); toast(errText(e), { type: 'err', sub: e?.code && !ERRS[e.code] ? e.code : '' }); }
    throw e;
  }
}

/* ---------------- modal ---------------- */
export function modal(content, { cls = '', wide = false, onClose } = {}) {
  const layer = $('#layer');
  const bd = document.createElement('div');
  bd.className = 'backdrop';
  const el = document.createElement('div');
  el.className = `modal ${wide ? 'modal--wide' : ''} ${cls}`;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  render(el, content);
  layer.append(bd, el);
  document.body.classList.add('no-scroll');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    bd.classList.add('is-leaving'); el.classList.add('is-leaving');
    setTimeout(() => { bd.remove(); el.remove(); if (!$('#layer .modal')) document.body.classList.remove('no-scroll'); }, 220);
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape' && $$('#layer .modal').pop() === el) close(); };
  document.addEventListener('keydown', onKey);
  bd.addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  setTimeout(() => (el.querySelector('[autofocus]') || el.querySelector('input, select, textarea, button:not([data-close])'))?.focus?.(), 60);
  return { el, close, set: (c) => render(el, c) };
}
export const modalHead = (title, ic) => html`<header class="modal__head"><h2>${ic ? icon(ic) : ''}${title}</h2><button class="btn btn--ghost btn--icon" data-close aria-label="${t('close')}">${icon('x')}</button></header>`;

export function confirmBox(message, { ok = t('confirm'), danger = false, input = false, placeholder = '', sub = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal(html`<div class="modal__body confirm">
      <div class="confirm__ic ${danger ? 'is-danger' : ''}">${icon(danger ? 'alert' : 'info')}</div>
      <h3>${message}</h3>${sub ? html`<p class="muted">${sub}</p>` : ''}
      ${input ? html`<input class="input" id="cf-in" placeholder="${placeholder}" autofocus>` : ''}
      <div class="confirm__btns"><button class="btn" data-close>${t('cancel')}</button><button class="btn ${danger ? 'btn--red' : 'btn--gold'}" id="cf-ok">${ok}</button></div>
    </div>`, { cls: 'modal--sm', onClose: () => { if (!done) resolve(false); } });
    m.el.querySelector('#cf-ok').addEventListener('click', () => { done = true; resolve(input ? m.el.querySelector('#cf-in').value.trim() || true : true); m.close(); });
    m.el.querySelector('#cf-in')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') m.el.querySelector('#cf-ok').click(); });
  });
}

/* ---------------- orders ---------------- */
export const statusBadge = (st) => html`<span class="badge st-${st}">${t('st_' + st)}</span>`;
export const startOf = (o) => o.times?.new || o.releasedAt || o.createdAt;
export function elapsedMin(o, now = Date.now()) { return Math.max(0, Math.floor((now - startOf(o)) / 60000)); }
export function since(ts, now = Date.now()) {
  const m = Math.max(0, Math.floor((now - ts) / 60000));
  if (m < 60) return `${m}${t('minShort')}`;
  return `${Math.floor(m / 60)}h ${m % 60}${t('minShort')}`;
}
/** "due in 25 min" when soon, otherwise "Today 6:30 PM" / "Tomorrow 9:00 AM". */
export function dueLabel(ts, now = Date.now()) {
  const m = Math.round((ts - now) / 60000);
  if (m <= 0) return t('dueNow');
  return m <= 90 ? t('dueIn', { n: m }) : whenLabel(ts, now);
}
/** Short countdown for badges next to the clock time: "due in 25 min" / "in 3h 05m" / "Tomorrow 9:00 AM". */
export function dueShort(ts, now = Date.now()) {
  const m = Math.round((ts - now) / 60000);
  if (m <= 90 || dayKey(ts) !== dayKey(now)) return dueLabel(ts, now);
  return t('dueInH', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}
export function ageClass(o) {
  if (!['new', 'preparing'].includes(o.status)) return '';
  const m = elapsedMin(o);
  const prep = A.d.settings?.ordering?.prepMinutes || 15;
  return m >= prep ? 'is-late' : m >= prep * 0.6 ? 'is-warn' : '';
}
export function whereText(o) {
  if (o.type !== 'dinein' || !o.table) return t('pickupLabel');
  return `${t('table', { t: o.table })} · ${t('floor_' + (o.floor || tableById(o.table)?.floor || 'ladies'))}`;
}
export function nextAction(o) {
  switch (o.status) {
    case 'scheduled': return { st: 'new', label: t('act_release'), ic: 'send', cls: 'btn--outline' };
    case 'new': return { st: 'preparing', label: t('act_start'), ic: 'chef', cls: 'btn--gold' };
    case 'preparing': return { st: 'ready', label: t('act_ready'), ic: 'bell', cls: 'btn--green' };
    case 'ready': return { st: 'completed', label: o.type === 'dinein' ? t('act_served') : t('act_picked'), ic: 'checkCircle', cls: 'btn--outline' };
    default: return null;
  }
}
const optText = (l) => (l.options || []).map((x) => L(x.cn)).join(', ');
function struckKey(o, i) { return `${o.id}:${i}`; }

export function orderCard(o, { variant = 'board' } = {}) {
  const na = nextAction(o);
  const k = variant === 'kitchen';
  const sched = o.status === 'scheduled';
  return html`<article class="ocard ocard--${variant} st--${o.status} ${ageClass(o)} ${A.unacked.has(o.id) ? 'is-alert' : ''}" data-oid="${o.id}">
    <header class="ocard__head">
      <button class="ocard__no" data-oact="open" data-id="${o.id}">#${String(o.no).padStart(2, '0')}</button>
      <div class="ocard__where"><b>${whereText(o)}</b><small>${o.source === 'pos' ? t('src_pos') : t('src_qr')}${o.when === 'later' ? html` · ${icon('calendar')} ${clock(o.scheduledFor)}` : ''}</small></div>
      ${sched ? html`<span class="ocard__time is-sched" data-due="${o.scheduledFor}">${dueShort(o.scheduledFor)}</span>` : ['completed', 'cancelled'].includes(o.status) ? html`<span class="ocard__time">${clock(o.updatedAt)}</span>` : html`<span class="ocard__time" data-since="${startOf(o)}">${since(startOf(o))}</span>`}
    </header>
    ${o.customer?.name || o.customer?.phone ? html`<div class="ocard__cust">${icon('user')}<span>${o.customer.name || '—'}</span>${o.customer.phone && !k ? html`<a href="tel:${o.customer.phone}" dir="ltr">${fmtPhone(o.customer.phone)}</a>` : ''}</div>` : ''}
    <ul class="ocard__items">${o.items.map((l, i) => html`<li class="${A.struck[struckKey(o, i)] ? 'is-struck' : ''}" ${k ? raw(`data-strike="${struckKey(o, i)}"`) : ''}><b class="q">${l.qty}×</b><span><span class="n">${L(l.name)}</span>${optText(l) ? html`<small>${optText(l)}</small>` : ''}${l.note ? html`<em>» ${l.note}</em>` : ''}</span></li>`)}</ul>
    ${o.note ? html`<p class="ocard__note">${icon('note')}${o.note}</p>` : ''}
    ${!k ? html`<div class="ocard__money"><b>${money(o.total)}</b><span class="pay ${o.payment?.status === 'paid' ? 'is-paid' : ''}">${t('pay_' + (o.payment?.method || 'cash'))} · ${o.payment?.status === 'paid' ? t('paid') : t('unpaid')}</span></div>` : ''}
    <footer class="ocard__foot">
      ${na && can('orders.update') ? html`<button class="btn ${na.cls} btn--sm grow" data-oact="status" data-id="${o.id}" data-st="${na.st}">${icon(na.ic)}<span>${na.label}</span></button>` : html`<span class="grow">${statusBadge(o.status)}</span>`}
      <button class="btn btn--sm btn--icon" data-oact="print" data-id="${o.id}" data-kind="kitchen" title="${t('act_printTicket')}" aria-label="${t('act_printTicket')}">${icon('printer')}</button>
      <button class="btn btn--sm btn--icon" data-oact="open" data-id="${o.id}" title="${t('details')}" aria-label="${t('details')}">${icon('list')}</button>
    </footer>
  </article>`;
}

export async function setStatus(id, status, reason) {
  const o = await call('updateOrder', { id, status, reason });
  A.unacked.delete(id);
  sfx(status === 'ready' ? 'ready' : status === 'cancelled' ? 'remove' : status === 'completed' ? 'success' : 'pop');
  return o;
}

/** Print an order's tickets. kinds: ['kitchen'] / ['receipt'] / both. */
export async function printTickets(order, kinds, { auto = false, drawer = false } = {}) {
  const s = A.d.settings;
  try {
    await printOrder({ order, settings: s, kinds, store: A.store, drawer });
    for (const k of kinds) A.store.call('markPrinted', { id: order.id, kind: k }).catch(() => {});
    if ((s.printer?.mode || 'browser') !== 'browser') { sfx('print'); toast(t('printed'), { ic: 'printer', sub: `#${order.no} · ${kinds.map((k) => t(k === 'kitchen' ? 'act_printTicket' : 'act_printReceipt')).join(' + ')}`, ms: 2200 }); }
    return true;
  } catch (e) {
    sfx('error');
    toast(t('printFailed', { err: e.message || e }), { type: 'err', ms: 6000, action: auto ? null : t('setupGuide'), onAction: () => { location.hash = '#/printer'; } });
    return false;
  }
}

export function openOrder(id) {
  const o = A.d.orders.find((x) => x.id === id);
  if (!o) return;
  const steps = ['placed', 'new', 'preparing', 'ready', 'completed', 'cancelled'].filter((k) => o.times?.[k]);
  const na = nextAction(o);
  const m = modal(html`${modalHead(html`${t('order')} #${String(o.no).padStart(2, '0')} ${statusBadge(o.status)}`, 'receipt')}
    <div class="modal__body od">
      <div class="od__grid">
        <div class="od__box"><small>${t('type')}</small><b>${whereText(o)}</b></div>
        <div class="od__box"><small>${t('customer')}</small><b>${o.customer?.name || '—'}</b>${o.customer?.phone ? html`<a href="tel:${o.customer.phone}" dir="ltr">${fmtPhone(o.customer.phone)}</a>` : ''}</div>
        <div class="od__box"><small>${t('placedAt')}</small><b>${dateShort(o.createdAt)} · ${clock(o.createdAt)}</b></div>
        ${o.when === 'later' ? html`<div class="od__box od__box--sched"><small>${t('scheduledFor', { when: '' })}</small><b>${whenLabel(o.scheduledFor)}</b></div>` : ''}
        <div class="od__box"><small>${t('source')}</small><b>${o.source === 'pos' ? t('src_pos') : t('src_qr')}${o.staff ? ` · ${o.staff}` : ''}</b></div>
        <div class="od__box"><small>${t('payment')}</small><b>${t('pay_' + o.payment.method)} · ${o.payment.status === 'paid' ? t('paid') : t('unpaid')}</b></div>
      </div>
      <ul class="od__items">${o.items.map((l) => html`<li><b class="q">${l.qty}×</b><div class="grow"><b>${L(l.name)}</b>${l.options?.length ? html`<small>${l.options.map((x) => `${L(x.cn)}${x.price ? ` (+${fmtNum(x.price)})` : ''}`).join(' · ')}</small>` : ''}${l.note ? html`<em>» ${l.note}</em>` : ''}</div><span class="tabular">${fmtNum(l.total)}</span></li>`)}</ul>
      ${o.note ? html`<p class="ocard__note">${icon('note')}${o.note}</p>` : ''}
      <div class="od__totals">${o.service ? html`<div><span>${t('service')}</span><b>${fmtNum(o.service)}</b></div>` : ''}${o.tax ? html`<div><span>${t('tax')}</span><b>${fmtNum(o.tax)}</b></div>` : ''}<div class="od__total"><span>${t('total')}</span><b>${money(o.total)}</b></div></div>
      <h4 class="od__h">${t('timeline')}</h4>
      <ol class="od__tl">${steps.map((k) => html`<li><i class="st-${k === 'placed' ? 'scheduled' : k}"></i><span>${k === 'placed' ? t('placedAt') : t('st_' + k)}</span><small class="tabular">${clock(o.times[k])}</small></li>`)}</ol>
      ${o.cancelReason ? html`<p class="muted">${t('reason')}: ${o.cancelReason}</p>` : ''}
    </div>
    <footer class="modal__foot od__foot">
      ${can('orders.cancel') && !['completed', 'cancelled'].includes(o.status) ? html`<button class="btn btn--danger" data-x="cancel">${icon('xCircle')} ${t('act_cancel')}</button>` : ''}
      ${can('orders.pay') && o.status !== 'cancelled' ? html`<button class="btn" data-x="pay">${icon(o.payment.status === 'paid' ? 'xCircle' : 'cash')} ${o.payment.status === 'paid' ? t('act_markUnpaid') : t('act_markPaid')}</button>` : ''}
      <button class="btn" data-x="pk">${icon('printer')} ${t('act_printTicket')}</button>
      <button class="btn" data-x="pr">${icon('receipt')} ${t('act_printReceipt')}</button>
      ${na && can('orders.update') ? html`<button class="btn ${na.cls === 'btn--outline' ? 'btn--gold' : na.cls}" data-x="next">${icon(na.ic)} ${na.label}</button>` : ''}
    </footer>`, { wide: true });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const x = b.dataset.x;
    try {
      if (x === 'next') { await setStatus(o.id, na.st); m.close(); }
      if (x === 'pk') await printTickets(o, ['kitchen']);
      if (x === 'pr') await printTickets(o, ['receipt']);
      if (x === 'pay') {
        const paid = o.payment.status !== 'paid';
        await call('updateOrder', { id: o.id, paid, method: o.payment.method });
        sfx(paid ? 'success' : 'toggle');
        m.close();
      }
      if (x === 'cancel') {
        const r = await confirmBox(t('confirmCancel', { n: o.no }), { danger: true, input: true, placeholder: t('cancelReasonPh'), ok: t('act_cancel') });
        if (r) { await setStatus(o.id, 'cancelled', typeof r === 'string' ? r : ''); m.close(); }
      }
    } catch {}
  });
}

/** One delegated handler for every order button on every view. */
export function installOrderActions() {
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-oact]');
    if (b) {
      const id = b.dataset.id;
      const o = A.d.orders.find((x) => x.id === id);
      if (!o) return;
      if (b.dataset.oact === 'open') { sfx('tap'); openOrder(id); }
      if (b.dataset.oact === 'status') {
        b.classList.add('is-busy');
        try { await setStatus(id, b.dataset.st); } catch { b.classList.remove('is-busy'); }
      }
      if (b.dataset.oact === 'print') printTickets(o, [b.dataset.kind || 'kitchen']);
      return;
    }
    const s = e.target.closest('[data-strike]');
    if (s) {
      const key = s.dataset.strike;
      if (A.struck[key]) delete A.struck[key]; else A.struck[key] = 1;
      s.classList.toggle('is-struck', !!A.struck[key]);
      setPref('mf.struck', JSON.stringify(A.struck));
      sfx('toggle');
    }
  });
}

/** Refresh every "elapsed" label without re-rendering the views. */
export function tickTimers() {
  const now = Date.now();
  $$('[data-since]').forEach((el) => { el.textContent = since(Number(el.dataset.since), now); });
  $$('[data-due]').forEach((el) => { el.textContent = dueShort(Number(el.dataset.due), now); });
  $$('[data-due-long]').forEach((el) => { el.textContent = dueLabel(Number(el.dataset.dueLong), now); });
  $$('.ocard[data-oid]').forEach((el) => {
    const o = A.d.orders.find((x) => x.id === el.dataset.oid);
    if (!o) return;
    el.classList.remove('is-warn', 'is-late');
    const c = ageClass(o);
    if (c) el.classList.add(c);
  });
}

export const emptyState = (ic, msg, extra = '') => html`<div class="empty-state">${icon(ic)}<p>${msg}</p>${extra}</div>`;
