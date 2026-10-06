// Settings: business, opening hours, ordering & scheduling rules, payments, QR link, demo tools, backups.
import { html, raw, render, $, clone, download, dayKey } from '../../core/util.js';
import { t, LANGS } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { siteUrl } from '../../core/store.js';
import { A, can, setPref } from '../ctx.js';
import { call, toast, confirmBox } from '../ui.js';

let D = null;
let dirty = false;
const LANG3 = [['en', 'english', 'ltr'], ['ckb', 'kurdish', 'rtl'], ['ar', 'arabic', 'rtl']];
const get = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), D);
function set(path, val) {
  const ks = path.split('.');
  let o = D;
  while (ks.length > 1) { const k = ks.shift(); o[k] = o[k] || {}; o = o[k]; }
  o[ks[0]] = val;
}
const sw = (path, lbl, hint = '') => html`<label class="row-switch"><span>${lbl}${hint ? html`<small>${hint}</small>` : ''}</span><span class="switch"><input type="checkbox" data-s="${path}" ${get(path) ? raw('checked') : ''}><span></span></span></label>`;
const num = (path, lbl, min = 0, max = 999, step = 1) => html`<label class="field"><span>${lbl}</span><input class="input" type="number" min="${min}" max="${max}" step="${step}" data-s="${path}" data-num value="${get(path)}"></label>`;
const tri = (base, lbl) => html`<div class="field"><span>${lbl}</span><div class="tri tri--inline">${LANG3.map(([lc, lb, dir]) => html`<input class="input input--sm" dir="${dir}" data-s="${base}.${lc}" value="${get(base)?.[lc] || ''}" placeholder="${t(lb)}">`)}</div></div>`;

function view() {
  const pays = D.ordering.payments || [];
  const owner = can('data.manage');
  return html`<div class="settings">
    <div class="settings__cols">
      <section class="card-box">
        <header class="box-head"><h3>${icon('store')} ${t('business')}</h3></header>
        ${tri('brand.cafeName', t('cafeName'))}
        <div class="two"><label class="field"><span>${t('phone')}</span><input class="input" dir="ltr" data-s="brand.phone" value="${D.brand.phone}"></label>
        <label class="field"><span>${t('defaultLang')}</span><select class="select" data-s="defaultLang">${LANGS.map((l) => html`<option value="${l.code}" ${D.defaultLang === l.code ? 'selected' : ''}>${l.label}</option>`)}</select></label></div>
        ${tri('brand.address', t('address'))}
      </section>
      <section class="card-box">
        <header class="box-head"><h3>${icon('clock')} ${t('hours')}</h3></header>
        <label class="row-switch"><span>${t('open24')}</span><span class="switch"><input type="checkbox" id="s-24" ${D.hours.open === D.hours.close ? raw('checked') : ''}><span></span></span></label>
        <div class="two"><label class="field"><span>${t('opens')}</span><input class="input" type="time" data-s="hours.open" value="${D.hours.open}" ${D.hours.open === D.hours.close ? raw('disabled') : ''}></label><label class="field"><span>${t('closes')}</span><input class="input" type="time" data-s="hours.close" value="${D.hours.close}" ${D.hours.open === D.hours.close ? raw('disabled') : ''}></label></div>
        ${sw('ordering.open', t('acceptOrders'))}
        ${num('ordering.prepMinutes', t('prepMin'), 1, 180)}
      </section>
      <section class="card-box">
        <header class="box-head"><h3>${icon('receipt')} ${t('ordering')}</h3></header>
        ${sw('ordering.allowDineIn', t('allowDinein'))}
        ${sw('ordering.allowPickup', t('allowPickup'))}
        ${sw('ordering.requireName', t('requireName'))}
        ${sw('ordering.requirePhone', t('requirePhone'))}
        <div class="field"><span>${t('payMethods')}</span><div class="tag-picks">${['cash', 'card', 'fib', 'fastpay'].map((p) => html`<button type="button" class="chip ${pays.includes(p) ? 'is-on' : ''}" data-pay="${p}">${icon(p === 'cash' ? 'cash' : p === 'card' ? 'card' : 'wallet')}${t('pay_' + p)}</button>`)}</div></div>
        <div class="two">${num('charges.servicePct', t('serviceCharge'), 0, 50, 0.5)}${num('charges.taxPct', t('taxPct'), 0, 50, 0.5)}</div>
      </section>
      <section class="card-box">
        <header class="box-head"><h3>${icon('calendar')} ${t('allowSchedule')}</h3></header>
        ${sw('ordering.allowSchedule', t('allowSchedule'), t('scheduleNotice'))}
        <div class="two">${num('ordering.scheduleLeadMinutes', t('leadMin'), 0, 240)}${num('ordering.scheduleMinMinutes', t('minAhead'), 5, 1440)}</div>
        <div class="two">${num('ordering.scheduleMaxDays', t('maxDays'), 0, 14)}${num('ordering.slotMinutes', t('slotMin'), 5, 120, 5)}</div>
      </section>
      <section class="card-box">
        <header class="box-head"><h3>${icon('qr')} ${t('publicUrl')}</h3></header>
        <input class="input" dir="ltr" data-s="publicUrl" value="${D.publicUrl}" placeholder="${siteUrl('')}">
        <p class="hint">${icon('info')} ${t('publicUrlHint')}</p>
      </section>
      <section class="card-box">
        <header class="box-head"><h3>${icon('zap')} ${t('simulator')}</h3><span class="mode-badge ${A.store.mode === 'server' ? 'is-server' : ''}">${A.store.mode === 'server' ? t('serverMode') : t('demoMode')}</span></header>
        <p class="hint">${icon('info')} ${A.store.mode === 'server' ? t('modeServer') : t('modeLocal')}</p>
        <div class="row-gap wrap">
          <button type="button" class="btn" id="s-sim1">${icon('play')} ${t('simulateOne')}</button>
          <label class="row-switch grow"><span>${t('simulateAuto')}</span><span class="switch"><input type="checkbox" id="s-simauto" ${A.simulate ? raw('checked') : ''}><span></span></span></label>
        </div>
      </section>
      ${owner ? html`<section class="card-box">
        <header class="box-head"><h3>${icon('database')} ${t('data')}</h3></header>
        <div class="data-btns">
          <button type="button" class="btn" id="s-export">${icon('download')} ${t('exportBackup')}</button>
          <label class="btn">${icon('upload')} ${t('importBackup')}<input type="file" id="s-import" accept="application/json,.json" hidden></label>
          <button type="button" class="btn" id="s-gen">${icon('chart')} ${t('genHistory')}</button>
          <button type="button" class="btn btn--danger" id="s-clear">${icon('trash')} ${t('clearOrders')}</button>
          ${A.store.mode === 'local' ? html`<button type="button" class="btn btn--danger" id="s-reset">${icon('refresh')} ${t('resetDemo')}</button>` : ''}
        </div>
      </section>` : ''}
    </div>
    <div class="save-bar ${dirty ? 'is-on' : ''}" id="save-bar"><span>${icon('info')} ${t('unsaved')}</span><button type="button" class="btn" id="s-cancel">${t('cancel')}</button><button type="button" class="btn btn--gold" id="s-save">${icon('check')} ${t('saveChanges')}</button></div>
  </div>`;
}

