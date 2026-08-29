import { el, parseNum, num, fmtDate, toast, confirmAction, deltaEl } from '../ui.js';
import { screen, card } from './layout.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import {
  workSets, setScore, isFilled, sessionDuration, fmtDuration, exerciseSeries, prBreaks,
} from '../calc.js';
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
const RIR_CYCLE = { '': '0', 0: '1', 1: '2', 2: '3', 3: '4', 4: '' };

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

function elapsedBadge(session) {
  const span = el('span', { class: 'pill', style: 'align-self:flex-end;margin-bottom:8px' });
  const paint = () => {
    const min = Math.max(0, Math.round((Date.now() - new Date(session.startedAt)) / 60000));
    span.textContent = '⏱ ' + fmtDuration(min);
  };
  paint();
  const iv = setInterval(() => {
    if (!span.isConnected) { clearInterval(iv); return; }
    paint();
  }, 15000);
  return span;
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
        : elapsedBadge(session)),
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

  // cardio
  kids.push(cardioCard(session, finished));

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
    if (await confirmAction('Excluir esta sessão?')) {
      stopRest();
      await store.deleteSession(session.id);
      navigate('/history');
      store.offerUndo();
    }
  } }, 'Excluir sessão'));
  kids.push(bottom);

  return screen({ title: session.workoutName, back: finished ? '/history' : '/', children: kids });
}

