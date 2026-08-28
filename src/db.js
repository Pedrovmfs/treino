// Minimal promise wrapper around IndexedDB.
const DB_NAME = 'treino-db';
const DB_VERSION = 1;
const STORES = ['exercises', 'workouts', 'sessions', 'meta'];

let _db = null;

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('exercises')) db.createObjectStore('exercises', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('workouts')) db.createObjectStore('workouts', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('by_date', 'date');
        s.createIndex('by_workout', 'workoutId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'k' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}
function reqP(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

export const getAll = (store) => tx(store, 'readonly').then((s) => reqP(s.getAll()));
export const get = (store, key) => tx(store, 'readonly').then((s) => reqP(s.get(key)));
export const put = (store, val) => tx(store, 'readwrite').then((s) => reqP(s.put(val)));
export const del = (store, key) => tx(store, 'readwrite').then((s) => reqP(s.delete(key)));

export function bulkPut(store, vals) {
  return open().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    vals.forEach((v) => os.put(v));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  }));
}

export function clearStore(store) {
  return tx(store, 'readwrite').then((s) => reqP(s.clear()));
}

// meta helpers (key/value)
export const metaGet = (k, dflt = null) => get('meta', k).then((r) => (r ? r.v : dflt));
export const metaSet = (k, v) => put('meta', { k, v });

export async function exportAll() {
  const [exercises, workouts, sessions, metaRows] = await Promise.all(
    STORES.map((s) => getAll(s))
  );
  return {
    format: 'treino-app', version: DB_VERSION, exportedAt: new Date().toISOString(),
    exercises, workouts, sessions,
    meta: Object.fromEntries(metaRows.map((r) => [r.k, r.v])),
  };
}

export async function importAll(data, { replace = true } = {}) {
  if (!data || data.format !== 'treino-app') throw new Error('Arquivo inválido.');
  if (replace) {
    await Promise.all(['exercises', 'workouts', 'sessions'].map(clearStore));
  }
  await bulkPut('exercises', data.exercises || []);
  await bulkPut('workouts', data.workouts || []);
  await bulkPut('sessions', data.sessions || []);
  const meta = data.meta || {};
  for (const [k, v] of Object.entries(meta)) await metaSet(k, v);
}
