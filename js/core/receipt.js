// Kitchen tickets & customer receipts for the Xprinter XP-N200L (80 mm thermal).
//   • browser mode → HTML printed through the Windows driver
//   • bridge / RawBT → ESC/POS bytes (image mode keeps Kurdish & Arabic perfect)
import { Escpos, canvasToRaster, concatBytes } from './escpos.js';
import { qrSVG, drawQR } from './qr.js';
import { L, clock, dateShort } from './i18n.js';
import { fmtNum, fmtPhone, esc, isRtlText, b64 } from './util.js';
import { siteUrl } from './store.js';

const LOGOS = { myfitness: 'assets/brand/receipt-myfitness.png', ladies: 'assets/brand/receipt-ladies.png' };
const LBL = {
  en: { table: 'TABLE', pickup: 'PICKUP', placed: 'Placed', sched: 'SCHEDULED FOR', customer: 'Customer', phone: 'Phone', subtotal: 'Subtotal', service: 'Service', tax: 'Tax', total: 'TOTAL', paid: 'PAID', unpaid: 'UNPAID', note: 'NOTE', kitchen: 'KITCHEN', receipt: 'RECEIPT', track: 'Scan to track your order', order: 'Order', items: 'items', test: 'TEST PRINT', cur: 'IQD', pos: 'Counter', qr: 'QR menu', ladies: 'Ladies Floor', men: 'Men’s Floor', pay: { cash: 'Cash', card: 'Card', fib: 'FIB', fastpay: 'FastPay' } },
  ckb: { table: 'مێز', pickup: 'وەرگرتن لە کاونتەر', placed: 'کات', sched: 'دیاریکراو بۆ', customer: 'کڕیار', phone: 'مۆبایل', subtotal: 'کۆی لاوەکی', service: 'خزمەتگوزاری', tax: 'باج', total: 'کۆی گشتی', paid: 'پارەدراوە', unpaid: 'پارە نەدراوە', note: 'تێبینی', kitchen: 'چێشتخانە', receipt: 'پسوولە', track: 'سکان بکە بۆ بەدواداچوونی داواکارییەکەت', order: 'داواکاری', items: 'دانە', test: 'چاپی تاقیکردنەوە', cur: 'IQD', pos: 'کاونتەر', qr: 'مینیوی QR', ladies: 'نهۆمی ئافرەتان', men: 'نهۆمی پیاوان', pay: { cash: 'کاش', card: 'کارت', fib: 'FIB', fastpay: 'FastPay' } },
  ar: { table: 'طاولة', pickup: 'استلام من الكاونتر', placed: 'الوقت', sched: 'مجدول لـ', customer: 'الزبون', phone: 'الموبايل', subtotal: 'المجموع الفرعي', service: 'الخدمة', tax: 'الضريبة', total: 'المجموع', paid: 'مدفوع', unpaid: 'غير مدفوع', note: 'ملاحظة', kitchen: 'المطبخ', receipt: 'إيصال', track: 'امسح لتتبع طلبك', order: 'الطلب', items: 'أصناف', test: 'طباعة تجريبية', cur: 'IQD', pos: 'الكاونتر', qr: 'قائمة QR', ladies: 'طابق السيدات', men: 'طابق الرجال', pay: { cash: 'نقداً', card: 'بطاقة', fib: 'FIB', fastpay: 'FastPay' } },
};

