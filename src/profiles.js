// Per-device profiles (you + friends). The registry lives in localStorage;
// each profile's workouts/sessions live in its own IndexedDB (see db.js).
const PKEY = 'treino.profiles';
const CKEY = 'treino.currentProfile';

const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export function listProfiles() {
  try {
    const a = JSON.parse(localStorage.getItem(PKEY));
    if (Array.isArray(a) && a.length) return a;
  } catch { /* fall through */ }
  const def = [{ id: 'default', name: 'Eu' }];
  save(def);
  return def;
}

function save(list) {
  try { localStorage.setItem(PKEY, JSON.stringify(list)); } catch { /* private mode */ }
}

export function currentProfileId() {
  const id = localStorage.getItem(CKEY) || 'default';
  return listProfiles().some((p) => p.id === id) ? id : 'default';
}
export function currentProfile() {
  return listProfiles().find((p) => p.id === currentProfileId()) || { id: 'default', name: 'Eu' };
}
export function setCurrentProfileId(id) {
  try { localStorage.setItem(CKEY, id); } catch { /* ignore */ }
}

export function addProfile(name) {
  const list = listProfiles();
  const p = { id: uid(), name: (name || '').trim() || `Perfil ${list.length + 1}` };
  list.push(p);
  save(list);
  return p.id;
}
export function renameProfile(id, name) {
  const list = listProfiles();
  const p = list.find((x) => x.id === id);
  if (p) { p.name = (name || '').trim() || p.name; save(list); }
}
export function removeProfile(id) {
  if (id === 'default') return;
  const list = listProfiles().filter((p) => p.id !== id);
  save(list.length ? list : [{ id: 'default', name: 'Eu' }]);
  if (currentProfileId() === id) setCurrentProfileId('default');
}
