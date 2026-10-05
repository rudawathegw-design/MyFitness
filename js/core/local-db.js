// Demo-mode storage: IndexedDB key/value + BroadcastChannel so every tab
// (customer menu, kitchen screen, admin) in this browser stays in sync live.
const DB_NAME = 'myfitness-v1';
const STORE = 'kv';
let dbp = null;

function open() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
  }
  return dbp;
}
async function op(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB aborted'));
  });
}
export const kv = {
  get: (k) => op('readonly', (s) => s.get(k)),
  set: (k, v) => op('readwrite', (s) => s.put(v, k)),
  del: (k) => op('readwrite', (s) => s.delete(k)),
};

export function createLocalDb() {
  const cache = new Map();
  const handlers = new Set();
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('myfitness') : null;
  if (bc) {
    bc.onmessage = (e) => {
      const m = e.data;
      if (m?.kind === 'db') m.keys.forEach((k) => cache.delete(k));
      handlers.forEach((h) => h(m));
    };
  }
  const read = async (k) => {
    if (cache.has(k)) return cache.get(k);
    const v = await kv.get(k);
    cache.set(k, v);
    return v;
  };
  return {
    read,
    async tx(fn) {
      const run = async () => {
        const written = new Set();
        const w = {
          read: async (k) => { const v = await kv.get(k); cache.set(k, v); return v; },
          write: async (k, v) => { await kv.set(k, v); cache.set(k, v); written.add(k); },
        };
        const res = await fn(w);
        if (written.size && bc) bc.postMessage({ kind: 'db', keys: [...written] });
        return res;
      };
      return navigator.locks?.request ? navigator.locks.request('myfitness-db', run) : run();
    },
    broadcast(m) { try { bc?.postMessage(m); } catch {} },
    onMessage(h) { handlers.add(h); return () => handlers.delete(h); },
    invalidate(k) { cache.delete(k); },
  };
}