let lanBase = '';
/** Server mode: when staff use http://localhost, QR codes must point at the PC's Wi-Fi address instead. */
export const setLanBase = (u) => { lanBase = u || ''; };
export function menuBaseUrl(settings) {
  const onLocalhost = /^(localhost|127\.|\[::1\])/.test(globalThis.location?.hostname || '');
  return (settings.publicUrl || (onLocalhost && lanBase) || siteUrl('')).replace(/[?#].*$/, '').replace(/\/?$/, '/');
}
export const trackUrl = (order, settings) => `${menuBaseUrl(settings)}#/order/${order.id}?k=${order.token}`;

/** Language-neutral description of a ticket; both renderers draw from it. */
export function ticketModel(order, settings, kind, forceLang) {
  const p = settings.printer || {};
  const tl = forceLang || p.ticketLang || 'en';
  const base = tl === 'en+ckb' ? 'en' : tl;
  const lb = LBL[base] || LBL.en;
  const names = (o) => (tl === 'en+ckb' ? [L(o, 'en'), o?.ckb && o.ckb !== L(o, 'en') ? o.ckb : ''].filter(Boolean) : [L(o, base)]);
  const money = (n) => `${fmtNum(n)}`;
  const floor = order.floor ? lb[order.floor] : '';
  const where = order.type === 'dinein' && order.table ? `${lb.table} ${order.table}` : lb.pickup;
  const at = order.releasedAt || order.createdAt;
  return {
    kind, lang: base, rtl: base === 'ckb' || base === 'ar', lb,
    logo: p.logo && p.logo !== 'none' ? siteUrl(LOGOS[p.logo] || LOGOS.myfitness) : null,
    title: L(settings.brand?.cafeName, base) || 'MY FITNESS',
    sub: [L(p.header, base), settings.brand?.phone].filter(Boolean),
    no: `#${String(order.no).padStart(2, '0')}`,
    where, floor,
    tag: kind === 'kitchen' ? lb.kitchen : kind === 'test' ? lb.test : lb.receipt,
    sched: order.when === 'later' && order.scheduledFor ? `${lb.sched} ${clock(order.scheduledFor, base)} · ${dateShort(order.scheduledFor, base)}` : '',
    meta: [
      [lb.placed, `${dateShort(at, base)} · ${clock(at, base)}`],
      order.customer?.name ? [lb.customer, order.customer.name] : null,
      kind === 'receipt' && order.customer?.phone ? [lb.phone, fmtPhone(order.customer.phone)] : null,
    ].filter(Boolean),
    lines: order.items.map((l) => ({
      qty: l.qty, names: names(l.name), price: money(l.total),
      opts: (l.options || []).map((o) => (o.price ? `+ ${L(o.cn, base)} (${money(o.price)})` : `+ ${L(o.cn, base)}`)),
      note: l.note || '',
    })),
    count: order.items.reduce((a, l) => a + l.qty, 0),
    totals: [
      order.service ? [lb.service, money(order.service)] : null,
      order.tax ? [lb.tax, money(order.tax)] : null,
      order.service || order.tax ? [lb.subtotal, money(order.subtotal)] : null,
    ].filter(Boolean),
    total: `${money(order.total)} ${lb.cur}`,
    pay: `${lb.pay[order.payment?.method] || order.payment?.method || ''} · ${order.payment?.status === 'paid' ? lb.paid : lb.unpaid}`,
    note: order.note || '',
    footer: L(p.footer, base),
    qr: kind === 'receipt' && p.showQr && order.token ? trackUrl(order, settings) : '',
    qrLabel: lb.track,
    source: order.source === 'pos' ? lb.pos : lb.qr,
  };
}

/* ---------------- HTML (Windows driver / preview) ---------------- */
function ticketBody(m) {
  const k = m.kind === 'kitchen';
  const row = (a, b, cls = '') => `<div class="row ${cls}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`;
  return `<section class="tk ${k ? 'tk--k' : ''}" dir="${m.rtl ? 'rtl' : 'ltr'}">
    ${m.logo ? `<img class="logo" src="${esc(m.logo)}" alt="">` : `<div class="brand">${esc(m.title)}</div>`}
    ${m.logo && !k ? `<div class="c b">${esc(m.title)}</div>` : ''}
    ${!k ? m.sub.map((s) => `<div class="c sm">${esc(s)}</div>`).join('') : ''}
    <div class="tag">${esc(m.tag)} · ${esc(m.source)}</div>
    <div class="hero"><div class="no">${esc(m.no)}</div><div class="where">${esc(m.where)}</div>${m.floor ? `<div class="floor">${esc(m.floor)}</div>` : ''}</div>
    ${m.sched ? `<div class="sched">${esc(m.sched)}</div>` : ''}
    ${m.meta.map(([a, b]) => row(a, b, 'meta')).join('')}
    <hr>
    ${m.lines.map((l) => `<div class="ln"><div class="ln__top"><span class="q">${l.qty}×</span><span class="n">${l.names.map((n, i) => `<span class="${i ? 'alt' : ''}">${esc(n)}</span>`).join('')}</span>${!k ? `<span class="p">${esc(l.price)}</span>` : ''}</div>
      ${l.opts.map((o) => `<div class="opt">${esc(o)}</div>`).join('')}${l.note ? `<div class="lnote">» ${esc(l.note)}</div>` : ''}</div>`).join('')}
    <hr>
    ${m.note ? `<div class="onote"><b>${esc(m.lb.note)}:</b> ${esc(m.note)}</div>` : ''}
    ${!k ? `${m.totals.map(([a, b]) => row(a, b)).join('')}${row(m.lb.total, m.total, 'tot')}<div class="c pay">${esc(m.pay)}</div>` : `<div class="c sm">${m.count} ${esc(m.lb.items)}</div>`}
    ${m.qr ? `<div class="qr">${qrSVG(m.qr, { border: 1 })}</div><div class="c sm">${esc(m.qrLabel)}</div>` : ''}
    ${!k && m.footer ? `<div class="c foot">${esc(m.footer)}</div>` : ''}
  </section>`;
}
const TICKET_CSS = `
  @page { margin: 0 }
  * { box-sizing: border-box }
  html, body { margin: 0; padding: 0; background: #fff }
  body { width: var(--w); color: #000; font: 11pt/1.3 "Segoe UI", Tahoma, Arial, "Noto Sans Arabic", sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact }
  .tk { padding: 2mm 1.5mm 6mm; page-break-after: always; break-after: page }
  .tk:last-child { page-break-after: auto; break-after: auto }
  .logo { display: block; width: 88%; margin: 0 auto 1.5mm; image-rendering: pixelated }
  .brand { text-align: center; font-weight: 900; font-size: 18pt; letter-spacing: .5pt }
  .c { text-align: center } .b { font-weight: 800 } .sm { font-size: 9pt }
  .tag { margin: 2mm auto 1mm; text-align: center; font-size: 9pt; font-weight: 800; letter-spacing: 1pt; text-transform: uppercase; border: 1.5pt solid #000; border-radius: 99px; padding: .5mm 3mm; width: max-content; max-width: 100% }
  .hero { text-align: center; margin: 1mm 0 2mm }
  .no { font-size: 30pt; font-weight: 900; line-height: 1 }
  .where { display: inline-block; margin-top: 1.5mm; background: #000; color: #fff; font-weight: 900; font-size: 15pt; padding: .6mm 3mm; border-radius: 1.5mm }
  .floor { font-size: 10pt; font-weight: 700; margin-top: 1mm }
  .sched { text-align: center; border: 2pt dashed #000; padding: 1.2mm; font-weight: 900; margin: 1mm 0 2mm; font-size: 11pt }
  .row { display: flex; justify-content: space-between; gap: 3mm }
  .row span:last-child { text-align: end; font-weight: 700 }
  .meta { font-size: 10pt }
  hr { border: 0; border-top: 1.2pt dashed #000; margin: 2mm 0 }
  .ln { margin: 0 0 1.6mm; break-inside: avoid }
  .ln__top { display: flex; gap: 2mm; align-items: baseline; font-weight: 700 }
  .q { min-width: 7mm; font-weight: 900 }
  .n { flex: 1; display: flex; flex-direction: column }
  .n .alt { font-weight: 600; font-size: 10pt }
  .p { white-space: nowrap }
  .opt { padding-inline-start: 9mm; font-size: 9.5pt }
  .lnote { margin: .5mm 0 0 9mm; margin-inline-start: 9mm; font-weight: 800; font-size: 10pt }
  .onote { border: 1.2pt solid #000; padding: 1.2mm; margin: 0 0 2mm; font-size: 10pt }
  .tot { font-size: 14pt; font-weight: 900; margin-top: 1mm }
  .pay { margin-top: 1mm; font-weight: 800; font-size: 10pt }
  .qr { width: 30mm; margin: 3mm auto 1mm } .qr svg { width: 100%; height: auto; display: block }
  .foot { margin-top: 3mm; font-weight: 700 }
  .tk--k { font-size: 13pt }
  .tk--k .ln__top { font-size: 14pt }
  .tk--k .q { font-size: 15pt }
  .tk--k .opt { font-size: 11.5pt; font-weight: 600 }
  .tk--k .lnote { font-size: 12pt; background: #000; color: #fff; padding: .4mm 1.5mm; border-radius: 1mm; display: inline-block }
  .tk--k .no { font-size: 40pt }
`;
export function ticketsHTML(order, settings, kinds) {
  const w = settings.printer?.paper === 58 ? '48mm' : '72mm';
  const bodies = kinds.map((k) => ticketBody(ticketModel(order, settings, k))).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Ticket #${order.no}</title><style>:root{--w:${w}}${TICKET_CSS}</style></head><body>${bodies}</body></html>`;
}
export const ticketPreviewCSS = TICKET_CSS;
export const ticketPreviewBody = (order, settings, kind) => ticketBody(ticketModel(order, settings, kind));

function browserPrint(htmlDoc) {
  return new Promise((resolve) => {
    const f = document.createElement('iframe');
    f.setAttribute('aria-hidden', 'true');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(f);
    const doc = f.contentDocument;
    doc.open(); doc.write(htmlDoc); doc.close();
    let done = false;
    const go = () => {
      if (done) return; done = true;
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { console.error(e); }
      setTimeout(() => { f.remove(); resolve(true); }, 800);
    };
    const imgs = [...doc.images];
    let left = imgs.length;
    if (!left) setTimeout(go, 60);
    imgs.forEach((im) => {
      const fin = () => { if (--left <= 0) setTimeout(go, 60); };
      if (im.complete) fin(); else { im.onload = fin; im.onerror = fin; }
    });
    setTimeout(go, 3000);
  });
}

/* ---------------- Raster (ESC/POS image) ---------------- */
const imgCache = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (!imgCache.has(src)) {
    imgCache.set(src, new Promise((res) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    }));
  }
  return imgCache.get(src);
}
const FONT = '"Segoe UI", Tahoma, Arial, "Noto Sans Arabic", sans-serif';

