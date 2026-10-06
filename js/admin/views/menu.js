// Menu management: categories, items, photos (upload / paste / crop), options, nutrition.
import { html, raw, render, $, $$, fmtNum, clone } from '../../core/util.js';
import { t, L } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { loadImageFile, loadImageUrl, coverRect, drawCover, exportSquare } from '../../core/image.js';
import { A, money, can, catById } from '../ctx.js';
import { call, modal, modalHead, confirmBox, toast, emptyState } from '../ui.js';

const M = { cat: 'all', q: '' };
const TAGS = [['popular', 'flame'], ['protein', 'dumbbell'], ['veg', 'leaf'], ['new', 'sparkles'], ['spicy', 'flame']];
const CAT_ICONS = ['bowl', 'shake', 'coffee', 'pizza', 'utensils', 'leaf', 'flame', 'star', 'sparkles', 'dumbbell'];
const LANG3 = [['en', 'english', 'ltr'], ['ckb', 'kurdish', 'rtl'], ['ar', 'arabic', 'rtl']];

function catsPanel() {
  const count = (id) => A.d.items.filter((i) => id === 'all' || i.cat === id).length;
  const cats = [...A.d.categories].sort((a, b) => a.sort - b.sort);
  return html`<header class="panel-head"><h3>${t('categories')}</h3>${can('menu.edit') ? html`<button class="btn btn--sm" data-cat-new>${icon('plus')}</button>` : ''}</header>
    <ul class="cat-list">
      <li><button class="cat-row ${M.cat === 'all' ? 'is-on' : ''}" data-cat="all">${icon('grid')}<span class="grow">${t('allItems')}</span><b>${count('all')}</b></button></li>
      ${cats.map((c, i) => html`<li><button class="cat-row ${M.cat === c.id ? 'is-on' : ''} ${c.active === false ? 'is-off' : ''}" data-cat="${c.id}">${icon(c.icon || 'utensils')}<span class="grow">${L(c.name)}</span><b>${count(c.id)}</b></button>
        ${can('menu.edit') ? html`<span class="cat-tools"><button class="btn btn--ghost btn--icon btn--sm" data-cat-up="${i}" ${i === 0 ? raw('disabled') : ''} aria-label="up">${icon('arrowUp')}</button><button class="btn btn--ghost btn--icon btn--sm" data-cat-edit="${c.id}" aria-label="${t('edit')}">${icon('edit')}</button></span>` : ''}</li>`)}
    </ul>`;
}
function itemsPanel() {
  const q = M.q.trim().toLowerCase();
  const list = A.d.items.filter((i) => (M.cat === 'all' || i.cat === M.cat) && (!q || [i.name.en, i.name.ckb, i.name.ar].join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (catById(a.cat)?.sort || 0) - (catById(b.cat)?.sort || 0) || a.sort - b.sort);
  return html`<div class="items-bar">
      <div class="input-icon grow">${icon('search')}<input class="input" id="m-q" value="${M.q}" placeholder="${t('searchItems')}"></div>
      ${can('menu.edit') ? html`<button class="btn btn--gold" data-item-new>${icon('plus')} ${t('addItem')}</button>` : ''}
    </div>
    <p class="hint">${icon('info')} ${t('quickSoldOut')}</p>
    ${list.length ? html`<ul class="mlist">${list.map((it, i) => html`<li class="mrow ${it.available === false ? 'is-out' : ''}">
      ${can('menu.edit') && M.cat !== 'all' ? html`<div class="mrow__order"><button class="btn btn--ghost btn--icon btn--sm" data-up="${it.id}" ${i === 0 ? raw('disabled') : ''} aria-label="up">${icon('arrowUp')}</button><button class="btn btn--ghost btn--icon btn--sm" data-down="${it.id}" ${i === list.length - 1 ? raw('disabled') : ''} aria-label="down">${icon('arrowDown')}</button></div>` : ''}
      <button class="mrow__img" data-edit="${it.id}">${it.img ? html`<img src="${A.store.img(it.img, 160)}" alt="" loading="lazy">` : icon('image')}</button>
      <div class="mrow__body"><button class="mrow__name" data-edit="${it.id}">${L(it.name)}</button>
        <small class="mrow__alt">${[it.name.en, it.name.ckb, it.name.ar].filter((x) => x && x !== L(it.name)).join(' · ')}</small>
        <div class="mrow__meta"><span class="badge badge--plain">${L(catById(it.cat)?.name)}</span>${(it.tags || []).map((tg) => html`<span class="tag-mini">${t('tag_' + tg)}</span>`)}${it.kcal ? html`<span class="muted">${it.kcal} ${t('kcal')} · ${it.protein}g</span>` : ''}</div>
      </div>
      <b class="mrow__price tabular">${money(it.price)}</b>
      <div class="mrow__tools">
        ${can('menu.edit') ? html`<button class="btn btn--ghost btn--icon btn--sm star ${it.featured ? 'is-on' : ''}" data-feat="${it.id}" title="${t('featuredItem')}" aria-label="${t('featuredItem')}">${icon('star')}</button>` : ''}
        <label class="switch" title="${t('available')}"><input type="checkbox" data-avail="${it.id}" ${it.available !== false ? raw('checked') : ''} aria-label="${t('available')}"><span></span></label>
        ${can('menu.edit') ? html`<button class="btn btn--ghost btn--icon btn--sm" data-edit="${it.id}" aria-label="${t('edit')}">${icon('edit')}</button>` : ''}
      </div>
    </li>`)}</ul>` : emptyState('utensils', t('noItems'))}`;
}

/* ---------------- photo cropper ---------------- */
function photoBlock() {
  return html`<div class="cropper">
    <div class="cropper__stage" id="crop-stage" tabindex="0">
      <canvas id="crop-canvas" width="640" height="640"></canvas>
      <div class="cropper__drop" id="crop-drop">${icon('upload')}<b>${t('dropPhoto')}</b><small>${t('photoHint')}</small></div>
    </div>
    <div class="cropper__tools">
      <label class="cropper__zoom">${icon('search')}<input type="range" id="crop-zoom" min="1" max="3" step="0.01" value="1" aria-label="${t('zoom')}"></label>
      <small class="muted" id="crop-hint">${t('dragToMove')}</small>
    </div>
    <div class="cropper__btns">
      <label class="btn btn--sm">${icon('image')} ${t('upload')}<input type="file" id="crop-file" accept="image/*" hidden></label>
      <button type="button" class="btn btn--sm btn--ghost" id="crop-remove">${icon('trash')} ${t('removePhoto')}</button>
    </div>
    <input class="input input--sm" id="crop-url" placeholder="${t('imageUrl')} (https://…)">
  </div>`;
}
function setupCropper(root, initialSrc) {
  const cv = $('#crop-canvas', root), ctx = cv.getContext('2d'), S = cv.width;
  const st = { img: null, zoom: 1, ox: 0, oy: 0, dirty: false, src: initialSrc || '', remote: false };
  const drop = $('#crop-drop', root), zoomEl = $('#crop-zoom', root), stage = $('#crop-stage', root);
  const draw = () => {
    ctx.clearRect(0, 0, S, S);
    const has = !!st.img;
    drop.classList.toggle('is-hidden', has);
    stage.classList.toggle('has-img', has);
    zoomEl.disabled = !has;
    if (has) drawCover(ctx, st.img, S, st.zoom, st.ox, st.oy);
  };
  const setImg = (img, dirty) => { st.img = img; st.zoom = 1; st.ox = 0; st.oy = 0; st.dirty = dirty; zoomEl.value = 1; draw(); };
  if (st.src) {
    loadImageUrl(A.store.img(st.src, 900)).then((img) => { if (!st.img) { st.remote = true; setImg(img, false); } }).catch(() => { draw(); });
  } else draw();
  const take = async (file) => {
    try { const img = await loadImageFile(file); st.remote = false; setImg(img, true); sfx('pop'); } catch { sfx('error'); toast(t('err_generic'), { type: 'err' }); }
  };
  $('#crop-file', root).addEventListener('change', (e) => { if (e.target.files[0]) take(e.target.files[0]); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.add('is-drag'); }));
  ['dragleave', 'drop'].forEach((ev) => stage.addEventListener(ev, (e) => { e.preventDefault(); stage.classList.remove('is-drag'); }));
  stage.addEventListener('drop', (e) => { const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/')); if (f) take(f); });
  stage.addEventListener('click', () => { if (!st.img) $('#crop-file', root).click(); });
  root.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'))?.getAsFile();
    if (f) { e.preventDefault(); take(f); }
  });
  zoomEl.addEventListener('input', () => { st.zoom = Number(zoomEl.value); st.dirty = true; draw(); });
  stage.addEventListener('wheel', (e) => { if (!st.img) return; e.preventDefault(); st.zoom = Math.min(3, Math.max(1, st.zoom - e.deltaY * 0.0015)); zoomEl.value = st.zoom; st.dirty = true; draw(); }, { passive: false });
  let drag = null;
  stage.addEventListener('pointerdown', (e) => { if (!st.img) return; drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; stage.setPointerCapture(e.pointerId); stage.classList.add('is-moving'); });
  stage.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const r = coverRect(st.img, S, st.zoom, 0, 0);
    const scale = S / stage.clientWidth;
    const ex = r.w - S, ey = r.h - S;
    st.ox = ex > 0 ? Math.max(-1, Math.min(1, drag.ox + ((e.clientX - drag.x) * scale * 2) / ex)) : 0;
    st.oy = ey > 0 ? Math.max(-1, Math.min(1, drag.oy + ((e.clientY - drag.y) * scale * 2) / ey)) : 0;
    st.dirty = true;
    draw();
  });
  const end = () => { drag = null; stage.classList.remove('is-moving'); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  $('#crop-remove', root).addEventListener('click', () => { st.img = null; st.src = ''; st.dirty = true; draw(); sfx('remove'); });
  $('#crop-url', root).addEventListener('change', (e) => {
    const u = e.target.value.trim();
    if (!/^https:\/\//.test(u)) return;
    loadImageUrl(u).then((img) => { st.src = u; st.remote = true; setImg(img, false); }).catch(() => toast(t('err_generic'), { type: 'err' }));
  });
  /** Returns the final image reference for the item. */
  st.result = async () => {
    if (!st.dirty) return st.src;
    if (!st.img) return '';
    try {
      const blob = await exportSquare(st.img, { zoom: st.zoom, ox: st.ox, oy: st.oy });
      return await A.store.upload(blob);
    } catch {
      return st.src; // remote photo without CORS — keep the link
    }
  };
  return st;
}

/* ---------------- item editor ---------------- */
function optionsBuilder(d) {
  return html`${(d.options || []).map((g, gi) => html`<div class="ob" data-gi="${gi}">
      <div class="ob__head">
        <div class="ob__names">${LANG3.map(([lc, lb, dir]) => html`<input class="input input--sm" dir="${dir}" data-g="${gi}" data-f="name.${lc}" value="${g.name?.[lc] || ''}" placeholder="${t('groupName')} · ${t(lb)}">`)}</div>
        <div class="ob__cfg">
          <select class="select select--sm" data-g="${gi}" data-f="type"><option value="one" ${g.type === 'one' ? 'selected' : ''}>${t('single')}</option><option value="many" ${g.type === 'many' ? 'selected' : ''}>${t('multiple')}</option></select>
          ${g.type === 'one' ? html`<label class="check"><input type="checkbox" data-g="${gi}" data-f="required" ${g.required ? raw('checked') : ''}>${t('isRequired')}</label>` : html`<label class="check">${t('maxPicks')} <input class="input input--sm input--num" type="number" min="1" max="12" data-g="${gi}" data-f="max" value="${g.max || g.choices.length}"></label>`}
          <button type="button" class="btn btn--ghost btn--icon btn--sm" data-g-del="${gi}" aria-label="${t('delete')}">${icon('trash')}</button>
        </div>
      </div>
      <div class="ob__choices">${(g.choices || []).map((c, ci) => html`<div class="ob__choice">
        ${LANG3.map(([lc, lb, dir]) => html`<input class="input input--sm" dir="${dir}" data-g="${gi}" data-c="${ci}" data-f="name.${lc}" value="${c.name?.[lc] || ''}" placeholder="${t('choiceName')} · ${t(lb)}">`)}
        <input class="input input--sm input--num" type="number" min="0" step="250" data-g="${gi}" data-c="${ci}" data-f="price" value="${c.price || 0}" title="${t('price')}">
        <button type="button" class="btn btn--ghost btn--icon btn--sm" data-c-del="${gi}:${ci}" aria-label="${t('delete')}">${icon('x')}</button>
      </div>`)}
      <button type="button" class="btn btn--sm btn--ghost" data-c-add="${gi}">${icon('plus')} ${t('addChoice')}</button></div>
    </div>`)}
    <button type="button" class="btn btn--sm" data-g-add>${icon('plus')} ${t('addGroup')}</button>`;
}
function setPath(obj, path, val) {
  const ks = path.split('.');
  let o = obj;
  while (ks.length > 1) { const k = ks.shift(); o[k] = o[k] || {}; o = o[k]; }
  o[ks[0]] = val;
}
export function openItemEditor(item) {
  const isNew = !item;
  const d = clone(item || { name: { en: '', ckb: '', ar: '' }, desc: { en: '', ckb: '', ar: '' }, cat: M.cat !== 'all' ? M.cat : A.d.categories[0]?.id, price: 0, tags: [], options: [], available: true, featured: false, kcal: 0, protein: 0, carbs: 0, fat: 0, img: '' });
  const m = modal(html`${modalHead(isNew ? t('newItem') : t('editItem'), 'utensils')}
    <div class="modal__body editor">
      <div class="editor__photo"><h4>${t('photo')}</h4>${photoBlock()}</div>
      <div class="editor__form">
        <h4>${t('itemName')} & ${t('description')}</h4>
        <div class="tri">${LANG3.map(([lc, lb, dir]) => html`<div class="tri__col"><span class="tri__lbl">${t(lb)}</span><input class="input" dir="${dir}" data-f="name.${lc}" value="${d.name[lc] || ''}" placeholder="${t('itemName')}" ${lc === 'en' ? raw('autofocus') : ''}><textarea class="textarea" dir="${dir}" rows="2" data-f="desc.${lc}" placeholder="${t('description')}">${d.desc?.[lc] || ''}</textarea></div>`)}</div>
        <div class="two">
          <label class="field"><span>${t('category')}</span><select class="select" data-f="cat">${A.d.categories.map((c) => html`<option value="${c.id}" ${d.cat === c.id ? 'selected' : ''}>${L(c.name)}</option>`)}</select></label>
          <label class="field"><span>${t('price')}</span><input class="input" type="number" min="0" step="250" data-f="price" value="${d.price}"></label>
        </div>
        <div class="field"><span>${t('tags')}</span><div class="tag-picks">${TAGS.map(([tg, ic]) => html`<button type="button" class="chip ${d.tags.includes(tg) ? 'is-on' : ''}" data-tag="${tg}">${icon(ic)}${t('tag_' + tg)}</button>`)}</div></div>
        <div class="switch-row">
          <label class="row-switch"><span>${t('available')}</span><span class="switch"><input type="checkbox" data-f="available" ${d.available !== false ? raw('checked') : ''}><span></span></span></label>
          <label class="row-switch"><span>${icon('star')} ${t('featuredItem')}</span><span class="switch"><input type="checkbox" data-f="featured" ${d.featured ? raw('checked') : ''}><span></span></span></label>
        </div>
        <h4>${t('nutrition')}</h4>
        <div class="four">${[['kcal', 'calories'], ['protein', 'proteinG'], ['carbs', 'carbsG'], ['fat', 'fatG']].map(([k, lb]) => html`<label class="field"><span>${t(lb)}</span><input class="input" type="number" min="0" data-f="${k}" value="${d[k] || 0}"></label>`)}</div>
        <h4>${t('options')}</h4>
        <div class="options-builder" id="ob">${optionsBuilder(d)}</div>
      </div>
    </div>
    <footer class="modal__foot">
      ${!isNew ? html`<button class="btn btn--danger" id="it-del">${icon('trash')} ${t('delete')}</button>` : ''}
      <span class="grow"></span>
      <button class="btn" data-close>${t('cancel')}</button>
      <button class="btn btn--gold" id="it-save">${icon('check')} ${t('save')}</button>
    </footer>`, { wide: true, cls: 'modal--editor' });
  const crop = setupCropper(m.el, d.img);
  const obEl = $('#ob', m.el);
  const reOb = () => render(obEl, optionsBuilder(d));
  m.el.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value;
    if (e.target.dataset.g !== undefined) {
      const g = d.options[Number(e.target.dataset.g)];
      if (e.target.dataset.c !== undefined) setPath(g.choices[Number(e.target.dataset.c)], f, val);
      else { setPath(g, f, val); if (f === 'type') { g.required = val === 'one'; reOb(); } }
    } else setPath(d, f, val);
  });
  m.el.addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.tag) { const tg = b.dataset.tag; d.tags = d.tags.includes(tg) ? d.tags.filter((x) => x !== tg) : [...d.tags, tg]; b.classList.toggle('is-on'); sfx('toggle'); return; }
    if (b.hasAttribute('data-g-add')) { d.options.push({ id: '', type: 'one', required: true, name: { en: '', ckb: '', ar: '' }, choices: [{ id: '', name: { en: '', ckb: '', ar: '' }, price: 0 }] }); reOb(); return; }
    if (b.dataset.gDel !== undefined) { d.options.splice(Number(b.dataset.gDel), 1); reOb(); return; }
    if (b.dataset.cAdd !== undefined) { d.options[Number(b.dataset.cAdd)].choices.push({ id: '', name: { en: '', ckb: '', ar: '' }, price: 0 }); reOb(); return; }
    if (b.dataset.cDel) { const [gi, ci] = b.dataset.cDel.split(':').map(Number); d.options[gi].choices.splice(ci, 1); reOb(); return; }
    if (b.id === 'it-del') {
      if (await confirmBox(t('deleteItemQ', { name: L(d.name) }), { danger: true, ok: t('delete') })) {
        try { await call('deleteItem', { id: d.id }); sfx('remove'); m.close(); toast(t('saved')); } catch {}
      }
      return;
    }
    if (b.id === 'it-save') {
      if (!d.name.en && !d.name.ckb && !d.name.ar) { sfx('error'); toast(t('err_nameRequired'), { type: 'err' }); m.el.querySelector('[data-f="name.en"]').focus(); return; }
      if (!(Number(d.price) > 0) && !(await confirmBox(t('zeroPriceQ'), { ok: t('save') }))) { m.el.querySelector('[data-f="price"]')?.focus(); return; }
      b.classList.add('is-busy');
      try {
        d.img = await crop.result();
        d.options = (d.options || []).map((g) => ({ ...g, choices: g.choices.filter((c) => c.name.en || c.name.ckb || c.name.ar) })).filter((g) => g.choices.length && (g.name.en || g.name.ckb || g.name.ar));
        await call('saveItem', d);
        sfx('success');
        toast(t('saved'), { sub: L(d.name) });
        m.close();
      } catch { b.classList.remove('is-busy'); }
    }
  });
}

