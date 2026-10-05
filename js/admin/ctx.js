// Shared staff-panel state (no UI code here, so every view can import it safely).
import { fmtNum } from '../core/util.js';
import { can as canRole } from '../core/service.js';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

export const A = {
  store: null,
  user: null,
  d: { settings: null, categories: [], items: [], tables: [], users: [], requests: [], orders: [], meta: {} },
  view: null,
  route: { id: null, q: new URLSearchParams() },
  printStation: lsGet('mf.printStation') === '1',
  simulate: lsGet('mf.sim') === '1',
  unacked: new Set(),
  online: true,
  struck: (() => { try { return JSON.parse(localStorage.getItem('mf.struck') || '{}'); } catch { return {}; } })(),
};

export const money = (n) => `${fmtNum(n)} IQD`;
export const can = (perm) => canRole(A.user, perm);
export const itemById = (id) => A.d.items.find((i) => i.id === id);
export const catById = (id) => A.d.categories.find((c) => c.id === id);
export const tableById = (id) => A.d.tables.find((x) => x.id === id);
export function upsert(list, obj) {
  const i = list.findIndex((x) => x.id === obj.id);
  if (i >= 0) list[i] = obj; else list.push(obj);
}
export function setPref(key, val) { try { localStorage.setItem(key, val); } catch {} }