export async function renderTicketCanvas(order, settings, kind) {
  const m = ticketModel(order, settings, kind);
  const W = settings.printer?.paper === 58 ? 384 : 576;
  const S = W / 576; // scale for 58 mm
  const pad = Math.round(8 * S);
  try { await document.fonts?.ready; } catch {}
  const c = document.createElement('canvas');
  c.width = W; c.height = 4200;
  const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, W, c.height);
  x.fillStyle = '#000'; x.textBaseline = 'alphabetic';
  let y = Math.round(10 * S);
  const K = kind === 'kitchen';
  const setFont = (sz, wt = 500) => { x.font = `${wt} ${Math.round(sz * S)}px ${FONT}`; };
  const put = (s, ax, align) => { x.direction = isRtlText(s) ? 'rtl' : 'ltr'; x.textAlign = align; x.fillText(s, ax, y); };
  const wrap = (s, maxW) => {
    const words = String(s).split(/\s+/);
    const out = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (x.measureText(test).width <= maxW || !cur) cur = test; else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const para = (s, { sz = 22, wt = 500, align = 'center', lh = 1.3 } = {}) => {
    setFont(sz, wt);
    for (const ln of wrap(s, W - pad * 2)) {
      y += Math.round(sz * S * lh);
      const ax = align === 'center' ? W / 2 : (align === 'start') !== m.rtl ? pad : W - pad;
      put(ln, ax, align === 'center' ? 'center' : (align === 'start') !== m.rtl ? 'left' : 'right');
    }
  };
  const gap = (h) => { y += Math.round(h * S); };
  const rule = () => { gap(12); x.fillRect(pad, y, W - pad * 2, Math.max(2, Math.round(2 * S))); gap(6); };
  const row = (a, b, { sz = 22, wt = 500, wtb = 700 } = {}) => {
    setFont(sz, wt);
    y += Math.round(sz * S * 1.35);
    const [la, lb] = m.rtl ? [W - pad, pad] : [pad, W - pad];
    put(a, la, m.rtl ? 'right' : 'left');
    setFont(sz, wtb);
    put(b, lb, m.rtl ? 'left' : 'right');
  };
  const pill = (s, { sz = 34, inv = true, wt = 900 } = {}) => {
    setFont(sz, wt);
    const w = Math.min(W - pad * 2, x.measureText(s).width + 36 * S);
    const h = Math.round(sz * S * 1.45);
    const bx = (W - w) / 2;
    if (inv) { x.fillStyle = '#000'; x.fillRect(bx, y + 4 * S, w, h); x.fillStyle = '#fff'; }
    else { x.lineWidth = 3 * S; x.strokeRect(bx, y + 4 * S, w, h); }
    y += Math.round(h * 0.78 + 4 * S);
    put(s, W / 2, 'center');
    x.fillStyle = '#000';
    y += Math.round(h * 0.3);
  };

  // header
  const logo = await loadImage(m.logo);
  if (logo) {
    const lw = Math.round(W * 0.86), lh = Math.round((logo.height / logo.width) * lw);
    x.imageSmoothingEnabled = false;
    x.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh;
  } else para(m.title, { sz: 40, wt: 900 });
  if (!K) { if (logo) para(m.title, { sz: 24, wt: 800 }); m.sub.forEach((s) => para(s, { sz: 20 })); }
  gap(10);
  pill(`${m.tag} · ${m.source}`, { sz: 20, inv: false, wt: 800 });
  // hero
  para(m.no, { sz: K ? 92 : 64, wt: 900, lh: 1.05 });
  gap(6);
  pill(m.where, { sz: K ? 40 : 30 });
  if (m.floor) para(m.floor, { sz: 22, wt: 700 });
  if (m.sched) { gap(8); pill(m.sched, { sz: K ? 26 : 22, inv: false }); }
  gap(4);
  m.meta.forEach(([a, b]) => row(a, b, { sz: 21 }));
  rule();
  // items
  for (const l of m.lines) {
    const qsz = K ? 34 : 24, nsz = K ? 32 : 23;
    setFont(qsz, 900);
    const qtyTxt = `${l.qty}×`;
    const qW = Math.max(x.measureText('99×').width, x.measureText(qtyTxt).width) + 10 * S;
    setFont(nsz, 800);
    const priceW = K ? 0 : x.measureText(l.price).width + 14 * S;
    const nameW = W - pad * 2 - qW - priceW;
    let first = true;
    for (let ni = 0; ni < l.names.length; ni++) {
      setFont(ni ? nsz * 0.82 : nsz, ni ? 600 : 800);
      for (const ln of wrap(l.names[ni], nameW)) {
        y += Math.round((ni ? nsz * 0.82 : nsz) * S * 1.3);
        if (first) {
          setFont(qsz, 900); put(qtyTxt, m.rtl ? W - pad : pad, m.rtl ? 'right' : 'left');
          if (!K) { setFont(nsz, 700); put(l.price, m.rtl ? pad : W - pad, m.rtl ? 'left' : 'right'); }
          setFont(ni ? nsz * 0.82 : nsz, ni ? 600 : 800);
          first = false;
        }
        put(ln, m.rtl ? W - pad - qW : pad + qW, m.rtl ? 'right' : 'left');
      }
    }
    for (const o of l.opts) {
      setFont(K ? 25 : 19, K ? 600 : 500);
      for (const ln of wrap(o, nameW)) { y += Math.round((K ? 25 : 19) * S * 1.3); put(ln, m.rtl ? W - pad - qW : pad + qW, m.rtl ? 'right' : 'left'); }
    }
    if (l.note) {
      setFont(K ? 26 : 20, 800);
      for (const ln of wrap(`» ${l.note}`, nameW)) {
        const h = Math.round((K ? 26 : 20) * S * 1.45);
        if (K) { x.fillRect(m.rtl ? pad : pad + qW - 6 * S, y + 6 * S, nameW + 6 * S, h); x.fillStyle = '#fff'; }
        y += Math.round(h * 0.82);
        put(ln, m.rtl ? W - pad - qW : pad + qW, m.rtl ? 'right' : 'left');
        x.fillStyle = '#000';
        y += Math.round(h * 0.18);
      }
    }
    gap(K ? 12 : 8);
  }
  rule();
  if (m.note) { para(`${m.lb.note}: ${m.note}`, { sz: K ? 26 : 21, wt: 800, align: 'start' }); gap(6); }
  if (!K) {
    m.totals.forEach(([a, b]) => row(a, b, { sz: 21 }));
    row(m.lb.total, m.total, { sz: 32, wt: 900, wtb: 900 });
    para(m.pay, { sz: 21, wt: 800 });
  } else para(`${m.count} ${m.lb.items}`, { sz: 22, wt: 700 });
  if (m.qr) {
    gap(16);
    const q = Math.round(200 * S);
    drawQR(x, m.qr, (W - q) / 2, y, q, { border: 1 });
    y += q;
    para(m.qrLabel, { sz: 19 });
  }
  if (!K && m.footer) { gap(10); para(m.footer, { sz: 22, wt: 800 }); }
  gap(24);
  const out = document.createElement('canvas');
  out.width = W; out.height = Math.min(c.height, y);
  out.getContext('2d').drawImage(c, 0, 0);
  return out;
}

