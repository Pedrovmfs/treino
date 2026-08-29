import * as db from './db.js';
import { seedIfNeeded, defaultSetTypes, DEFAULT_INCREMENTS, DEFAULT_INCREMENT } from './seed.js';
import { lastEntryFor, isFilled } from './calc.js';
import { currentProfileId } from './profiles.js';
import { toast } from './ui.js';

export const state = { exercises: [], workouts: [], sessions: [], meta: {} };

const listeners = new Set();
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

// ---------- undo ----------
let _undo = null; // { label, fn }
export function registerUndo(label, fn) { _undo = { label, fn }; }
export function takeUndo() { const u = _undo; _undo = null; return u; }
export function clearUndo() { _undo = null; }
// show a toast for the pending undo, if any
export function offerUndo() {
  const u = _undo; _undo = null;
  if (u) toast(u.label, { label: 'Desfazer', fn: () => u.fn() });
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

export async function load() {
  db.setProfile(currentProfileId());
  await db.open();
  await seedIfNeeded();
  await migrateDoneFlag();
  await migrateIncrements();
  const [exercises, workouts, sessions, metaRows] = await Promise.all([
    db.getAll('exercises'), db.getAll('workouts'), db.getAll('sessions'), db.getAll('meta'),
  ]);
  state.exercises = exercises.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  state.workouts = workouts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  state.sessions = sessions;
  state.meta = Object.fromEntries(metaRows.map((r) => [r.k, r.v]));
}

// One-time backfill: older sessions counted any filled set. Now a set must be
// marked done. For finished sessions with no checks at all, treat every filled
// set as done so history/PRs stay intact.
async function migrateDoneFlag() {
  if (await db.metaGet('migratedDone')) return;
  const sessions = await db.getAll('sessions');
  const changed = [];
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const anyDone = (s.entries || []).some((e) => (e.sets || []).some((x) => x.done));
    if (anyDone) continue;
    let touched = false;
    for (const e of s.entries || []) {
      for (const st of e.sets || []) {
        if (st.weight != null && st.weight !== '' && st.reps != null && st.reps !== '') {
          st.done = true; touched = true;
        }
      }
    }
    if (touched) changed.push(s);
  }
  if (changed.length) await db.bulkPut('sessions', changed);
  await db.metaSet('migratedDone', true);
}

// Backfill per-exercise load increment (added for the +/- steppers).
async function migrateIncrements() {
  if (await db.metaGet('migratedIncrements')) return;
  const exercises = await db.getAll('exercises');
  const changed = [];
  for (const ex of exercises) {
    if (ex.increment == null) {
      ex.increment = DEFAULT_INCREMENTS[ex.id] ?? DEFAULT_INCREMENT;
      changed.push(ex);
    }
  }
  if (changed.length) await db.bulkPut('exercises', changed);
  await db.metaSet('migratedIncrements', true);
}

export const exerciseById = (id) => state.exercises.find((e) => e.id === id);
export const exerciseIncrement = (id) => {
  const v = Number(exerciseById(id)?.increment);
  return v > 0 ? v : DEFAULT_INCREMENT;
};
export const workoutById = (id) => state.workouts.find((w) => w.id === id);
export const sessionById = (id) => state.sessions.find((s) => s.id === id);
export const exerciseName = (id) => exerciseById(id)?.name || '(removido)';

export function activeSession() {
  return state.sessions.find((s) => !s.finishedAt) || null;
}

export function finishedSessions() {
  return state.sessions.filter((s) => s.finishedAt)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.startedAt || '').localeCompare(a.startedAt || '')));
}

// ---------- meta ----------
export async function setMeta(k, v) { state.meta[k] = v; await db.metaSet(k, v); emit(); }
export const getMeta = (k, d = null) => (k in state.meta ? state.meta[k] : d);

// ---------- exercises ----------
export async function saveExercise(ex) {
  const inc = Number(ex.increment);
  const rec = { id: ex.id || uid(), name: ex.name.trim(), muscle: (ex.muscle || '').trim(),
    notes: ex.notes || '', increment: inc > 0 ? inc : DEFAULT_INCREMENT,
    createdAt: ex.createdAt || new Date().toISOString() };
  await db.put('exercises', rec);
  const i = state.exercises.findIndex((e) => e.id === rec.id);
  if (i >= 0) state.exercises[i] = rec; else state.exercises.push(rec);
  state.exercises.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  emit();
  return rec;
}
export function exerciseInUse(id) {
  return state.workouts.some((w) => w.items.some((it) => it.exerciseId === id))
    || state.sessions.some((s) => s.entries.some((e) => e.exerciseId === id));
}
export async function deleteExercise(id) {
  await db.del('exercises', id);
  state.exercises = state.exercises.filter((e) => e.id !== id);
  emit();
}

