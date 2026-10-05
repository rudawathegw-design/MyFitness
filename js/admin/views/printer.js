// Printer setup for the Xprinter XP-N200L: connection, format, what to print, test & live preview.
import { html, raw, render, $, $$, clone } from '../../core/util.js';
import { t, L } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { ticketPreviewBody, ticketPreviewCSS, renderTicketCanvas, sampleOrder } from '../../core/receipt.js';
import { A, can, setPref } from '../ctx.js';
import { call, toast, printTickets } from '../ui.js';

let D = null; // draft of settings.printer
let previewKind = 'kitchen';
const LANG3 = [['en', 'english', 'ltr'], ['ckb', 'kurdish', 'rtl'], ['ar', 'arabic', 'rtl']];

function settingsWith() { return { ...A.d.settings, printer: D }; }
function modeCard(mode, ic, title, sub) {
  return html`<button type="button" class="mode-card ${D.mode === mode ? 'is-on' : ''}" data-mode="${mode}">${icon(ic)}<b>${title}</b><small>${sub}</small></button>`;
}
const field = (lbl, inner) => html`<label class="field"><span>${lbl}</span>${inner}</label>`;
const sw = (key, lbl) => html`<label class="row-switch"><span>${lbl}</span><span class="switch"><input type="checkbox" data-p="${key}" ${D[key] ? raw('checked') : ''}><span></span></span></label>`;