async function rasterBytes(order, settings, kind) {
  const canvas = await renderTicketCanvas(order, settings, kind);
  const e = new Escpos().init().align('center').raster(canvasToRaster(canvas)).feed(4);
  if (settings.printer?.cut !== false) e.cut();
  return e.bytes();
}

/* ---------------- Text mode (fast, English) ---------------- */
function textBytes(order, settings, kind) {
  const m = ticketModel(order, settings, kind, 'en');
  const cols = settings.printer?.paper === 58 ? 32 : 48;
  const K = kind === 'kitchen';
  const latin = (s) => (/[A-Za-z0-9]/.test(s) && !isRtlText(s) ? s : '');
  const lr = (a, b, w = cols) => { a = String(a); b = String(b); const space = Math.max(1, w - a.length - b.length); return (a + ' '.repeat(space) + b).slice(0, Math.max(w, a.length + b.length)); };
  const e = new Escpos().init().align('center');
  e.bold(true).size(2, 2).line('MY FITNESS').size(1, 1).bold(false);
  if (!K) m.sub.map(latin).filter(Boolean).forEach((s) => e.line(s));
  e.line(`[ ${m.tag} - ${m.source} ]`);
  e.bold(true).size(K ? 3 : 2, K ? 3 : 2).line(m.no).size(2, 2).invert(true).line(` ${m.where} `).invert(false).size(1, 1).bold(false);
  if (m.floor) e.line(m.floor);
  if (m.sched) e.bold(true).line(m.sched).bold(false);
  e.align('left');
  m.meta.forEach(([a, b]) => { const v = latin(b) || '-'; e.line(lr(a, v)); });
  e.line('-'.repeat(cols));
  for (const l of m.lines) {
    const name = `${l.qty}x ${l.names[0]}`;
    if (K) e.bold(true).size(1, 2).line(name).size(1, 1).bold(false);
    else e.bold(true).line(lr(name.slice(0, cols - l.price.length - 1), l.price)).bold(false);
    l.opts.forEach((o) => e.line('   ' + o));
    if (l.note && latin(l.note)) e.bold(true).line('   >> ' + l.note).bold(false);
  }
  e.line('-'.repeat(cols));
  if (m.note && latin(m.note)) e.bold(true).line('NOTE: ' + m.note).bold(false);
  if (!K) {
    m.totals.forEach(([a, b]) => e.line(lr(a, b)));
    e.bold(true).size(1, 2).line(lr(m.lb.total, m.total)).size(1, 1).bold(false);
    e.align('center').line(m.pay);
    if (m.qr) e.feed(1).qr(m.qr, 6).line(m.qrLabel);
    if (m.footer) e.feed(1).line(m.footer);
  } else e.align('center').line(`${m.count} items`);
  e.feed(4);
  if (settings.printer?.cut !== false) e.cut();
  return e.bytes();
}

