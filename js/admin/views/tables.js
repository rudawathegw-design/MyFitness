// Tables & QR codes: every table gets its own QR; print A4 sheets of table cards or download PNGs.
import { html, raw, render, $, esc, download } from '../../core/util.js';
import { t, tIn } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { qrSVG, drawQR } from '../../core/qr.js';
import { siteUrl } from '../../core/store.js';
import { menuBaseUrl } from '../../core/receipt.js';
import { A, can } from '../ctx.js';
import { call, modal, modalHead, confirmBox, toast, emptyState } from '../ui.js';

export const tableUrl = (tb) => `${menuBaseUrl(A.d.settings)}?t=${encodeURIComponent(tb.id)}`;
const floorAll = (f) => `${tIn('en', 'floor_' + f)} · ${tIn('ckb', 'floor_' + f)} · ${tIn('ar', 'floor_' + f)}`;

function cardHTML(tb) {
  return `<div class="qc">
    <div class="qc__band"><img src="${siteUrl('assets/brand/logo-myfitness-160.webp')}" alt=""><img src="${siteUrl('assets/brand/logo-ladies-160.webp')}" alt=""></div>
    <div class="qc__scan"><b>SCAN TO ORDER</b><span dir="rtl">سکان بکە بۆ داواکردن</span><span dir="rtl">امسح للطلب</span></div>
    <div class="qc__qr">${qrSVG(tableUrl(tb), { border: 2, ecl: 'Q' })}</div>
    <div class="qc__table">${esc(tb.name)}</div>
    <div class="qc__floor">${esc(floorAll(tb.floor))}</div>
    <ol class="qc__steps"><li><i>1</i>Scan · سکان</li><li><i>2</i>Order · داوا بکە</li><li><i>3</i>Enjoy · نۆشی گیان</li></ol>
    <div class="qc__foot">MY FITNESS Café · Ranya · ${esc(A.d.settings.brand?.phone || '')}</div>
  </div>`;
}
const CARD_CSS = `
  @page { size: A4; margin: 8mm }
  * { box-sizing: border-box } body { margin: 0; font-family: "Segoe UI", Tahoma, Arial, "Noto Sans Arabic", sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .sheet { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .qc { height: 136mm; border: 1.5px solid #111; border-radius: 6mm; overflow: hidden; display: flex; flex-direction: column; align-items: center; text-align: center; break-inside: avoid; page-break-inside: avoid; position: relative }
  .qc::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2.2mm; background: linear-gradient(90deg, #e5121b, #ffc629) }
  .qc__band { width: 100%; background: #000; display: flex; justify-content: space-between; align-items: center; padding: 3.5mm 4mm; gap: 3mm }
  .qc__band img { height: 7.5mm; width: auto }
  .qc__scan { margin-top: 4mm; display: grid; gap: .6mm } .qc__scan b { font-size: 17pt; font-weight: 900; letter-spacing: 1.5pt } .qc__scan span { font-size: 11.5pt; font-weight: 700 }
  .qc__qr { width: 56mm; margin: 3mm 0 1mm; padding: 2mm; border-radius: 3mm; border: 1mm solid #ffc629 } .qc__qr svg { display: block; width: 100%; height: auto }
  .qc__table { font-size: 30pt; font-weight: 900; line-height: 1; margin-top: 1mm }
  .qc__floor { font-size: 9pt; font-weight: 700; color: #444; margin-top: 1.5mm }
  .qc__steps { list-style: none; display: flex; gap: 3mm; padding: 0; margin: 3mm 0 0; font-size: 8pt; font-weight: 700 } .qc__steps i { display: inline-grid; place-items: center; width: 4.6mm; height: 4.6mm; border-radius: 50%; background: #111; color: #ffc629; font-style: normal; margin-inline-end: 1mm; font-size: 7pt }
  .qc__foot { margin-top: auto; padding: 2mm 0 4.5mm; font-size: 8pt; color: #555 }
`;
function printCards(tables) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
  document.body.appendChild(f);
  const doc = f.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>MY FITNESS — QR table cards</title><style>${CARD_CSS}</style></head><body><div class="sheet">${tables.map(cardHTML).join('')}</div></body></html>`);
  doc.close();
  const imgs = [...doc.images];
  let left = imgs.length;
  const go = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 1500); };
  imgs.forEach((im) => { const fin = () => { if (--left === 0) go(); }; if (im.complete) fin(); else { im.onload = fin; im.onerror = fin; } });
  if (!imgs.length) go();
}
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
async function downloadPng(tb) {
  const W = 1200, H = 1700, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#000'; x.fillRect(0, 0, W, 170);
  const [red, gold] = await Promise.all([loadImg(siteUrl('assets/brand/logo-myfitness-160.webp')), loadImg(siteUrl('assets/brand/logo-ladies-160.webp'))]);
  if (red) x.drawImage(red, 50, 50, (red.width / red.height) * 72, 72);
  if (gold) { const w = (gold.width / gold.height) * 76; x.drawImage(gold, W - 50 - w, 48, w, 76); }
  const grad = x.createLinearGradient(0, 0, W, 0); grad.addColorStop(0, '#e5121b'); grad.addColorStop(1, '#ffc629');
  x.fillStyle = grad; x.fillRect(0, H - 22, W, 22);
  x.fillStyle = '#111'; x.textAlign = 'center';
  x.font = '900 72px "Segoe UI", Arial, sans-serif'; x.fillText('SCAN TO ORDER', W / 2, 290);
  x.font = '700 46px "Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif'; x.direction = 'rtl';
  x.fillText('سکان بکە بۆ داواکردن  ·  امسح للطلب', W / 2, 365); x.direction = 'ltr';
  x.fillStyle = '#ffc629'; x.fillRect(W / 2 - 330, 410, 660, 660);
  drawQR(x, tableUrl(tb), W / 2 - 310, 430, 620, { border: 2, ecl: 'Q' });
  x.fillStyle = '#111'; x.font = '900 150px "Segoe UI", Arial, sans-serif'; x.fillText(tb.name, W / 2, 1255);
  x.font = '700 40px "Noto Sans Arabic", "Segoe UI", sans-serif'; x.fillStyle = '#444'; x.fillText(floorAll(tb.floor), W / 2, 1335);
  x.font = '700 38px "Segoe UI", sans-serif'; x.fillStyle = '#111'; x.fillText('1 Scan   ·   2 Order   ·   3 Enjoy', W / 2, 1450);
  x.font = '600 34px "Segoe UI", sans-serif'; x.fillStyle = '#666'; x.fillText(`MY FITNESS Café · Ranya · ${A.d.settings.brand?.phone || ''}`, W / 2, 1600);
  c.toBlob((b) => download(`myfitness-table-${tb.id}.png`, b, 'image/png'), 'image/png');
}

function tableEditor(tb) {
  const isNew = !tb;
  const d = { ...(tb || { name: '', floor: 'ladies', zone: '', seats: 4, active: true }) };
  const m = modal(html`${modalHead(isNew ? t('addTable') : `${t('edit')} · ${d.name}`, 'utensils')}
    <div class="modal__body form-grid">
      <label class="field"><span>${t('tableName')}</span><input class="input" data-f="name" value="${d.name}" placeholder="L11" autofocus></label>
      <label class="field"><span>${t('floor')}</span><select class="select" data-f="floor"><option value="ladies" ${d.floor === 'ladies' ? 'selected' : ''}>${t('floor_ladies')}</option><option value="men" ${d.floor === 'men' ? 'selected' : ''}>${t('floor_men')}</option></select></label>
      <label class="field"><span>${t('zone')}</span><input class="input" data-f="zone" value="${d.zone || ''}"></label>
      <label class="field"><span>${t('seats')}</span><input class="input" type="number" min="1" max="30" data-f="seats" value="${d.seats || 4}"></label>
      <label class="row-switch"><span>${t('active')}</span><span class="switch"><input type="checkbox" data-f="active" ${d.active !== false ? raw('checked') : ''}><span></span></span></label>
    </div>
    <footer class="modal__foot">${!isNew ? html`<button class="btn btn--danger" id="tb-del">${icon('trash')} ${t('delete')}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${t('cancel')}</button><button class="btn btn--gold" id="tb-save">${icon('check')} ${t('save')}</button></footer>`, { cls: 'modal--sm' });
  m.el.addEventListener('input', (e) => { const f = e.target.dataset.f; if (f) d[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
  m.el.addEventListener('click', async (e) => {
    if (e.target.closest('#tb-save')) { try { await call('saveTable', d); sfx('success'); m.close(); } catch {} }
    if (e.target.closest('#tb-del') && await confirmBox(t('confirmDeleteTable', { name: d.name }), { danger: true, ok: t('delete') })) { try { await call('deleteTable', { id: d.id }); m.close(); } catch {} }
  });
}

export default {
  id: 'tables', icon: 'qr', perm: 'tables.edit', refreshOn: ['tables', 'settings'],
  render(el) {
    const base = menuBaseUrl(A.d.settings);
    const local = /localhost|127\.0\.0\.1/.test(base);
    const floors = ['ladies', 'men'];
    render(el, html`<div class="tables">
      <div class="toolbar-row">
        <div class="url-note ${local ? 'is-warn' : ''}">${icon(local ? 'alert' : 'link')}<div><b>${t('qrBaseWarn', { url: base })}</b><small>${t('qrBaseHint')}</small></div><a class="btn btn--sm" href="#/settings">${icon('settings')}</a></div>
        <div class="row-gap">
          <button class="btn" id="qr-print">${icon('printer')} ${t('printQr')}</button>
          ${can('tables.edit') ? html`<button class="btn btn--gold" id="tb-new">${icon('plus')} ${t('addTable')}</button>` : ''}
        </div>
      </div>
      ${floors.map((f) => {
        const list = A.d.tables.filter((x) => x.floor === f);
        return list.length ? html`<h3 class="section-title">${icon('layers')} ${t('floor_' + f)} <span class="muted">· ${list.length}</span></h3>
          <div class="qr-grid">${list.map((tb) => html`<article class="qr-card ${tb.active === false ? 'is-off' : ''}">
            <div class="qr-card__qr">${raw(qrSVG(tableUrl(tb), { border: 1, ecl: 'Q' }))}</div>
            <div class="qr-card__info"><b>${tb.name}</b><small>${tb.zone || ''} · ${tb.seats} ${t('seats')}</small>${tb.active === false ? html`<span class="badge st-cancelled">${t('hidden')}</span>` : ''}</div>
            <div class="qr-card__tools">
              <button class="btn btn--sm btn--icon" data-png="${tb.id}" title="${t('downloadPng')}" aria-label="${t('downloadPng')}">${icon('download')}</button>
              <button class="btn btn--sm btn--icon" data-print1="${tb.id}" title="${t('printQr')}" aria-label="${t('printQr')}">${icon('printer')}</button>
              <a class="btn btn--sm btn--icon" href="${tableUrl(tb)}" target="_blank" rel="noopener" title="${t('qrLink')}" aria-label="${t('qrLink')}">${icon('external')}</a>
              ${can('tables.edit') ? html`<button class="btn btn--sm btn--icon" data-tedit="${tb.id}" aria-label="${t('edit')}">${icon('edit')}</button>` : ''}
            </div>
          </article>`)}</div>` : '';
      })}
      ${!A.d.tables.length ? emptyState('qr', t('noItems')) : ''}
    </div>`);
    el.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const tb = (id) => A.d.tables.find((x) => x.id === id);
      if (b.id === 'qr-print') { sfx('tap'); printCards(A.d.tables.filter((x) => x.active !== false)); }
      if (b.id === 'tb-new') tableEditor(null);
      if (b.dataset.tedit) tableEditor(tb(b.dataset.tedit));
      if (b.dataset.png) { downloadPng(tb(b.dataset.png)); toast(t('downloadPng'), { ic: 'download', sub: tb(b.dataset.png).name, ms: 1800 }); }
      if (b.dataset.print1) printCards([tb(b.dataset.print1)]);
    };
  },
};
