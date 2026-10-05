// MY FITNESS — shared helpers (browser + Node). No dependencies.

/* ---------- Safe HTML templating ----------
   html`...${value}...` escapes every interpolation unless it is itself an html``
   result (or raw()). Arrays are joined. false/null/undefined render nothing. */
export const raw = (s) => ({ __html: String(s ?? '') });
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"'`]/g, (c) => ESC_MAP[c]);
function val(v) {
  if (v == null || v === false || v === true) return '';
  if (Array.isArray(v)) return v.map(val).join('');
  if (typeof v === 'object' && '__html' in v) return v.__html;
  return esc(v);
}
export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += val(values[i]) + strings[i + 1];
  return raw(out);
}
export const toHTML = (tpl) => val(tpl);
export function render(el, tpl) { if (el) el.innerHTML = val(tpl); return el; }
export const $ = (sel, root = globalThis.document) => root.querySelector(sel);
export const $$ = (sel, root = globalThis.document) => [...root.querySelectorAll(sel)];

/* ---------- ids ---------- */
const ALPH = '0123456789abcdefghijklmnopqrstuvwxyz';
export function rid(len = 12) {
  const a = new Uint8Array(len);
  globalThis.crypto.getRandomValues(a);
  let s = '';
  for (const b of a) s += ALPH[b % 36];
  return s;
}
export const uid = (prefix = '') => prefix + Date.now().toString(36) + rid(5);
export const slug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40) || 'item';

/* ---------- numbers & money ---------- */
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
export const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
/** Prices are always Iraqi Dinar (IQD) — shown as "IQD" in every language. */
export const CURRENCY = 'IQD';
export const money = (n) => `${fmtNum(n)} ${CURRENCY}`;
export function compact(n) {
  n = Number(n) || 0;
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (a >= 1e4) return Math.round(n / 1e3) + 'K';
  return fmtNum(n);
}
export const pct = (a, b) => (b ? ((a - b) / b) * 100 : null);

/* ---------- business time (fixed offset, Iraq = UTC+3) ----------
   All "business day" math uses this offset so a phone, a PC and a cloud
   server agree on what "today" and "18:30" mean. */
export const TZ = { off: 180 };
export const setTz = (min) => { TZ.off = Number.isFinite(+min) ? +min : 180; };
const pad = (n) => String(n).padStart(2, '0');
export const biz = (ts = Date.now()) => new Date(ts + TZ.off * 60000); // read with getUTC*
export const dayKey = (ts = Date.now()) => biz(ts).toISOString().slice(0, 10);
export const hhmm = (ts) => { const d = biz(ts); return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()); };
export const hourOf = (ts) => biz(ts).getUTCHours();
export const weekdayOf = (ts) => biz(ts).getUTCDay(); // 0 = Sunday
export const minuteOfDay = (ts) => { const d = biz(ts); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
export function startOfDay(ts = Date.now()) { const d = biz(ts); d.setUTCHours(0, 0, 0, 0); return d.getTime() - TZ.off * 60000; }
export function bizTs(day, time = '00:00') {
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = String(time).split(':').map(Number);
  return Date.UTC(y, m - 1, d, h || 0, mi || 0) - TZ.off * 60000;
}
export const parseHM = (s) => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const addDays = (day, n) => dayKey(bizTs(day, '12:00') + n * 86400000);

/* ---------- phone (Iraq mobile: 07XX XXX XXXX) ---------- */
export function normDigits(s) {
  return String(s ?? '')
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
}
export function normPhone(s) {
  let p = normDigits(s).replace(/[^\d+]/g, '');
  if (p.startsWith('+964')) p = '0' + p.slice(4);
  else if (p.startsWith('00964')) p = '0' + p.slice(5);
  else if (p.startsWith('964') && p.length === 13) p = '0' + p.slice(3);
  else if (/^7\d{9}$/.test(p)) p = '0' + p;
  return p;
}
export const validPhone = (s) => /^07\d{9}$/.test(normPhone(s));
export function fmtPhone(s) {
  const p = normPhone(s);
  return /^07\d{9}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : String(s || '');
}

/* ---------- misc ---------- */
export const clone = (o) => (o === undefined ? o : typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function groupBy(arr, f) {
  const m = new Map();
  for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return m;
}
export const bySort = (a, b) => (a.sort ?? 0) - (b.sort ?? 0);
export const isRtlText = (s) => /[֐-ࣿ]/.test(String(s || ''));
export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return globalThis.btoa ? globalThis.btoa(s) : Buffer.from(bytes).toString('base64');
}
export function csv(rows) {
  const cell = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
export function download(name, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
/* Seeded PRNG for repeatable demo data */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pickWeighted(rnd, items, weightOf) {
  const total = sum(items, weightOf);
  let r = rnd() * total;
  for (const it of items) { r -= weightOf(it); if (r <= 0) return it; }
  return items[items.length - 1];
}
