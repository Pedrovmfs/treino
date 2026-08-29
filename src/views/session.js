import { el, parseNum, num, fmtDate, toast, confirmAction, deltaEl } from '../ui.js';
import { screen, card } from './layout.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import { workSets, setScore, isFilled, sessionDuration, fmtDuration } from '../calc.js';
import { startRest, stopRest, unlockAudio } from '../components/restTimer.js';

// most recent finished session (other than `session`) that came before it
function previousEntry(session, exerciseId) {
  const key = (s) => s.startedAt || (s.date || '') + 'T00:00';
  const k = key(session);
  const cands = store.state.sessions
    .filter((s) => s.id !== session.id && s.finishedAt && key(s) < k)
    .filter((s) => (s.entries || []).some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => (key(b) < key(a) ? -1 : 1));
  if (!cands.length) return null;
  return { session: cands[0], entry: cands[0].entries.find((e) => e.exerciseId === exerciseId) };
}

const TYPE_CYCLE = { warmup: 'prep', prep: 'work', work: 'warmup' };
const TYPE_LABEL = { warmup: 'aquec', prep: 'prep', work: 'válida' };

const restFor = (type) => {
  const k = type === 'work' ? 'restWork' : type === 'prep' ? 'restPrep' : 'restWarmup';
  const dflt = type === 'work' ? 120 : type === 'prep' ? 75 : 45;
  return Number(store.getMeta(k, dflt)) || dflt;
};
const maybeRest = (set) => {
  if (store.getMeta('restTimerOn', true)) startRest(restFor(set.type));
};

let saveTimer;
function autosave(session) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.saveSession(session), 400);
}

export function sessionView({ id }) {
  const session = store.sessionById(id);
  if (!session) { toast('Sessão não encontrada'); navigate('/history'); return el('div'); }

  const finished = !!session.finishedAt;
  const kids = [];

  // meta card
  const dateInput = el('input', { type: 'date', value: session.date, onchange: (e) => { session.date = e.target.value; autosave(session); } });
  const dur = sessionDuration(session);
  kids.push(card({},
    el('div', { class: 'row between' },
      el('div', { style: 'flex:1' }, el('label', {}, 'Data'), dateInput),
      finished
        ? el('span', { class: 'pill', style: 'align-self:flex-end;margin-bottom:8px' },
            'Finalizado' + (dur != null ? ` · ${fmtDuration(dur)}` : ''))
        : null),
    el('div', { class: 'field' },
      el('label', {}, 'Peso corporal (opcional)'),
      el('input', { type: 'text', inputmode: 'decimal', value: session.bodyweight ?? '',
        placeholder: 'kg', oninput: (e) => { session.bodyweight = parseNum(e.target.value); autosave(session); } })),
    finished ? null : el('button', {
      class: 'btn btn-block btn-sm', style: 'margin-top:10px',
      onclick: () => repeatLast(session),
    }, '↻ Repetir última sessão')));

  // exercises
  session.entries.forEach((entry, ei) => kids.push(entryCard(session, entry, ei, finished)));

  // notes
  kids.push(card({},
    el('label', {}, 'Observações do treino'),
    el('textarea', { value: session.notes || '', oninput: (e) => { session.notes = e.target.value; autosave(session); } })));

  // actions
  const bottom = el('div', { class: 'stack', style: 'margin-top:6px' });
  if (!finished) {
    bottom.append(el('button', { class: 'btn-primary btn-block', onclick: async () => {
      await store.saveSession(session);
      const skipped = session.entries.filter((e) => workSets(e).length === 0).map((e) => e.exerciseName);
      const msg = skipped.length
        ? `Sem série marcada em: ${skipped.join(', ')}.\nFinalizar mesmo assim?`
        : 'Finalizar e salvar este treino?';
      if (await confirmAction(msg)) {
        stopRest();
        await store.finishSession(session);
        toast('Treino salvo 💪');
        navigate('/history');
      }
    } }, 'Finalizar treino'));
  } else {
    bottom.append(el('button', { class: 'btn btn-block', onclick: async () => { await store.reopenSession(session); toast('Reaberto'); navigate('/session/' + session.id); } }, 'Reabrir para editar'));
  }
  bottom.append(el('button', { class: 'btn-danger btn-block', onclick: async () => {
    if (await confirmAction('Excluir esta sessão? Não dá para desfazer.')) { stopRest(); await store.deleteSession(session.id); toast('Excluída'); navigate('/history'); }
  } }, 'Excluir sessão'));
  kids.push(bottom);

  return screen({ title: session.workoutName, back: finished ? '/history' : '/', children: kids });
}

