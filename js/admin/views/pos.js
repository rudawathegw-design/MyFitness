// Counter / POS: staff take walk-in orders on the Windows PC (keyboard friendly).
import { html, raw, render, $, $$, fmtNum, clamp, clone, normPhone } from '../../core/util.js';
import { t, L } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { A, money, itemById, catById } from '../ctx.js';
import { call, modal, modalHead, toast, printTickets } from '../ui.js';

const P = { cat: 'all', q: '', lines: [], type: 'pickup', table: '', name: '', phone: '', note: '', pay: 'cash', paid: true };
const keyOf = (id, options, note) => `${id}|${JSON.stringify(Object.keys(options).sort().map((k) => [k, [].concat(options[k]).sort()]))}|${note || ''}`;
function unit(it, options) {
  let p = it.price;
  for (const g of it.options || []) for (const c of [].concat(options[g.id] || [])) p += g.choices.find((x) => x.id === c)?.price || 0;
  return p;
}
function defaults(it) { const o = {}; for (const g of it.options || []) if (g.type === 'one' && g.required && g.choices[0]) o[g.id] = g.choices[0].id; return o; }
function add(id, options, qty = 1, note = '') {
  const it = itemById(id);
  if (!it) return;
  const k = keyOf(id, options, note);
  const ex = P.lines.find((l) => l.key === k);
  if (ex) ex.qty = clamp(ex.qty + qty, 1, 99); else P.lines.push({ key: k, id, options: clone(options), qty, note });
  sfx('add');
}
const total = () => P.lines.reduce((a, l) => { const it = itemById(l.id); return a + (it ? unit(it, l.options) * l.qty : 0); }, 0);
const optText = (it, options) => (it.options || []).flatMap((g) => [].concat(options[g.id] || []).map((c) => L(g.choices.find((x) => x.id === c)?.name))).filter(Boolean).join(' · ');