// ---------- workouts ----------
export async function saveWorkout(wk) {
  const rec = {
    id: wk.id || uid(),
    name: wk.name.trim(),
    order: wk.order ?? state.workouts.length,
    items: (wk.items || []).map((it) => ({
      exerciseId: it.exerciseId,
      sets: it.sets && it.sets.length ? it.sets.slice() : defaultSetTypes(3),
      repMin: it.repMin ?? 8, repMax: it.repMax ?? 10, note: it.note || '',
    })),
    createdAt: wk.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.put('workouts', rec);
  const i = state.workouts.findIndex((w) => w.id === rec.id);
  if (i >= 0) state.workouts[i] = rec; else state.workouts.push(rec);
  state.workouts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  emit();
  return rec;
}
export async function reorderWorkouts(ids) {
  await Promise.all(ids.map((id, order) => {
    const w = workoutById(id); if (!w) return null;
    w.order = order; return db.put('workouts', w);
  }));
  state.workouts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  emit();
}
export async function deleteWorkout(id) {
  await db.del('workouts', id);
  state.workouts = state.workouts.filter((w) => w.id !== id);
  emit();
}

// ---------- sessions ----------
export async function startSession(workoutId) {
  const wk = workoutById(workoutId);
  if (!wk) throw new Error('Treino não encontrado');
  const now = new Date().toISOString();
  const session = {
    id: uid(),
    workoutId: wk.id,
    workoutName: wk.name,
    date: todayLocal(),
    startedAt: now,
    finishedAt: null,
    bodyweight: null,
    notes: '',
    entries: wk.items.map((it) => {
      const sets = it.sets.map((type) => ({ type, weight: null, reps: null, done: false }));
      const prev = lastEntryFor(state.sessions, it.exerciseId);
      for (const type of ['warmup', 'prep', 'work']) {
        const cur = sets.filter((s) => s.type === type);
        const old = prev ? (prev.entry.sets || []).filter((s) => s.type === type && isFilled(s)) : [];
        cur.forEach((s, i) => {
          // suggest the load from last time (all set types)
          if (old[i]) s.weight = Number(old[i].weight);
          // warm-up / prep reps are boilerplate: pre-fill them (last value or 10);
          // "válida" reps stay blank so entering them is the proof the set happened
          if (type !== 'work') s.reps = old[i] ? Number(old[i].reps) : 10;
        });
      }
      return {
        exerciseId: it.exerciseId,
        exerciseName: exerciseName(it.exerciseId),
        note: it.note || '',
        repMin: it.repMin, repMax: it.repMax,
        sets,
      };
    }),
  };
  await db.put('sessions', session);
  state.sessions.push(session);
  emit();
  return session;
}

export async function saveSession(session) {
  await db.put('sessions', session);
  const i = state.sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) state.sessions[i] = session; else state.sessions.push(session);
  // no emit: the session view mutates its own object and DOM; avoids losing input focus
}

export async function finishSession(session) {
  session.finishedAt = new Date().toISOString();
  await saveSession(session);
  const n = (getMeta('sessionsSinceBackup', 0) || 0) + 1;
  await setMeta('sessionsSinceBackup', n);
}

export async function reopenSession(session) {
  session.finishedAt = null;
  await saveSession(session);
}

export async function deleteSession(id) {
  const copy = JSON.parse(JSON.stringify(state.sessions.find((s) => s.id === id) || null));
  await db.del('sessions', id);
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (copy) {
    registerUndo('Sessão excluída', async () => {
      await db.put('sessions', copy);
      if (!state.sessions.some((s) => s.id === copy.id)) state.sessions.push(copy);
      emit();
    });
  }
  emit();
}

// snapshot the mutable fields of a session, run a change, and register an undo
export async function mutateSession(session, label, change) {
  const snap = JSON.parse(JSON.stringify({
    entries: session.entries, notes: session.notes, bodyweight: session.bodyweight,
    date: session.date, workoutId: session.workoutId, workoutName: session.workoutName,
  }));
  await change();
  await saveSession(session);
  registerUndo(label, async () => {
    Object.assign(session, snap);
    await saveSession(session);
    emit();
  });
}

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- backup ----------
export async function markBackupDone() {
  await setMeta('lastBackupAt', new Date().toISOString());
  await setMeta('sessionsSinceBackup', 0);
}
export function backupDue() {
  const since = getMeta('sessionsSinceBackup', 0) || 0;
  const last = getMeta('lastBackupAt', null);
  const stale = last ? (Date.now() - new Date(last).getTime()) > 12 * 864e5 : state.sessions.some((s) => s.finishedAt);
  return since >= 4 || stale;
}

export { db };