function entryCard(session, entry, ei, finished) {
  const ex = store.exerciseById(entry.exerciseId);
  const prev = previousEntry(session, entry.exerciseId);

  const wrap = card({});

  // header
  const prevBest = prev ? Math.max(0, ...workSets(prev.entry).map(setScore)) : 0;
  const deltaSlot = el('span');
  const checkMark = el('span', { class: 'ex-check' });
  const updateDelta = () => {
    const done = workSets(entry).length;
    const cb = Math.max(0, ...workSets(entry).map(setScore));
    deltaSlot.replaceChildren(cb && prevBest ? deltaEl(cb, prevBest, ' 1RM') : document.createTextNode(''));
    checkMark.textContent = done ? '✓ ' : '';
    wrap.classList.toggle('done-ex', done > 0);
  };
  updateDelta();
  wrap.append(el('div', { class: 'row between' },
    el('div', { style: 'flex:1' },
      el('h3', { style: 'margin-bottom:2px' }, checkMark, entry.exerciseName || (ex && ex.name) || '(exercício)'),
      el('small', {}, [
        ex && ex.muscle ? ex.muscle + ' · ' : '',
        `alvo ${entry.repMin ?? 8}–${entry.repMax ?? 10} reps`,
        entry.note ? ' · ' + entry.note : '',
      ].join(''))),
    deltaSlot));

  // fixed note for this exercise (setup da máquina, pegada, etc.)
  const noteLine = el('div', { class: 'ex-note' });
  const paintNote = () => {
    const cur = store.exerciseById(entry.exerciseId);
    noteLine.replaceChildren();
    if (cur && cur.notes) {
      noteLine.append(el('span', { class: 'muted', style: 'font-size:.8rem' }, '📌 ' + cur.notes));
    }
    if (!finished) {
      noteLine.append(el('button', {
        class: 'btn-sm btn-ghost', style: 'padding:2px 6px;min-height:0;font-size:.78rem',
        onclick: () => editExerciseNote(session, entry.exerciseId),
      }, cur && cur.notes ? 'editar' : '+ nota fixa'));
    }
  };
  paintNote();
  wrap.append(noteLine);

  // previous
  const prevLine = prev
    ? 'Anterior (' + fmtDate(prev.session.date) + '): ' +
      (workSets(prev.entry).map((s) => `${num(s.weight)}×${num(s.reps)}`).join('  ') || '—')
    : 'Sem registro anterior';
  wrap.append(el('div', { class: 'muted', style: 'font-size:.8rem;margin:6px 0 8px' }, prevLine));

  // set rows
  const setsBox = el('div', {});
  const renderSets = () => {
    setsBox.innerHTML = '';
    entry.sets.forEach((set, si) => setsBox.append(setRow(session, entry, set, si, prev, finished, renderSets, updateDelta)));
    updateDelta();
  };
  renderSets();
  wrap.append(setsBox);

  // add/remove set
  if (!finished) {
    wrap.append(el('div', { class: 'row', style: 'gap:8px;margin-top:8px' },
      el('button', { class: 'btn-sm', onclick: () => { entry.sets.push({ type: 'work', weight: null, reps: null, done: false }); store.saveSession(session); renderSets(); } }, '+ série'),
      entry.sets.length > 1 ? el('button', { class: 'btn-sm', onclick: () => { entry.sets.pop(); store.saveSession(session); renderSets(); } }, '− série') : null,
      el('button', { class: 'btn-sm btn-ghost', style: 'margin-left:auto', onclick: () => swapExercise(session, entry, ei) }, 'Trocar exercício')));
  }

  return wrap;
}

function stepInput({ value, step, min = 0, inputmode, placeholder, disabled, onset }) {
  const input = el('input', {
    type: 'text', inputmode, placeholder, value: value ?? '', disabled,
  });
  const bump = (dir) => {
    const cur = parseNum(input.value);
    const base = cur == null ? (dir > 0 ? 0 : step) : cur;
    let v = Math.round((base + dir * step) * 100) / 100;
    if (v < min) v = min;
    input.value = String(v);
    onset(v, 'step');
  };
  const minus = el('button', { class: 'btn', disabled, onclick: () => bump(-1) }, '−');
  const plus = el('button', { class: 'btn', disabled, onclick: () => bump(1) }, '+');
  input.addEventListener('input', () => onset(parseNum(input.value), 'input'));
  input.addEventListener('change', () => onset(parseNum(input.value), 'change'));
  input.addEventListener('focus', unlockAudio);
  return { wrap: el('div', { class: 'stepper' }, minus, input, plus), input };
}