export async function ticketBytes(order, settings, kind) {
  return settings.printer?.format === 'text' ? textBytes(order, settings, kind) : rasterBytes(order, settings, kind);
}

/**
 * Print an order. kinds: ['kitchen'] | ['receipt'] | ['kitchen','receipt'].
 * Returns true on success; throws with a readable message on failure.
 */
export async function printOrder({ order, settings, kinds, store, drawer = false }) {
  const p = settings.printer || {};
  const list = [];
  for (const k of kinds) {
    const copies = Math.max(1, k === 'kitchen' ? p.kitchenCopies ?? 1 : p.receiptCopies ?? 1);
    for (let i = 0; i < copies; i++) list.push(k);
  }
  if (!list.length) return false;
  if ((p.mode || 'browser') === 'browser') return browserPrint(ticketsHTML(order, settings, list));
  const parts = [];
  for (const k of list) parts.push(await ticketBytes(order, settings, k));
  if (drawer) parts.push(new Escpos().drawer().bytes());
  const bytes = concatBytes(parts);
  if (p.mode === 'rawbt') {
    location.href = `intent:base64,${b64(bytes)}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
    return true;
  }
  const target = p.target === 'windows' ? { type: 'windows', printer: p.windowsPrinter } : { type: 'network', host: p.host, port: Number(p.port) || 9100 };
  return store.print(bytes, target, p);
}

/** A sample order used by "Test print" and the live preview. */
export function sampleOrder(items) {
  const pick = (id) => items.find((i) => i.id === id) || items[0];
  const a = pick('protein-bowl'), b = pick('latte'), c = pick('protein-shake');
  const opt = (it, gi = 0, ci = 0) => (it?.options?.[gi]?.choices?.[ci] ? [{ gn: it.options[gi].name, cn: it.options[gi].choices[ci].name, price: it.options[gi].choices[ci].price }] : []);
  const line = (it, qty, options = [], note = '') => ({ id: it.id, name: it.name, qty, unit: it.price + options.reduce((s, o) => s + o.price, 0), options, note, total: (it.price + options.reduce((s, o) => s + o.price, 0)) * qty });
  const lines = [line(a, 1, opt(a, 0, 0), 'No onion'), line(b, 2, [...opt(b, 0, 2), ...opt(b, 1, 2)]), line(c, 1, opt(c, 0, 0))];
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const now = Date.now();
  return {
    id: 'sample', token: 'sample', no: 23, createdAt: now, releasedAt: now, status: 'new', type: 'dinein', table: 'L5', floor: 'ladies',
    customer: { name: 'Sara', phone: '07508212524' }, when: 'now', items: lines, subtotal, service: 0, tax: 0, total: subtotal,
    payment: { method: 'cash', status: 'unpaid' }, note: 'Please bring extra napkins', source: 'qr',
  };
}