function openCatEditor(cat) {
  const isNew = !cat;
  const d = clone(cat || { name: { en: '', ckb: '', ar: '' }, tagline: { en: '', ckb: '', ar: '' }, icon: 'utensils', active: true });
  const m = modal(html`${modalHead(isNew ? t('addCategory') : t('editCategory'), 'layers')}
    <div class="modal__body">
      <div class="tri">${LANG3.map(([lc, lb, dir]) => html`<div class="tri__col"><span class="tri__lbl">${t(lb)}</span><input class="input" dir="${dir}" data-f="name.${lc}" value="${d.name[lc] || ''}" placeholder="${t('itemName')}"><input class="input input--sm" dir="${dir}" data-f="tagline.${lc}" value="${d.tagline?.[lc] || ''}" placeholder="Tagline"></div>`)}</div>
      <div class="field"><span>${t('icon')}</span><div class="icon-picks">${CAT_ICONS.map((ic) => html`<button type="button" class="icon-pick ${d.icon === ic ? 'is-on' : ''}" data-ic="${ic}">${icon(ic)}</button>`)}</div></div>
      <label class="row-switch"><span>${t('active')}</span><span class="switch"><input type="checkbox" data-f="active" ${d.active !== false ? raw('checked') : ''}><span></span></span></label>
    </div>
    <footer class="modal__foot">${!isNew ? html`<button class="btn btn--danger" id="c-del">${icon('trash')} ${t('delete')}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${t('cancel')}</button><button class="btn btn--gold" id="c-save">${icon('check')} ${t('save')}</button></footer>`);
  m.el.addEventListener('input', (e) => { const f = e.target.dataset.f; if (f) setPath(d, f, e.target.type === 'checkbox' ? e.target.checked : e.target.value); });
  m.el.addEventListener('click', async (e) => {
    const ic = e.target.closest('[data-ic]');
    if (ic) { d.icon = ic.dataset.ic; $$('.icon-pick', m.el).forEach((x) => x.classList.toggle('is-on', x === ic)); sfx('toggle'); return; }
    if (e.target.closest('#c-save')) { try { await call('saveCategory', d); sfx('success'); m.close(); } catch {} }
    if (e.target.closest('#c-del')) {
      if (await confirmBox(t('confirmDeleteCat', { name: L(d.name) }), { danger: true, ok: t('delete') })) { try { await call('deleteCategory', { id: d.id }); M.cat = 'all'; m.close(); } catch {} }
    }
  });
}

export default {
  id: 'menu', icon: 'utensils', perm: 'menu.stock', refreshOn: ['menu'],
  render(el) {
    render(el, html`<div class="menu-mgr"><aside class="cats-panel card-box">${catsPanel()}</aside><section class="items-panel card-box" id="items-panel">${itemsPanel()}</section></div>`);
    el.onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.cat) { M.cat = b.dataset.cat; sfx('tap'); this.render(el); return; }
      if (b.hasAttribute('data-cat-new')) { openCatEditor(null); return; }
      if (b.dataset.catEdit) { openCatEditor(catById(b.dataset.catEdit)); return; }
      if (b.dataset.catUp !== undefined) {
        const cats = [...A.d.categories].sort((a, c) => a.sort - c.sort).map((c) => c.id);
        const i = Number(b.dataset.catUp); [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]];
        call('reorder', { kind: 'categories', ids: cats }).catch(() => {}); return;
      }
      if (b.hasAttribute('data-item-new')) { openItemEditor(null); return; }
      if (b.dataset.edit) { if (can('menu.edit')) openItemEditor(A.d.items.find((i) => i.id === b.dataset.edit)); return; }
      if (b.dataset.feat) { const it = A.d.items.find((i) => i.id === b.dataset.feat); call('saveItem', { ...it, featured: !it.featured }).then(() => sfx('toggle')).catch(() => {}); return; }
      if (b.dataset.up || b.dataset.down) {
        const id = b.dataset.up || b.dataset.down;
        const list = A.d.items.filter((i) => i.cat === M.cat).sort((a, c) => a.sort - c.sort).map((i) => i.id);
        const i = list.indexOf(id), j = b.dataset.up ? i - 1 : i + 1;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        call('reorder', { kind: 'items', ids: list }).then(() => sfx('tap')).catch(() => {});
      }
    };
    el.onchange = (e) => {
      const a = e.target.dataset.avail;
      if (a) call('setAvailability', { id: a, available: e.target.checked }).then(() => { sfx('toggle'); toast(e.target.checked ? t('available') : t('soldOut'), { ic: e.target.checked ? 'checkCircle' : 'xCircle', type: e.target.checked ? 'ok' : 'info', ms: 1800 }); }).catch(() => { e.target.checked = !e.target.checked; });
    };
    el.oninput = (e) => {
      if (e.target.id === 'm-q') { M.q = e.target.value; const pos = e.target.selectionStart; render($('#items-panel', el), itemsPanel()); const q = $('#m-q', el); q.focus(); q.setSelectionRange(pos, pos); }
    };
  },
};