function scrollToEntry(ei) {
  document.getElementById('entry-' + ei)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function entryCard(session, entry, ei, finished) {
  const ex = store.exerciseById(entry.exerciseId);
  const prev = previousEntry(session, entry.exerciseId);
  const history = exerciseSeries(store.finishedSessions(), entry.exerciseId);
  const prToasted = new WeakSet();
  const isLast = ei === session.entries.length - 1;

  const wrap = card({ id: 'entry-' + ei });

  // header
  const prevBest = prev ? Math.max(0, ...workSets(prev.entry).map(setScore)) : 0;
  const deltaSlot = el('span');
  const checkMark = el('span', { class: 'ex-check' });
  const prMark = el('span', { class: 'ex-pr' });
  const updateDelta = () => {
    const ws = workSets(entry);
    const cb = Math.max(0, ...ws.map(setScore));
    deltaSlot.replaceChildren(cb && prevBest ? deltaEl(cb, prevBest, ' 1RM') : document.createTextNode(''));
    checkMark.textContent = ws.length ? '✓ ' : '';
    prMark.textContent = ws.some((s) => prBreaks(history, s.weight, s.reps).length) ? '🏆 ' : '';
    wrap.classList.toggle('done-ex', ws.length > 0);
  };
  const maybePR = (set) => {
    if (set.done && set.type === 'work' && isFilled(set)) {
      const brk = prBreaks(history, set.weight, set.reps);
      if (brk.length && !prToasted.has(set)) {
        prToasted.add(set);
        toast(`🏆 PR de ${brk.join(' + ')}  —  ${num(set.weight)}×${num(set.reps)}`);
      }
    }
    updateDelta();
  };
  updateDelta();
  wrap.append(el('div', { class: 'row between' },
    el('div', { style: 'flex:1' },
      el('h3', { style: 'margin-bottom:2px' }, prMark, checkMark, entry.exerciseName || (ex && ex.name) || '(exercício)'),
      el('small', {}, [
        ex && ex.muscle ? ex.muscle + ' · ' : '',
        `alvo ${entry.repMin ?? 8}–${entry.repMax ?? 10} reps`,
        entry.note ? ' · ' + entry.note : '',
      ].join(''))),
    deltaSlot));

  // fixed note for this exercise
  const noteLine = el('div', { class: 'ex-note' });
  const cur = store.exerciseById(entry.exerciseId);
  if (cur && cur.notes) noteLine.append(el('span', { class: 'muted', style: 'font-size:.8rem' }, '📌 ' + cur.notes));
  if (!finished) {
    noteLine.append(el('button', {
      class: 'btn-sm btn-ghost', style: 'padding:2px 6px;min-height:0;font-size:.78rem',
      onclick: () => editExerciseNote(session, entry.exerciseId),
    }, cur && cur.notes ? 'editar' : '+ nota fixa'));
  }
  wrap.append(noteLine);

  // previous
  wrap.append(el('div', { class: 'muted', style: 'font-size:.8rem;margin:6px 0 8px' },
    prev
      ? 'Anterior (' + fmtDate(prev.session.date) + '): ' +
        (workSets(prev.entry).map((s) => `${num(s.weight)}×${num(s.reps)}`).join('  ') || '—')
      : 'Sem registro anterior'));

  // set rows
  const setsBox = el('div', {});
  const renderSets = () => {
    setsBox.innerHTML = '';
    entry.sets.forEach((set, si) => setsBox.append(
      setRow(session, entry, set, si, prev, finished, renderSets, updateDelta, maybePR, ei, isLast)));
    updateDelta();
  };
  renderSets();
  wrap.append(setsBox);

  if (!finished) {
    wrap.append(el('div', { class: 'row', style: 'gap:8px;margin-top:8px' },
      el('button', { class: 'btn-sm', onclick: () => { entry.sets.push({ type: 'work', weight: null, reps: null, done: false }); store.saveSession(session); renderSets(); } }, '+ série'),
      entry.sets.length > 1 ? el('button', { class: 'btn-sm', onclick: async () => {
        await store.mutateSession(session, 'Série removida', () => { entry.sets.pop(); });
        renderSets(); store.offerUndo();
      } }, '− série') : null,
      el('button', { class: 'btn-sm btn-ghost', onclick: () => swapExercise(session, entry, ei) }, 'Trocar'),
      !isLast ? el('button', { class: 'btn-sm btn-ghost', style: 'margin-left:auto', onclick: () => scrollToEntry(ei + 1) }, 'Próximo ↓') : null));
  }

  return wrap;
}

function stepInput({ value, step, min = 0, inputmode, placeholder, disabled, onset }) {
  const input = el('input', { type: 'text', inputmode, placeholder, value: value ?? '', disabled });
  const bump = (dir) => {
    const cur = parseNum(input.value);
    const base = cur == null ? (dir > 0 ? 0 : step) : cur;
    let v = Math.round((base + dir * step) * 100) / 100;
    if (v < min) v = min;
    input.value = String(v);
    onset(v, 'step');
  };
  input.addEventListener('input', () => onset(parseNum(input.value), 'input'));
  input.addEventListener('change', () => onset(parseNum(input.value), 'change'));
  input.addEventListener('focus', unlockAudio);
  return {
    wrap: el('div', { class: 'stepper' },
      el('button', { class: 'btn', disabled, onclick: () => bump(-1) }, '−'),
      input,
      el('button', { class: 'btn', disabled, onclick: () => bump(1) }, '+')),
    input,
  };
}

function setRow(session, entry, set, si, prev, finished, renderSets, updateDelta, maybePR, ei, isLast) {
  const prevSameType = prev ? (prev.entry.sets || []).filter((s) => s.type === set.type && isFilled(s)) : [];
  const idxInType = entry.sets.slice(0, si + 1).filter((s) => s.type === set.type).length - 1;
  const hint = prevSameType[idxInType];
  const inc = store.exerciseIncrement(entry.exerciseId);

  const allWorkDone = () => workSets(entry).length >= entry.sets.filter((s) => s.type === 'work').length;

  const chkInput = el('input', {
    type: 'checkbox', checked: !!set.done, disabled: finished,
    onchange: (e) => {
      unlockAudio();
      const was = set.done;
      set.done = e.target.checked;
      updateDelta(); store.saveSession(session);
      if (!was && set.done) {
        maybeRest(set); maybePR(set);
        if (set.type === 'work' && !isLast && allWorkDone()) setTimeout(() => scrollToEntry(ei + 1), 250);
      }
    },
  });

  const w = stepInput({
    value: set.weight, step: inc, inputmode: 'decimal', placeholder: hint ? String(hint.weight) : 'kg', disabled: finished,
    onset: (v, how) => {
      set.weight = v;
      updateDelta();
      if (how === 'change' || how === 'step') { store.saveSession(session); maybePR(set); } else autosave(session);
    },
  });

  const applyReps = (v, commit) => {
    set.reps = v;
    set.done = set.reps != null;
    chkInput.checked = set.done;
    updateDelta();
    if (commit) {
      store.saveSession(session);
      if (set.done) { maybeRest(set); maybePR(set); }
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

  const tag = el('div', { class: 'set-tag', dataset: { type: set.type }, title: 'tocar p/ mudar o tipo' }, TYPE_LABEL[set.type]);
  if (!finished) tag.addEventListener('click', () => { set.type = TYPE_CYCLE[set.type]; store.saveSession(session); renderSets(); });

  const row = el('div', { class: 'set-row' }, tag, w.wrap, rInput, el('label', { class: 'chk' }, chkInput));

  // second line: prev-hint copy · RIR · per-set note
  const extra = el('div', { class: 'set-extra' });
  if (hint && !finished) {
    extra.append(el('button', { class: 'link-btn', onclick: () => {
      set.weight = Number(hint.weight); set.reps = Number(hint.reps); set.done = true;
      store.saveSession(session); renderSets();
    } }, `ant ${num(hint.weight)}×${num(hint.reps)} ⧉`));
  }
  if (set.type === 'work' && store.getMeta('trackRIR', false) && !finished) {
    const rir = el('button', { class: 'rir-pill' }, 'RIR ' + (set.rir ?? '—'));
    rir.addEventListener('click', () => {
      const nextRaw = RIR_CYCLE[set.rir ?? ''];
      set.rir = nextRaw === '' ? null : Number(nextRaw);
      rir.textContent = 'RIR ' + (set.rir ?? '—');
      store.saveSession(session);
    });
    extra.append(rir);
  } else if (set.rir != null) {
    extra.append(el('span', { class: 'muted', style: 'font-size:.74rem' }, 'RIR ' + set.rir));
  }
  if (!finished && (set.type === 'work' || set.note)) {
    extra.append(el('button', { class: 'link-btn', onclick: () => editSetNote(session, set, renderSets) },
      set.note ? '📝 ' + (set.note.length > 18 ? set.note.slice(0, 18) + '…' : set.note) : '+ nota'));
  } else if (set.note) {
    extra.append(el('span', { class: 'muted', style: 'font-size:.74rem' }, '📝 ' + set.note));
  }
  if (extra.childNodes.length) row.append(extra);

  return row;
}

const CARDIO_NAMES = ['Esteira', 'Bike', 'Elíptico', 'Escada', 'Corrida', 'Remo', 'Caminhada', 'Pular corda'];
const rid = () => 'c' + Math.random().toString(36).slice(2, 9);

function cardioCard(session, finished) {
  session.cardio = session.cardio || [];
  const wrap = card({});
  const total = session.cardio.reduce((t, c) => t + (Number(c.minutes) || 0), 0);
  wrap.append(el('div', { class: 'row between' },
    el('h3', { style: 'margin:0' }, '🏃 Cardio'),
    el('small', {}, total ? total + ' min' : '')));

  const box = el('div', { style: 'margin-top:6px' });
  const render = () => {
    box.innerHTML = '';
    if (!session.cardio.length) {
      box.append(el('p', { class: 'muted', style: 'font-size:.83rem;margin:4px 0' },
        finished ? 'Sem cardio.' : 'Nada ainda.'));
    }
    session.cardio.forEach((c, i) => box.append(cardioRow(session, c, i, finished, render)));
  };
  render();
  wrap.append(box);

  if (!finished) {
    wrap.append(el('button', { class: 'btn-sm', style: 'margin-top:6px', onclick: () => {
      session.cardio.push({ id: rid(), name: 'Esteira', minutes: null, distance: null, note: '' });
      store.saveSession(session); render();
    } }, '+ adicionar'));
  }
  return wrap;
}

function cardioRow(session, c, i, finished, render) {
  const nameIn = el('input', {
    value: c.name || '', list: 'cardio-names', placeholder: 'Aparelho',
    disabled: finished, oninput: (e) => { c.name = e.target.value; autosave(session); },
  });
  const minIn = el('input', {
    type: 'text', inputmode: 'numeric', value: c.minutes ?? '', placeholder: 'min', style: 'text-align:center',
    disabled: finished, oninput: (e) => { c.minutes = parseNum(e.target.value); autosave(session); },
  });
  const distIn = el('input', {
    type: 'text', inputmode: 'decimal', value: c.distance ?? '', placeholder: 'km', style: 'text-align:center',
    disabled: finished, oninput: (e) => { c.distance = parseNum(e.target.value); autosave(session); },
  });
  const noteIn = el('input', {
    value: c.note || '', placeholder: 'nota (opcional)',
    disabled: finished, oninput: (e) => { c.note = e.target.value; autosave(session); },
  });
  const row = el('div', { class: 'cardio-row' },
    el('datalist', { id: 'cardio-names' }, ...CARDIO_NAMES.map((n) => el('option', { value: n }))),
    el('div', { class: 'row', style: 'gap:6px' },
      nameIn,
      !finished ? el('button', { class: 'btn-sm btn-danger', style: 'flex:none', onclick: async () => {
        await store.mutateSession(session, 'Cardio removido', () => { session.cardio.splice(i, 1); });
        render(); store.offerUndo();
      } }, '✕') : null),
    el('div', { class: 'row', style: 'gap:6px' }, minIn, distIn),
    noteIn);
  return row;
}

async function repeatLast(session) {
  if (!(await confirmAction('Preencher todas as séries com a carga e reps da última vez?'))) return;
  let n = 0;
  await store.mutateSession(session, 'Sessão preenchida', () => {
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
  });
  navigate('/session/' + session.id);
  if (n) store.offerUndo(); else toast('Sem histórico para copiar');
}

function floatingCard(...children) {
  const box = el('div', {
    class: 'card',
    style: 'position:fixed;left:12px;right:12px;bottom:80px;z-index:60;max-width:600px;margin:0 auto;max-height:70vh;overflow:auto',
  }, ...children);
  document.body.append(box);
  return box;
}

function editSetNote(session, set, renderSets) {
  const ta = el('textarea', { value: set.note || '', placeholder: 'Ex: ombro incomodou · ajuda na última' });
  const box = floatingCard(
    el('label', {}, 'Nota da série'),
    ta,
    el('div', { class: 'row', style: 'gap:8px;margin-top:10px' },
      el('button', { class: 'btn-primary', style: 'flex:1', onclick: () => {
        set.note = ta.value.trim() || undefined;
        store.saveSession(session); box.remove(); renderSets();
      } }, 'Salvar'),
      el('button', { onclick: () => box.remove() }, 'Fechar')));
  setTimeout(() => ta.focus(), 50);
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
  const sel = el('select', {},
    ...store.state.exercises.map((o) => el('option', { value: o.id, selected: o.id === entry.exerciseId }, `${o.name} (${o.muscle || '—'})`)));
  const box = floatingCard(
    el('label', {}, 'Trocar exercício deste slot'),
    sel,
    el('div', { class: 'row', style: 'gap:8px;margin-top:10px' },
      el('button', { class: 'btn-primary', style: 'flex:1', onclick: async () => {
        await store.mutateSession(session, 'Exercício trocado', () => {
          entry.exerciseId = sel.value;
          entry.exerciseName = store.exerciseName(sel.value);
        });
        box.remove();
        navigate('/session/' + session.id);
        store.offerUndo();
      } }, 'Trocar'),
      el('button', { onclick: () => box.remove() }, 'Cancelar')));
}