export default {
  id: 'settings', icon: 'settings', perm: 'settings.edit', refreshOn: [],
  render(el) {
    D = clone(A.d.settings);
    dirty = false;
    render(el, view());
    const markDirty = () => { dirty = true; $('#save-bar', el).classList.add('is-on'); };
    el.oninput = (e) => {
      if (e.target.id === 's-24') {
        const on = e.target.checked;
        D.hours = on ? { open: '00:00', close: '00:00' } : { open: '08:00', close: '23:00' };
        const o = el.querySelector('[data-s="hours.open"]'), c = el.querySelector('[data-s="hours.close"]');
        o.value = D.hours.open; c.value = D.hours.close; o.disabled = c.disabled = on;
        markDirty();
        return;
      }
      const p = e.target.dataset.s;
      if (!p) return;
      set(p, e.target.type === 'checkbox' ? e.target.checked : e.target.hasAttribute('data-num') ? Number(e.target.value) : e.target.value);
      markDirty();
    };
    el.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pay) {
        const p = b.dataset.pay, list = D.ordering.payments || [];
        D.ordering.payments = list.includes(p) ? list.filter((x) => x !== p) : [...list, p];
        b.classList.toggle('is-on'); sfx('toggle'); markDirty(); return;
      }
      switch (b.id) {
        case 's-save':
          try { A.d.settings = await call('saveSettings', D); dirty = false; sfx('success'); toast(t('saved'), { ic: 'settings' }); this.render(el); } catch {}
          break;
        case 's-cancel': sfx('tap'); this.render(el); break;
        case 's-sim1': try { const o = await call('simulateOrder'); toast(`#${o.no}`, { ic: 'zap', sub: t('simulateOne') }); } catch {} break;
        case 's-export': {
          try { const data = await call('exportData'); download(`myfitness-backup-${dayKey()}.json`, JSON.stringify(data, null, 1), 'application/json'); sfx('success'); } catch {}
          break;
        }
        case 's-gen': if (await confirmBox(t('genHistoryQ'), { ok: t('genHistory') })) { try { await call('generateDemo', { days: 70 }); toast(t('done2'), { ic: 'chart' }); } catch {} } break;
        case 's-clear': if (await confirmBox(t('confirmClear'), { danger: true, ok: t('clearOrders') })) { try { await call('clearOrders'); toast(t('done2')); } catch {} } break;
        case 's-reset': if (await confirmBox(t('confirmReset'), { danger: true, ok: t('resetDemo') })) { try { await call('resetDemo'); toast(t('done2')); } catch {} } break;
        default: break;
      }
    };
    el.onchange = async (e) => {
      if (e.target.id === 's-simauto') {
        A.simulate = e.target.checked;
        setPref('mf.sim', A.simulate ? '1' : '0');
        window.dispatchEvent(new Event('mf:sim'));
        sfx('toggle');
        return;
      }
      if (e.target.id === 's-import' && e.target.files[0]) {
        try {
          const data = JSON.parse(await e.target.files[0].text());
          if (await confirmBox(t('importBackup') + '?', { danger: true, sub: `${(data.items || []).length} items · ${(data.orders || []).length} orders` })) {
            await call('importData', data);
            toast(t('restored'), { ic: 'database' });
          }
        } catch (err) { if (!err.code) toast(t('err_invalidBackup'), { type: 'err' }); }
        e.target.value = '';
      }
    };
  },
};