function tiles() {
  const q = P.q.trim().toLowerCase();
  const list = A.d.items.filter((i) => !i.hidden && (P.cat === 'all' || i.cat === P.cat) && (!q || [i.name.en, i.name.ckb, i.name.ar].join(' ').toLowerCase().includes(q)));
  return list.length ? list.map((it) => html`<div class="tile ${it.available === false ? 'is-out' : ''}">
      <button class="tile__main" data-add="${it.id}" ${it.available === false ? raw('disabled') : ''}>
        <span class="tile__img">${it.img ? html`<img src="${A.store.img(it.img, 220)}" alt="" loading="lazy">` : icon(catById(it.cat)?.icon || 'utensils')}</span>
        <span class="tile__name">${L(it.name)}</span><span class="tile__price tabular">${fmtNum(it.price)}</span>
      </button>
      ${it.options?.length ? html`<button class="tile__opt" data-opt="${it.id}" title="${t('options')}" aria-label="${t('options')}">${icon('sliders')}</button>` : ''}
      ${it.available === false ? html`<span class="tile__out">${t('soldOut')}</span>` : ''}
    </div>`) : html`<p class="muted pad">${t('noItems')}</p>`;
}
function ticket() {
  const tt = total();
  const tables = A.d.tables.filter((x) => x.active !== false);
  return html`<header class="pos-t__head"><h3>${icon('receipt')} ${t('currentOrder')}</h3>${P.lines.length ? html`<button class="btn btn--ghost btn--sm" data-clear>${icon('trash')} ${t('clear')}</button>` : ''}</header>
    <div class="pos-t__lines">${P.lines.length ? P.lines.map((l) => { const it = itemById(l.id); if (!it) return ''; const ot = optText(it, l.options); return html`<div class="pl">
        <div class="pl__body"><b>${L(it.name)}</b>${ot ? html`<small>${ot}</small>` : ''}${l.note ? html`<em>» ${l.note}</em>` : ''}</div>
        <div class="pl__qty"><button data-q="${l.key}" data-d="-1" aria-label="−">${icon(l.qty === 1 ? 'trash' : 'minus')}</button><b class="tabular">${l.qty}</b><button data-q="${l.key}" data-d="1" aria-label="+">${icon('plus')}</button></div>
        <b class="pl__sum tabular">${fmtNum(unit(it, l.options) * l.qty)}</b>
      </div>`; }) : html`<div class="pos-t__empty">${icon('bag')}<p>${t('cartEmpty')}</p></div>`}</div>
    <div class="pos-t__form">
      <div class="seg seg--full"><button class="${P.type === 'pickup' ? 'is-on' : ''}" data-type="pickup">${icon('store')} ${t('pickupLabel')}</button><button class="${P.type === 'dinein' ? 'is-on' : ''}" data-type="dinein">${icon('utensils')} ${t('dineinLabel')}</button></div>
      ${P.type === 'dinein' ? html`<select class="select select--sm" id="pos-table"><option value="">${t('chooseTable')}</option>${['ladies', 'men'].map((f) => html`<optgroup label="${t('floor_' + f)}">${tables.filter((x) => x.floor === f).map((x) => html`<option value="${x.id}" ${P.table === x.id ? 'selected' : ''}>${x.name} · ${x.zone || ''}</option>`)}</optgroup>`)}</select>` : ''}
      <div class="two"><input class="input input--sm" id="pos-name" placeholder="${t('custNameOpt')}" value="${P.name}"><input class="input input--sm" id="pos-phone" dir="ltr" inputmode="tel" placeholder="${t('custPhoneOpt')}" value="${P.phone}"></div>
      <input class="input input--sm" id="pos-note" placeholder="${t('orderNote')}" value="${P.note}">
      <div class="pay-pills">${['cash', 'card', 'fib', 'fastpay'].map((p) => html`<button class="${P.pay === p ? 'is-on' : ''}" data-pay="${p}">${icon(p === 'cash' ? 'cash' : p === 'card' ? 'card' : 'wallet')}${t('pay_' + p)}</button>`)}</div>
      <label class="row-switch"><span>${t('payNow')}</span><span class="switch"><input type="checkbox" id="pos-paid" ${P.paid ? raw('checked') : ''}><span></span></span></label>
    </div>
    <div class="pos-t__foot">
      <div class="pos-t__total"><span>${t('total')}</span><b class="tabular">${money(tt)}</b></div>
      <button class="btn btn--gold btn--lg btn--block" id="pos-send" ${P.lines.length ? '' : raw('disabled')}>${icon('send', 'flip-rtl')} ${t('sendOrder')}</button>
    </div>`;
}
function optionsModal(it) {
  const st = { options: defaults(it), qty: 1, note: '' };
  const m = modal(html`${modalHead(L(it.name), 'sliders')}
    <div class="modal__body pos-opts">${(it.options || []).map((g) => html`<fieldset class="og" data-g="${g.id}"><legend>${L(g.name)} <small>${g.required ? t('required') : t('optional')}</small></legend>
      <div class="og__list">${g.choices.map((c, i) => html`<label class="og__opt"><input type="${g.type === 'one' ? 'radio' : 'checkbox'}" name="pg-${g.id}" value="${c.id}" ${g.type === 'one' && g.required && i === 0 ? raw('checked') : ''}><span>${L(c.name)}</span>${c.price ? html`<b>+${fmtNum(c.price)}</b>` : ''}</label>`)}</div></fieldset>`)}
      <input class="input" id="po-note" placeholder="${t('notePh')}">
    </div>
    <footer class="modal__foot"><div class="pl__qty pl__qty--lg"><button data-pq="-1">${icon('minus')}</button><b id="po-q">1</b><button data-pq="1">${icon('plus')}</button></div><button class="btn btn--gold grow" id="po-add">${icon('plus')} ${t('add')} · <span id="po-t" class="tabular"></span></button></footer>`);
  const upd = () => { $('#po-t', m.el).textContent = fmtNum(unit(it, st.options) * st.qty); $('#po-q', m.el).textContent = st.qty; };
  upd();
  m.el.addEventListener('change', (e) => {
    const fs = e.target.closest('[data-g]');
    if (!fs) return;
    const g = it.options.find((x) => x.id === fs.dataset.g);
    if (g.type === 'one') st.options[g.id] = e.target.value;
    else st.options[g.id] = [...fs.querySelectorAll('input:checked')].map((x) => x.value).slice(0, g.max || 12);
    sfx('toggle'); upd();
  });
  m.el.addEventListener('click', (e) => {
    const q = e.target.closest('[data-pq]');
    if (q) { st.qty = clamp(st.qty + Number(q.dataset.pq), 1, 99); upd(); }
    if (e.target.closest('#po-add')) { add(it.id, st.options, st.qty, $('#po-note', m.el).value.trim()); m.close(); refresh(); }
  });
}
let viewEl = null;
function refresh() { const tk = viewEl && $('#pos-ticket', viewEl); if (tk) render(tk, ticket()); }
function keep() {
  P.name = $('#pos-name')?.value ?? P.name; P.phone = $('#pos-phone')?.value ?? P.phone; P.note = $('#pos-note')?.value ?? P.note;
  P.table = $('#pos-table')?.value ?? P.table; P.paid = $('#pos-paid')?.checked ?? P.paid;
}
async function send(btn) {
  keep();
  if (P.type === 'dinein' && !P.table) { sfx('error'); toast(t('err_table'), { type: 'err' }); $('#pos-table')?.focus(); return; }
  btn.classList.add('is-busy');
  try {
    const order = await call('posOrder', {
      items: P.lines.map((l) => ({ id: l.id, qty: l.qty, options: l.options, note: l.note })),
      customer: { name: P.name.trim(), phone: normPhone(P.phone) }, type: P.type, table: P.type === 'dinein' ? P.table : null,
      payment: P.pay, paid: P.paid, note: P.note.trim(), when: 'now',
    });
    sfx('success');
    Object.assign(P, { lines: [], name: '', phone: '', note: '', table: '' });
    refresh();
    const p = A.d.settings.printer || {};
    const kinds = [...(p.printKitchen !== false ? ['kitchen'] : []), 'receipt'];
    const drawer = !!(p.drawer && order.payment.status === 'paid' && order.payment.method === 'cash');
    if (A.printStation) printTickets(order, kinds, { drawer });
    toast(t('orderSent', { n: order.no }), { ic: 'send', sub: money(order.total), action: A.printStation ? null : t('act_printReceipt'), onAction: () => printTickets(order, kinds, { drawer }) });
  } catch { btn.classList.remove('is-busy'); }
}