function setRow(session, entry, set, si, prev, finished, renderSets, updateDelta) {
  const prevSameType = prev ? (prev.entry.sets || []).filter((s) => s.type === set.type && isFilled(s)) : [];
  const idxInType = entry.sets.slice(0, si + 1).filter((s) => s.type === set.type).length - 1;
  const hint = prevSameType[idxInType];
  const inc = store.exerciseIncrement(entry.exerciseId);

  const chkInput = el('input', {
    type: 'checkbox', checked: !!set.done, disabled: finished,
    onchange: (e) => {
      unlockAudio();
      const was = set.done;
      set.done = e.target.checked;
      updateDelta(); autosave(session);
      if (!was && set.done) maybeRest(set);
    },
  });

  const w = stepInput({
    value: set.weight, step: inc, inputmode: 'decimal', placeholder: hint ? String(hint.weight) : 'kg', disabled: finished,
    onset: (v, how) => {
      set.weight = v;
      updateDelta();
      if (how === 'change' || how === 'step') store.saveSession(session); else autosave(session);
    },
  });

  const applyReps = (v, commit) => {
    set.reps = v;
    set.done = set.reps != null;      // entering reps = "série feita"
    chkInput.checked = set.done;
    updateDelta();
    if (commit) {
      store.saveSession(session);
      if (set.done) maybeRest(set);   // blurring a completed set starts the rest
    } else {
      autosave(session);
    }
  };
  const rInput = el('input', {
    type: 'text', inputmode: 'numeric', placeholder: hint ? String(hint.reps) : 'reps',
    value: set.reps ?? '', disabled: finished,
    oninput: (e) => applyReps(parseNum(e.target.value), false),
    onchange: (e) => applyReps(parseNum(e.target.value), true),
    onfocus: unlockAudio,
  });
  const r = { wrap: rInput };

  const tag = el('div', { class: 'set-tag', dataset: { type: set.type }, title: 'tocar p/ mudar o tipo' },
    TYPE_LABEL[set.type]);
  if (!finished) tag.addEventListener('click', () => { set.type = TYPE_CYCLE[set.type]; store.saveSession(session); renderSets(); });

  const chk = el('label', { class: 'chk' }, chkInput);

  const row = el('div', { class: 'set-row' }, tag, w.wrap, r.wrap, chk);
  if (hint && !finished) {
    row.append(el('div', { class: 'prev-hint', onclick: () => {
      set.weight = Number(hint.weight); set.reps = Number(hint.reps); set.done = true;
      store.saveSession(session); renderSets();
    } }, `ant: ${num(hint.weight)}×${num(hint.reps)} — tocar p/ copiar`));
  }
  return row;
}

async function repeatLast(session) {
  if (!(await confirmAction('Preencher todas as séries com a carga e reps da última vez?'))) return;
  let n = 0;
  for (const entry of session.entries) {
    const prev = previousEntry(session, entry.exerciseId);
    if (!prev) continue;
    for (const type of ['warmup', 'prep', 'work']) {
      const cur = entry.sets.filter((s) => s.type === type);
      const old = (prev.entry.sets || []).filter((s) => s.type === type && isFilled(s));
      cur.forEach((s, i) => {
        if (old[i]) { s.weight = Number(old[i].weight); s.reps = Number(old[i].reps); s.done = true; n += 1; }
      });
    }
  }
  await store.saveSession(session);
  toast(n ? `${n} séries preenchidas` : 'Sem histórico para copiar');
  navigate('/session/' + session.id);
}

function floatingCard(...children) {
  const box = el('div', {
    class: 'card',
    style: 'position:fixed;left:12px;right:12px;bottom:80px;z-index:60;max-width:600px;margin:0 auto;max-height:70vh;overflow:auto',
  }, ...children);
  document.body.append(box);
  return box;
}

function editExerciseNote(session, exerciseId) {
  const ex = store.exerciseById(exerciseId);
  const ta = el('textarea', { value: ex?.notes || '', placeholder: 'Ex: banco no furo 4 · pegada fechada · pino 7' });
  const box = floatingCard(
    el('label', {}, `Nota fixa — ${ex?.name || ''}`),
    ta,
    el('div', { class: 'row', style: 'gap:8px;margin-top:10px' },
      el('button', { class: 'btn-primary', style: 'flex:1', onclick: async () => {
        await store.saveExercise({ ...ex, notes: ta.value.trim() });
        box.remove(); navigate('/session/' + session.id);
      } }, 'Salvar'),
      el('button', { onclick: () => box.remove() }, 'Fechar')));
}

async function swapExercise(session, entry, ei) {
  const opts = store.state.exercises;
  const sel = el('select', {},
    ...opts.map((o) => el('option', { value: o.id, selected: o.id === entry.exerciseId }, `${o.name} (${o.muscle || '—'})`)));
  const box = floatingCard(
    el('label', {}, 'Trocar exercício deste slot'),
    sel,
    el('div', { class: 'row', style: 'gap:8px;margin-top:10px' },
      el('button', { class: 'btn-primary', style: 'flex:1', onclick: () => {
        entry.exerciseId = sel.value;
        entry.exerciseName = store.exerciseName(sel.value);
        store.saveSession(session);
        box.remove(); navigate('/session/' + session.id);
      } }, 'Trocar'),
      el('button', { onclick: () => box.remove() }, 'Cancelar')));
}