function form() {
  const server = A.store.mode === 'server';
  return html`
    <div class="card-box">
      <header class="box-head"><h3>${icon('printer')} ${t('printerTitle')}</h3></header>
      <p class="muted">${t('printerSub')}</p>
      <div class="station-row ${A.printStation ? 'is-on' : ''}">
        <div class="grow"><b>${icon('monitor')} ${t('autoPrint')}</b><small>${t('autoPrintHint')} · <em>${t('thisDevice')}</em></small></div>
        <span class="switch"><input type="checkbox" id="p-station" ${A.printStation ? raw('checked') : ''}><span></span></span>
      </div>
    </div>
    <div class="card-box">
      <header class="box-head"><h3>${icon('link')} ${t('connection')}</h3><small class="muted">${t('sharedSettings')}</small></header>
      <div class="mode-cards">
        ${modeCard('browser', 'monitor', t('pm_browser'), t('pm_browserSub'))}
        ${modeCard('bridge', 'zap', t('pm_bridge'), t('pm_bridgeSub'))}
        ${modeCard('rawbt', 'smartphone', t('pm_rawbt'), t('pm_rawbtSub'))}
      </div>
      ${D.mode !== 'browser' ? html`<div class="form-grid">
        ${D.mode === 'bridge' ? html`
          ${field(t('target'), html`<select class="select" data-p="target"><option value="network" ${D.target === 'network' ? 'selected' : ''}>${t('tgt_network')}</option><option value="windows" ${D.target === 'windows' ? 'selected' : ''}>${t('tgt_windows')}</option></select>`)}
          ${D.target === 'network' ? html`${field(t('printerIp'), html`<input class="input" data-p="host" value="${D.host}" dir="ltr" placeholder="192.168.123.100">`)}${field(t('port'), html`<input class="input" type="number" data-p="port" value="${D.port}" dir="ltr">`)}`
            : field(t('winPrinter'), html`<input class="input" data-p="windowsPrinter" value="${D.windowsPrinter}" dir="ltr" list="win-printers" placeholder="XP-N200L"><datalist id="win-printers"></datalist>`)}
          ${server ? html`<p class="note">${icon('info')} ${t('serverPrintNote')}</p>` : html`${field(t('bridgeUrl'), html`<input class="input" data-p="bridgeUrl" value="${D.bridgeUrl}" dir="ltr">`)}${field(t('bridgeKey'), html`<input class="input" data-p="bridgeKey" value="${D.bridgeKey}" dir="ltr">`)}`}
          <div class="bridge-check"><button type="button" class="btn btn--sm" id="p-check">${icon('wifi')} ${t('checkBridge')}</button><span id="p-status" class="muted"></span></div>` : ''}
        ${field(t('format'), html`<select class="select" data-p="format"><option value="image" ${D.format === 'image' ? 'selected' : ''}>${t('fmt_image')}</option><option value="text" ${D.format === 'text' ? 'selected' : ''}>${t('fmt_text')}</option></select>`)}
      </div>` : ''}
    </div>
    <div class="card-box">
      <header class="box-head"><h3>${icon('receipt')} ${t('printKitchen')} / ${t('printReceipt')}</h3></header>
      <div class="form-grid">
        ${field(t('paperWidth'), html`<select class="select" data-p="paper"><option value="80" ${Number(D.paper) === 80 ? 'selected' : ''}>80 mm (XP-N200L)</option><option value="58" ${Number(D.paper) === 58 ? 'selected' : ''}>58 mm</option></select>`)}
        ${field(t('ticketLang'), html`<select class="select" data-p="ticketLang">${[['en', 'English'], ['ckb', 'کوردی'], ['ar', 'العربية'], ['en+ckb', 'English + کوردی']].map(([v, l]) => html`<option value="${v}" ${D.ticketLang === v ? 'selected' : ''}>${l}</option>`)}</select>`)}
        ${field(t('receiptLogo'), html`<select class="select" data-p="logo">${['myfitness', 'ladies', 'none'].map((v) => html`<option value="${v}" ${D.logo === v ? 'selected' : ''}>${t('logo_' + v)}</option>`)}</select>`)}
      </div>
      <div class="switch-list">
        <div class="row-switch"><span>${t('printKitchen')}</span><div class="row-gap"><input class="input input--sm input--num" type="number" min="0" max="5" data-p="kitchenCopies" value="${D.kitchenCopies}" title="${t('copies')}" aria-label="${t('copies')}"><span class="switch"><input type="checkbox" data-p="printKitchen" ${D.printKitchen ? raw('checked') : ''}><span></span></span></div></div>
        <div class="row-switch"><span>${t('printReceipt')}</span><div class="row-gap"><input class="input input--sm input--num" type="number" min="0" max="5" data-p="receiptCopies" value="${D.receiptCopies}" title="${t('copies')}" aria-label="${t('copies')}"><span class="switch"><input type="checkbox" data-p="printReceipt" ${D.printReceipt ? raw('checked') : ''}><span></span></span></div></div>
        ${sw('cut', t('cutPaper'))}
        ${sw('drawer', t('openDrawer'))}
        ${sw('showQr', t('showQrOnReceipt'))}
      </div>
      <h4 class="sub-h">${t('headerText')}</h4>
      <div class="tri tri--inline">${LANG3.map(([lc, lb, dir]) => html`<input class="input input--sm" dir="${dir}" data-tri="header.${lc}" value="${D.header?.[lc] || ''}" placeholder="${t(lb)}">`)}</div>
      <h4 class="sub-h">${t('footerText')}</h4>
      <div class="tri tri--inline">${LANG3.map(([lc, lb, dir]) => html`<input class="input input--sm" dir="${dir}" data-tri="footer.${lc}" value="${D.footer?.[lc] || ''}" placeholder="${t(lb)}">`)}</div>
    </div>
    <div class="card-box guide">
      <header class="box-head"><h3>${icon('info')} ${t('setupGuide')} — XP-N200L</h3></header>
      <ol>${[1, 2, 3, 4, 5, 6].map((i) => html`<li>${t('guide' + i)}</li>`)}</ol>
    </div>`;
}
function previewPane() {
  return html`<div class="card-box preview-box">
    <header class="box-head"><h3>${icon('eye')} ${t('preview')}</h3>
      <div class="seg"><button class="${previewKind === 'kitchen' ? 'is-on' : ''}" data-pk="kitchen">${t('previewKitchen')}</button><button class="${previewKind === 'receipt' ? 'is-on' : ''}" data-pk="receipt">${t('previewReceipt')}</button></div></header>
    <div class="paper-wrap"><div class="paper" id="paper"></div></div>
    <div class="row-gap preview-actions">
      <button class="btn btn--gold grow" data-test="kitchen">${icon('printer')} ${t('testPrint')} · ${t('previewKitchen')}</button>
      <button class="btn grow" data-test="receipt">${icon('receipt')} ${t('testPrint')} · ${t('previewReceipt')}</button>
    </div>
    ${can('settings.edit') ? html`<button class="btn btn--block btn--outline save-btn" id="p-save">${icon('check')} ${t('saveChanges')}</button>` : ''}
  </div>`;
}
async function drawPreview(el) {
  const paper = $('#paper', el);
  if (!paper) return;
  const order = sampleOrder(A.d.items);
  const s = settingsWith();
  if (D.mode !== 'browser' && D.format === 'image') {
    paper.className = 'paper paper--raster';
    const canvas = await renderTicketCanvas(order, s, previewKind);
    paper.innerHTML = '';
    canvas.className = 'raster-canvas';
    paper.appendChild(canvas);
  } else {
    paper.className = 'paper';
    const w = Number(D.paper) === 58 ? '48mm' : '72mm';
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>:root{--w:${w}}${ticketPreviewCSS} body{margin:0 auto;padding:6px 0}</style></head><body>${ticketPreviewBody(order, s, previewKind)}</body></html>`;
    paper.innerHTML = '<iframe title="preview" class="paper__frame"></iframe>';
    const f = paper.querySelector('iframe');
    f.srcdoc = doc;
    f.onload = () => { try { f.style.height = f.contentDocument.body.scrollHeight + 20 + 'px'; } catch {} };
  }
}

export default {
  id: 'printer', icon: 'printer', perm: 'orders.view', refreshOn: ['settings'],
  render(el) {
    D = clone(A.d.settings.printer);
    const paint = () => {
      render(el, html`<div class="printer-page"><div class="printer-page__form">${form()}</div><div class="printer-page__preview">${previewPane()}</div></div>`);
      drawPreview(el);
    };
    paint();
    const repaintForm = () => { const y = window.scrollY; paint(); window.scrollTo(0, y); };
    el.oninput = (e) => {
      const k = e.target.dataset.p, tri = e.target.dataset.tri;
      if (k) {
        D[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value;
        if (['target', 'format'].includes(k)) repaintForm(); else drawPreview(el);
      }
      if (tri) { const [g, lc] = tri.split('.'); D[g] = { ...(D[g] || {}), [lc]: e.target.value }; drawPreview(el); }
      if (e.target.id === 'p-station') {
        A.printStation = e.target.checked;
        setPref('mf.printStation', A.printStation ? '1' : '0');
        document.getElementById('t-station')?.classList.toggle('is-on', A.printStation);
        sfx('toggle');
      }
    };
    el.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.mode) { D.mode = b.dataset.mode; sfx('toggle'); repaintForm(); return; }
      if (b.dataset.pk) { previewKind = b.dataset.pk; $$('[data-pk]', el).forEach((x) => x.classList.toggle('is-on', x === b)); drawPreview(el); return; }
      if (b.dataset.test) { printTickets(sampleOrder(A.d.items), [b.dataset.test]).catch(() => {}); return; }
      if (b.id === 'p-save') {
        try { A.d.settings = await call('saveSettings', { printer: D }); sfx('success'); toast(t('saved'), { ic: 'printer' }); } catch {}
        return;
      }
      if (b.id === 'p-check') {
        const st = $('#p-status', el);
        st.textContent = '…';
        try {
          const r = await A.store.printerStatus(D, D.target === 'network' ? { host: D.host, port: D.port } : {});
          const list = r.printers || [];
          const dl = $('#win-printers', el);
          if (dl) render(dl, list.map((n) => html`<option value="${n}"></option>`));
          st.className = r.reachable === false ? 'err' : 'ok';
          st.textContent = `${t('bridgeOk')}${r.version ? ' v' + r.version : ''}${D.target === 'network' && r.reachable !== undefined ? ` · ${D.host}:${D.port} ${r.reachable ? '✓' : '✗'}` : ''}${list.length ? ' · ' + list.join(', ') : ''}`;
          sfx(r.reachable === false ? 'error' : 'success');
        } catch (err) {
          st.className = 'err';
          st.textContent = `${t('bridgeFail')} (${err.message || err})`;
          sfx('error');
        }
      }
    };
  },
};
