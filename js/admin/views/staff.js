import { html, raw, render, $ } from '../../core/util.js';
import { t, dateTime } from '../../core/i18n.js';
import { icon } from '../../core/icons.js';
import { sfx } from '../../core/sound.js';
import { ROLES } from '../../core/service.js';
import { A, can } from '../ctx.js';
import { call, modal, modalHead, confirmBox, toast } from '../ui.js';

function editor(u) {
  const isNew = !u;
  const d = { ...(u || { name: '', username: '', role: 'cashier', active: true }), password: '' };
  const m = modal(html`${modalHead(isNew ? t('addStaff') : `${t('edit')} · ${d.name}`, 'user')}
    <div class="modal__body form-grid">
      <label class="field"><span>${t('name')}</span><input class="input" data-f="name" value="${d.name}" autofocus></label>
      <label class="field"><span>${t('username')}</span><input class="input" data-f="username" value="${d.username}" autocapitalize="none" spellcheck="false" dir="ltr"></label>
      <label class="field"><span>${t('role')}</span><select class="select" data-f="role">${ROLES.map((r) => html`<option value="${r}" ${d.role === r ? 'selected' : ''}>${t('role_' + r)}</option>`)}</select></label>
      <label class="field"><span>${isNew ? t('password') : t('newPassword')}</span><input class="input" type="password" data-f="password" autocomplete="new-password" placeholder="${isNew ? '' : t('pwKeep')}"></label>
      <label class="row-switch"><span>${t('active')}</span><span class="switch"><input type="checkbox" data-f="active" ${d.active !== false ? raw('checked') : ''}><span></span></span></label>
    </div>
    <footer class="modal__foot">${!isNew && u.id !== A.user.id ? html`<button class="btn btn--danger" id="u-del">${icon('trash')} ${t('delete')}</button>` : ''}<span class="grow"></span><button class="btn" data-close>${t('cancel')}</button><button class="btn btn--gold" id="u-save">${icon('check')} ${t('save')}</button></footer>`, { cls: 'modal--sm' });
  m.el.addEventListener('input', (e) => { const f = e.target.dataset.f; if (f) d[f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; });
  m.el.addEventListener('click', async (e) => {
    if (e.target.closest('#u-save')) { try { await call('saveUser', d); sfx('success'); toast(t('saved')); m.close(); } catch {} }
    if (e.target.closest('#u-del') && await confirmBox(t('confirmDeleteUser', { name: d.name }), { danger: true, ok: t('delete') })) { try { await call('deleteUser', { id: d.id }); m.close(); } catch {} }
  });
}
function passwordCard() {
  return html`<div class="card-box pw-card"><header class="box-head"><h3>${icon('lock')} ${t('changePassword')}</h3></header>
    <form class="form-grid" id="pw-form"><label class="field"><span>${t('currentPassword')}</span><input class="input" type="password" name="cur" autocomplete="current-password" required></label>
    <label class="field"><span>${t('newPassword')}</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="6" required></label>
    <button class="btn btn--gold" type="submit">${icon('check')} ${t('save')}</button></form></div>`;
}

export default {
  id: 'staff', icon: 'users', perm: null, refreshOn: ['users'],
  render(el) {
    const manage = can('staff.manage');
    render(el, html`<div class="staff">
      ${manage ? html`<div class="card-box">
        <header class="box-head"><h3>${icon('users')} ${t('staffTitle')}</h3><button class="btn btn--gold btn--sm" id="u-new">${icon('plus')} ${t('addStaff')}</button></header>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>${t('name')}</th><th>${t('username')}</th><th>${t('role')}</th><th>${t('status')}</th><th>${t('lastLogin')}</th><th></th></tr></thead>
        <tbody>${A.d.users.map((u) => html`<tr><td><span class="me__av me__av--sm">${(u.name || '?')[0].toUpperCase()}</span> <b>${u.name}</b>${u.id === A.user.id ? html` <small class="muted">(${t('user')})</small>` : ''}</td><td dir="ltr">${u.username}</td><td><span class="badge badge--plain role-${u.role}">${t('role_' + u.role)}</span></td><td>${u.active ? html`<span class="badge st-ready">${t('active')}</span>` : html`<span class="badge st-cancelled">${t('hidden')}</span>`}${u.defaultPw ? html` <span class="badge st-preparing badge--plain">${icon('alert')}</span>` : ''}</td><td class="tabular">${u.lastLogin ? dateTime(u.lastLogin) : t('never')}</td><td><button class="btn btn--sm btn--ghost" data-uedit="${u.id}">${icon('edit')}</button></td></tr>`)}</tbody></table></div>
      </div>` : ''}
      ${passwordCard()}
    </div>`);
    el.onclick = (e) => {
      if (e.target.closest('#u-new')) editor(null);
      const b = e.target.closest('[data-uedit]');
      if (b) editor(A.d.users.find((u) => u.id === b.dataset.uedit));
    };
    $('#pw-form', el).addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target;
      try { await call('changePassword', { current: f.cur.value, next: f.next.value }); f.reset(); sfx('success'); toast(t('pwChanged'), { ic: 'lock' }); A.user.defaultPw = false; } catch {}
    });
  },
};
