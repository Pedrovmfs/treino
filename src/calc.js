// Pure analytics helpers. A "set" is { type, weight, reps, done }.

export const isFilled = (s) => s && s.weight != null && s.reps != null && s.weight !== '' && s.reps !== '';

// a set only counts toward analytics once it's marked done ("série feita")
export const counts = (s) => isFilled(s) && !!s.done;

// Epley estimated 1RM
export function e1rm(weight, reps) {
  const w = Number(weight), r = Number(reps);
  if (!w || !r) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

export function setScore(s) { return e1rm(s.weight, s.reps); }

export function workSets(entry, { includeAll = false } = {}) {
  return (entry.sets || []).filter((s) => counts(s) && (includeAll || s.type === 'work'));
}

// best set of an entry (by estimated 1RM, tiebreak by weight)
export function topSet(entry, opts) {
  const sets = workSets(entry, opts);
  if (!sets.length) return null;
  return sets.slice().sort((a, b) =>
    (setScore(b) - setScore(a)) || (Number(b.weight) - Number(a.weight)))[0];
}

export function entryVolume(entry, opts) {
  return workSets(entry, opts).reduce((t, s) => t + Number(s.weight) * Number(s.reps), 0);
}

export function sessionVolume(session, opts) {
  return (session.entries || []).reduce((t, e) => t + entryVolume(e, opts), 0);
}

export function sessionWorkSetCount(session) {
  return (session.entries || []).reduce((t, e) => t + workSets(e).length, 0);
}

// Ordered (oldest→newest) history of one exercise across finished sessions.
export function exerciseSeries(sessions, exerciseId) {
  const rows = [];
  for (const se of sessions) {
    if (!se.finishedAt) continue;
    const entry = (se.entries || []).find((e) => e.exerciseId === exerciseId);
    if (!entry) continue;
    const ws = workSets(entry);
    if (!ws.length) continue;
    const top = topSet(entry);
    rows.push({
      date: se.date,
      t: new Date(se.date + 'T12:00:00').getTime(),
      sessionId: se.id,
      workoutName: se.workoutName,
      sets: ws,
      top,
      topWeight: Number(top.weight),
      topReps: Number(top.reps),
      bestE1rm: Math.max(...ws.map(setScore)),
      totalReps: ws.reduce((t, s) => t + Number(s.reps), 0),
      volume: ws.reduce((t, s) => t + Number(s.weight) * Number(s.reps), 0),
    });
  }
  rows.sort((a, b) => a.t - b.t);
  return rows;
}

export function exercisePRs(series) {
  if (!series.length) return null;
  const by = (key) => series.reduce((best, r) => (r[key] > best[key] ? r : best));
  return {
    weight: pick(by('topWeight'), 'topWeight'),
    e1rm: pick(by('bestE1rm'), 'bestE1rm'),
    volume: pick(by('volume'), 'volume'),
    reps: pick(by('totalReps'), 'totalReps'),
  };
  function pick(r, key) { return { value: r[key], date: r.date, reps: r.topReps, weight: r.topWeight }; }
}

// last finished session's entry for an exercise (optionally before a given date)
export function lastEntryFor(sessions, exerciseId, beforeDate) {
  const cands = sessions
    .filter((s) => s.finishedAt && (!beforeDate || s.date < beforeDate))
    .filter((s) => (s.entries || []).some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => (b.date < a.date ? -1 : 1));
  if (!cands.length) return null;
  const s = cands[0];
  return { session: s, entry: s.entries.find((e) => e.exerciseId === exerciseId) };
}

export function lastSessionForWorkout(sessions, workoutId) {
  return sessions
    .filter((s) => s.finishedAt && s.workoutId === workoutId)
    .sort((a, b) => (b.date < a.date ? -1 : 1))[0] || null;
}

export function trend(series, key = 'bestE1rm', window = 3) {
  if (series.length < 2) return 0;
  const recent = series.slice(-window);
  const prev = series.slice(-window * 2, -window);
  if (!prev.length) return series[series.length - 1][key] - series[0][key];
  const avg = (a) => a.reduce((t, r) => t + r[key], 0) / a.length;
  return avg(recent) - avg(prev);
}

// ISO week key like "2026-W35"
export function isoWeek(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day + 3);
  const firstThu = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// session length in whole minutes (startedAt -> finishedAt), or null
export function sessionDuration(session) {
  if (!session.startedAt || !session.finishedAt) return null;
  const ms = new Date(session.finishedAt) - new Date(session.startedAt);
  if (!(ms > 0)) return null;
  return Math.round(ms / 60000);
}
export function fmtDuration(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

// work sets per muscle group for a given ISO week (default: current week)
export function muscleSetsForWeek(sessions, muscleOf, week) {
  const wk = week || isoWeek(new Date().toISOString().slice(0, 10));
  const out = {};
  for (const s of sessions) {
    if (!s.finishedAt || isoWeek(s.date) !== wk) continue;
    for (const e of s.entries || []) {
      const m = muscleOf(e.exerciseId) || 'outros';
      out[m] = (out[m] || 0) + workSets(e).length;
    }
  }
  return out; // { peito: 8, costas: 6, ... }
}

export function weeklyVolume(sessions, opts) {
  const map = new Map();
  for (const s of sessions) {
    if (!s.finishedAt) continue;
    const k = isoWeek(s.date);
    const cur = map.get(k) || { week: k, volume: 0, sessions: 0, sets: 0 };
    cur.volume += sessionVolume(s, opts);
    cur.sessions += 1;
    cur.sets += sessionWorkSetCount(s);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => (a.week < b.week ? -1 : 1));
}