export default {
  id: 'pos', icon: 'store', perm: 'orders.pos', refreshOn: ['menu'],
  render(el) {
    viewEl = el;
    render(el, html`<div class="pos">
      <section class="pos__menu">
        <div class="pos__bar">
          <div class="input-icon grow">${icon('search')}<input class="input" id="pos-q" placeholder="${t('searchItems')}" value="${P.q}" autocomplete="off"></div>
        </div>
        <div class="pos__cats"><button class="cat-pill ${P.cat === 'all' ? 'is-on' : ''}" data-cat="all">${icon('grid')}${t('allItems')}</button>${A.d.categories.map((c) => html`<button class="cat-pill ${P.cat === c.id ? 'is-on' : ''}" data-cat="${c.id}">${icon(c.icon || 'utensils')}${L(c.name)}</button>`)}</div>
        <div class="pos__grid" id="pos-grid">${tiles()}</div>
      </section>
      <aside class="pos-t" id="pos-ticket">${ticket()}</aside>
    </div>`);
    el.onclick = (e) => {
      const a = e.target.closest('[data-add]');
      if (a) { const it = itemById(a.dataset.add); add(it.id, defaults(it)); refresh(); a.animate([{ transform: 'scale(.94)' }, { transform: 'scale(1)' }], { duration: 220 }); return; }
      const o = e.target.closest('[data-opt]');
      if (o) { optionsModal(itemById(o.dataset.opt)); return; }
      const c = e.target.closest('[data-cat]');
      if (c) { P.cat = c.dataset.cat; $$('.cat-pill', el).forEach((x) => x.classList.toggle('is-on', x === c)); render($('#pos-grid', el), tiles()); sfx('tap'); return; }
      const q = e.target.closest('[data-q]');
      if (q) { keep(); const l = P.lines.find((x) => x.key === q.dataset.q); if (l) { l.qty += Number(q.dataset.d); if (l.qty <= 0) P.lines = P.lines.filter((x) => x !== l); sfx(Number(q.dataset.d) > 0 ? 'pop' : 'remove'); refresh(); } return; }
      if (e.target.closest('[data-clear]')) { P.lines = []; sfx('remove'); refresh(); return; }
      const ty = e.target.closest('[data-type]');
      if (ty) { keep(); P.type = ty.dataset.type; sfx('toggle'); refresh(); return; }
      const pay = e.target.closest('[data-pay]');
      if (pay) { keep(); P.pay = pay.dataset.pay; sfx('toggle'); refresh(); return; }
      const sendBtn = e.target.closest('#pos-send');
      if (sendBtn) send(sendBtn);
    };
    el.oninput = (e) => {
      if (e.target.id === 'pos-q') { P.q = e.target.value; render($('#pos-grid', el), tiles()); }
    };
    el.onchange = () => keep();
    el.onkeydown = (e) => {
      if (e.target.id === 'pos-q' && e.key === 'Enter') {
        const first = el.querySelector('#pos-grid [data-add]:not([disabled])');
        if (first) { first.click(); e.target.select(); }
      }
    };
    setTimeout(() => $('#pos-q', el)?.focus(), 50);
  },
  update(el) { const g = $('#pos-grid', el); if (g) render(g, tiles()); else this.render(el); },
};
