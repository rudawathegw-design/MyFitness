// Lightweight SVG charts: thin marks, hairline grid, hover/focus tooltips.
// chart(type, spec) returns a placeholder; mountCharts(root) renders it at the
// container's real width (and re-renders on resize).
import { html, esc, fmtNum, compact } from './util.js';

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const fmtV = (s, v) => (s.fmt === 'money' ? `${fmtNum(v)} ${s.unit || ''}`.trim() : s.fmt === 'min' ? `${(Math.round(v * 10) / 10).toFixed(1)} ${s.unit || ''}`.trim() : `${fmtNum(v)}${s.unit ? ' ' + s.unit : ''}`);
const axisV = (s, v) => (s.fmt === 'money' ? compact(v) : fmtNum(v));

export function chart(type, spec) {
  return html`<div class="viz viz--${type}" data-viz="${type}" data-spec="${JSON.stringify(spec)}"></div>`;
}

const R = {};
R.column = (el, s, W) => {
  const H = s.height || 220, ml = 44, mr = 8, mt = 22, mb = 26;
  const pw = Math.max(40, W - ml - mr), ph = H - mt - mb;
  const vals = s.data.map((d) => d.v);
  const max = niceMax(Math.max(0, ...vals));
  const n = Math.max(1, s.data.length), band = pw / n, bw = Math.max(3, Math.min(24, band * 0.62));
  const base = mt + ph;
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4, y = base - (v / max) * ph;
    grid += `<line class="viz-grid" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/><text class="viz-axis" x="${ml - 8}" y="${y + 4}" text-anchor="end">${esc(axisV(s, v))}</text>`;
  }
  const hi = s.highlight === 'max' ? vals.indexOf(Math.max(...vals)) : s.highlight === 'last' ? n - 1 : -1;
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 38))));
  let bars = '', labels = '', hiLabel = '';
  s.data.forEach((d, i) => {
    const x = ml + i * band + (band - bw) / 2;
    const h = max ? (d.v / max) * ph : 0;
    const y = base - h, r = Math.min(4, h, bw / 2);
    const path = h > 0.5 ? `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${base}Z` : '';
    bars += `<g class="viz-bar${i === hi ? ' is-hi' : ''}" tabindex="0" role="img" aria-label="${esc(`${d.t || d.l}: ${fmtV(s, d.v)}`)}" data-t="${esc(d.t || d.l)}" data-v="${esc(fmtV(s, d.v))}"><rect class="viz-hit" x="${ml + i * band}" y="${mt}" width="${band}" height="${ph}"/>${path ? `<path d="${path}"/>` : ''}</g>`;
    if (i % every === 0) labels += `<text class="viz-axis" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.l)}</text>`;
    if (i === hi && d.v > 0) hiLabel = `<text class="viz-val" x="${x + bw / 2}" y="${y - 7}" text-anchor="middle">${esc(axisV(s, d.v))}</text>`;
  });
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(s.label || '')}">${grid}<line class="viz-base" x1="${ml}" x2="${W - mr}" y1="${base}" y2="${base}"/>${bars}${labels}${hiLabel}</svg><div class="viz-tip" hidden></div>`;
};

R.line = (el, s, W) => {
  const H = s.height || 230, ml = 46, mr = 14, mt = 24, mb = 26;
  const pw = Math.max(40, W - ml - mr), ph = H - mt - mb, base = mt + ph;
  const n = s.data.length;
  const max = niceMax(Math.max(0, ...s.data.map((d) => d.v)));
  const X = (i) => ml + (n <= 1 ? pw / 2 : (i * pw) / (n - 1));
  const Y = (v) => base - (max ? (v / max) * ph : 0);
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = (max * i) / 4, y = Y(v);
    grid += `<line class="viz-grid" x1="${ml}" x2="${W - mr}" y1="${y}" y2="${y}"/><text class="viz-axis" x="${ml - 8}" y="${y + 4}" text-anchor="end">${esc(axisV(s, v))}</text>`;
  }
  const pts = s.data.map((d, i) => [X(i), Y(d.v)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const area = n ? `${line}L${pts[n - 1][0]},${base}L${pts[0][0]},${base}Z` : '';
  const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(pw / 52))));
  let labels = '';
  s.data.forEach((d, i) => { if (i % every === 0 || i === n - 1) labels += `<text class="viz-axis" x="${X(i)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${esc(d.l)}</text>`; });
  const last = pts[n - 1];
  const end = last ? `<circle class="viz-dot" cx="${last[0]}" cy="${last[1]}" r="4"/><text class="viz-val" x="${last[0] - 8}" y="${last[1] - 10}" text-anchor="end">${esc(axisV(s, s.data[n - 1].v))}</text>` : '';
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.label || '')}">${grid}<line class="viz-base" x1="${ml}" x2="${W - mr}" y1="${base}" y2="${base}"/><path class="viz-area" d="${area}"/><path class="viz-line" d="${line}"/>${end}${labels}<line class="viz-cross" x1="0" x2="0" y1="${mt}" y2="${base}" hidden/><circle class="viz-dot viz-focus" r="5" hidden/><rect class="viz-hit viz-hit--line" x="${ml}" y="${mt}" width="${pw}" height="${ph}" tabindex="0"/></svg><div class="viz-tip" hidden></div>`;
  el._pts = pts;
};

R.heat = (el, s, W) => {
  const rows = s.rows, cols = s.cols, vals = s.values;
  const ml = 54, mt = 6, mb = 24;
  const cw = Math.max(10, (W - ml - 4) / cols.length);
  const ch = Math.min(30, Math.max(18, cw * 0.8));
  const H = mt + rows.length * ch + mb;
  const max = Math.max(1, ...vals.flat());
  let cells = '';
  rows.forEach((r, ri) => {
    cells += `<text class="viz-axis" x="${ml - 8}" y="${mt + ri * ch + ch / 2 + 4}" text-anchor="end">${esc(r)}</text>`;
    cols.forEach((c, ci) => {
      const v = vals[ri][ci] || 0;
      const a = v ? 0.1 + 0.9 * (v / max) : 0.035;
      cells += `<rect class="viz-cell" tabindex="0" x="${ml + ci * cw + 1}" y="${mt + ri * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" style="fill-opacity:${a.toFixed(3)}" data-t="${esc(`${r} · ${c}`)}" data-v="${esc(fmtV(s, v))}"/>`;
    });
  });
  const every = Math.max(1, Math.ceil(cols.length / Math.max(1, Math.floor((W - ml) / 30))));
  let xl = '';
  cols.forEach((c, ci) => { if (ci % every === 0) xl += `<text class="viz-axis" x="${ml + ci * cw + cw / 2}" y="${H - 6}" text-anchor="middle">${esc(c)}</text>`; });
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="group" aria-label="${esc(s.label || '')}">${cells}${xl}</svg>
    <div class="viz-scale"><span>${esc(s.less || '0')}</span>${[0.1, 0.3, 0.55, 0.8, 1].map((a) => `<i style="opacity:${a}"></i>`).join('')}<span>${esc(fmtV(s, max))}</span></div><div class="viz-tip" hidden></div>`;
};

R.spark = (el, s, W) => {
  const H = s.height || 34, n = s.data.length;
  if (n < 2) { el.innerHTML = ''; return; }
  const max = Math.max(...s.data), min = Math.min(...s.data);
  const X = (i) => 2 + (i * (W - 6)) / (n - 1);
  const Y = (v) => H - 4 - ((v - min) / (max - min || 1)) * (H - 8);
  const d = s.data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="viz-spark" d="${d}"/><circle class="viz-dot" cx="${X(n - 1)}" cy="${Y(s.data[n - 1])}" r="3"/></svg>`;
};

/** Part-to-whole bar + legend (pure HTML). segments: [{l, v, c}] c = slot 1..4 */
export function stackBar(segments, { fmt = (v) => fmtNum(v), label = '' } = {}) {
  const total = segments.reduce((a, s) => a + s.v, 0) || 1;
  return html`<div class="stack" role="img" aria-label="${label}">
    <div class="stack__bar">${segments.filter((s) => s.v > 0).map((s) => html`<span class="stack__seg c${s.c}" style="flex:${s.v}" data-t="${s.l}" data-v="${`${fmt(s.v)} · ${Math.round((s.v / total) * 100)}%`}" tabindex="0"></span>`)}</div>
    <ul class="stack__legend">${segments.map((s) => html`<li><i class="c${s.c}"></i><span class="stack__l">${s.l}</span><b>${fmt(s.v)}</b><em>${Math.round((s.v / total) * 100)}%</em></li>`)}</ul>
  </div>`;
}

/** Ranked horizontal bars (pure HTML). rows: [{l, v, sub}] */
export function hbars(rows, { fmt = (v) => fmtNum(v), img } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return html`<ol class="hbars">${rows.map((r, i) => html`<li>
    <span class="hbars__rank">${i + 1}</span>
    ${img && r.img ? html`<img src="${img(r.img)}" alt="" loading="lazy">` : ''}
    <div class="hbars__body"><div class="hbars__top"><span class="hbars__l">${r.l}</span><b>${fmt(r.v)}</b></div>
    <div class="hbars__track"><span style="width:${((r.v / max) * 100).toFixed(1)}%"></span></div>
    ${r.sub ? html`<small>${r.sub}</small>` : ''}</div></li>`)}</ol>`;
}

function bindTip(el) {
  const tip = el.querySelector('.viz-tip');
  if (!tip) return;
  const show = (t, v, cx, cy) => {
    tip.textContent = '';
    const b = document.createElement('b'); b.textContent = v;
    const s = document.createElement('span'); s.textContent = t;
    tip.append(b, s);
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    let left = cx - r.left - tw / 2;
    left = Math.max(0, Math.min(r.width - tw, left));
    tip.style.left = left + 'px';
    tip.style.top = Math.max(0, cy - r.top - tip.offsetHeight - 12) + 'px';
  };
  const hide = () => { tip.hidden = true; };
  el.querySelectorAll('[data-t]').forEach((m) => {
    const fire = (e) => {
      const bb = m.getBoundingClientRect();
      const cx = e?.clientX ?? bb.left + bb.width / 2;
      const ref = m.querySelector('path') || m;
      const rb = ref.getBoundingClientRect();
      show(m.dataset.t, m.dataset.v, cx, rb.top);
    };
    m.addEventListener('pointermove', fire);
    m.addEventListener('focus', () => fire());
    m.addEventListener('pointerleave', hide);
    m.addEventListener('blur', hide);
  });
  const hit = el.querySelector('.viz-hit--line');
  if (hit && el._pts) {
    const svg = el.querySelector('svg');
    const cross = el.querySelector('.viz-cross');
    const dot = el.querySelector('.viz-focus');
    const spec = el._spec;
    const at = (i) => {
      const p = el._pts[i];
      cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.hidden = false;
      dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.hidden = false;
      const sr = svg.getBoundingClientRect();
      const d = spec.data[i];
      show(d.t || d.l, fmtV(spec, d.v), sr.left + p[0], sr.top + p[1]);
    };
    let idx = el._pts.length - 1;
    hit.addEventListener('pointermove', (e) => {
      const sr = svg.getBoundingClientRect();
      const x = e.clientX - sr.left;
      let best = 0, bd = Infinity;
      el._pts.forEach((p, i) => { const dd = Math.abs(p[0] - x); if (dd < bd) { bd = dd; best = i; } });
      idx = best; at(best);
    });
    hit.addEventListener('focus', () => at(idx));
    hit.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { idx = Math.min(el._pts.length - 1, idx + 1); at(idx); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { idx = Math.max(0, idx - 1); at(idx); e.preventDefault(); }
    });
    const off = () => { cross.hidden = true; dot.hidden = true; hide(); };
    hit.addEventListener('pointerleave', off);
    hit.addEventListener('blur', off);
  }
}

const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
  for (const en of entries) {
    const el = en.target;
    const w = Math.floor(en.contentRect.width);
    if (w > 0 && w !== el._w) requestAnimationFrame(() => draw(el, w));
  }
}) : null;
function draw(el, w) {
  el._w = w;
  const fn = R[el.dataset.viz];
  if (!fn) return;
  fn(el, el._spec, w);
  bindTip(el);
}
export function mountCharts(root = document) {
  root.querySelectorAll('[data-viz]').forEach((el) => {
    if (!el._spec) { try { el._spec = JSON.parse(el.dataset.spec); } catch { return; } }
    const w = Math.floor(el.clientWidth) || 320;
    draw(el, w);
    ro?.observe(el);
  });
  root.querySelectorAll('.stack').forEach((st) => {
    if (st._bound) return;
    st._bound = true;
    st.classList.add('viz');
    const tip = document.createElement('div');
    tip.className = 'viz-tip'; tip.hidden = true;
    st.appendChild(tip);
    bindTip(st);
  });
}
