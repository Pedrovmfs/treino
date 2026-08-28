import { el, toast, confirmAction } from '../ui.js';
import { screen, card, empty } from './layout.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import { defaultSetTypes } from '../seed.js';

const TYPE_CYCLE = { warmup: 'prep', prep: 'work', work: 'warmup' };
const TYPE_LABEL = { warmup: 'aquec', prep: 'prep', work: 'válida' };

export function manage() {
  const kids = [];

  kids.push(el('div', { class: 'row between', style: 'margin-bottom:8px' },
    el('h2', { style: 'margin:0' }, 'Treinos'),
    el('button', { class: 'btn-sm btn-primary', onclick: () => navigate('/manage/workout/new') }, '+ Novo')));

  store.state.workouts.forEach((w, i) => {
    kids.push(card({},
      el('div', { class: 'row between' },
        el('div', { class: 'tappable', style: 'flex:1', onclick: () => navigate('/manage/workout/' + w.id) },
          el('h3', { style: 'margin-bottom:2px' }, w.name),
          el('small', {}, `${w.items.length} exercícios`)),
        el('div', { class: 'row', style: 'gap:4px' },
          el('button', { class: 'btn-sm', disabled: i === 0, onclick: () => moveWorkout(i, -1) }, '↑'),
          el('button', { class: 'btn-sm', disabled: i === store.state.workouts.length - 1, onclick: () => moveWorkout(i, 1) }, '↓')))));
  });

  kids.push(el('div', { class: 'row between', style: 'margin:20px 0 8px' },
    el('h2', { style: 'margin:0' }, 'Exercícios'),
    el('button', { class: 'btn-sm btn-primary', onclick: () => editExercise(null) }, '+ Novo')));

  store.state.exercises.forEach((ex) => {
    kids.push(card({ tappable: true, onclick: () => editExercise(ex) },
      el('div', { class: 'row between' },
        el('span', {}, ex.name),
        el('span', { class: 'pill' }, ex.muscle || '—'))));
  });

  return screen({ title: 'Gerenciar', children: kids });
}

async function moveWorkout(i, dir) {
  const ids = store.state.workouts.map((w) => w.id);
  const j = i + dir;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await store.reorderWorkouts(ids);
  navigate('/manage');
}

function editExercise(ex) {
  const isNew = !ex;
  const name = el('input', { value: ex?.name || '', placeholder: 'Nome do exercício' });
  const muscle = el('input', { value: ex?.muscle || '', placeholder: 'Grupo muscular', list: 'muscles' });
  const notes = el('textarea', { value: ex?.notes || '', placeholder: 'Observações (técnica, setup...)' });
  const box = el('div', { class: 'card', style: 'position:fixed;left:12px;right:12px;bottom:80px;top:auto;z-index:60;max-width:600px;margin:0 auto;max-height:70vh;overflow:auto' },
    el('h3', {}, isNew ? 'Novo exercício' : 'Editar exercício'),
    el('div', { class: 'field' }, el('label', {}, 'Nome'), name),
    el('datalist', { id: 'muscles' }, ...['peito', 'costas', 'ombro', 'bíceps', 'tríceps', 'quadríceps', 'posterior', 'glúteo', 'panturrilha', 'antebraço', 'abdômen'].map((m) => el('option', { value: m }))),
    el('div', { class: 'field' }, el('label', {}, 'Grupo muscular'), muscle),
    el('div', { class: 'field' }, el('label', {}, 'Observações'), notes),
    el('div', { class: 'row', style: 'gap:8px;margin-top:12px' },
      el('button', { class: 'btn-primary', style: 'flex:1', onclick: async () => {
        if (!name.value.trim()) return toast('Informe o nome');
        await store.saveExercise({ ...(ex || {}), name: name.value, muscle: muscle.value, notes: notes.value });
        box.remove(); toast('Salvo'); navigate('/manage');
      } }, 'Salvar'),
      !isNew && !store.exerciseInUse(ex.id)
        ? el('button', { class: 'btn-danger', onclick: async () => {
          if (await confirmAction('Excluir exercício?')) { await store.deleteExercise(ex.id); box.remove(); navigate('/manage'); }
        } }, 'Excluir')
        : null,
      el('button', { onclick: () => box.remove() }, 'Fechar')),
    !isNew && store.exerciseInUse(ex.id) ? el('small', {}, 'Em uso — não pode ser excluído.') : null);
  document.body.append(box);
}

// ---------- workout editor ----------
export function workoutEditor({ id }) {
  const isNew = id === 'new';
  const wk = isNew
    ? { name: '', items: [], order: store.state.workouts.length }
    : JSON.parse(JSON.stringify(store.workoutById(id) || {}));
  if (!isNew && !wk.id) { toast('Treino não encontrado'); navigate('/manage'); return el('div'); }

  const root = el('div', {});
  const render = () => {
    root.innerHTML = '';
    const kids = [];

    const nameInput = el('input', { value: wk.name, placeholder: 'Nome do treino',
      oninput: (e) => { wk.name = e.target.value; } });
    kids.push(card({}, el('label', {}, 'Nome'), nameInput));

    wk.items.forEach((it, i) => kids.push(itemCard(wk, it, i, render)));

    kids.push(el('button', { class: 'btn btn-block', onclick: () => addItem(wk, render) }, '+ Adicionar exercício'));

    kids.push(el('div', { class: 'stack', style: 'margin-top:14px' },
      el('button', { class: 'btn-primary btn-block', onclick: async () => {
        if (!wk.name.trim()) return toast('Dê um nome ao treino');
        if (!wk.items.length) return toast('Adicione ao menos um exercício');
        await store.saveWorkout(wk);
        toast('Treino salvo'); navigate('/manage');
      } }, 'Salvar treino'),
      !isNew ? el('button', { class: 'btn-danger btn-block', onclick: async () => {
        if (await confirmAction('Excluir este treino? O histórico das sessões é mantido.')) {
          await store.deleteWorkout(wk.id); toast('Excluído'); navigate('/manage');
        }
      } }, 'Excluir treino') : null));

    root.append(screen({ title: isNew ? 'Novo treino' : 'Editar treino', back: '/manage', children: kids }));
  };
  render();
  return root;
}

function itemCard(wk, it, i, render) {
  const ex = store.exerciseById(it.exerciseId);
  const c = card({});
  c.append(el('div', { class: 'row between' },
    el('strong', {}, ex ? ex.name : '(exercício removido)'),
    el('div', { class: 'row', style: 'gap:4px' },
      el('button', { class: 'btn-sm', disabled: i === 0, onclick: () => { [wk.items[i - 1], wk.items[i]] = [wk.items[i], wk.items[i - 1]]; render(); } }, '↑'),
      el('button', { class: 'btn-sm', disabled: i === wk.items.length - 1, onclick: () => { [wk.items[i + 1], wk.items[i]] = [wk.items[i], wk.items[i + 1]]; render(); } }, '↓'),
      el('button', { class: 'btn-sm btn-danger', onclick: () => { wk.items.splice(i, 1); render(); } }, '✕'))));

  // set count + type chips
  const chips = el('div', { class: 'row', style: 'gap:6px;flex-wrap:wrap;margin:8px 0' });
  it.sets.forEach((t, si) => {
    const chip = el('span', { class: 'set-tag', dataset: { type: t }, style: 'padding:6px 8px', onclick: () => {
      it.sets[si] = TYPE_CYCLE[t]; render();
    } }, `${si + 1}: ${TYPE_LABEL[t]}`);
    chips.append(chip);
  });
  c.append(chips);
  c.append(el('div', { class: 'row', style: 'gap:8px' },
    el('button', { class: 'btn-sm', onclick: () => { it.sets.push('work'); render(); } }, '+ série'),
    it.sets.length > 1 ? el('button', { class: 'btn-sm', onclick: () => { it.sets.pop(); render(); } }, '− série') : null,
    el('button', { class: 'btn-sm btn-ghost', onclick: () => { it.sets = defaultSetTypes(it.sets.length); render(); } }, 'padrão')));

  // rep range + note
  c.append(el('div', { class: 'row', style: 'gap:8px;margin-top:8px' },
    el('div', { style: 'flex:1' }, el('label', {}, 'Reps mín'),
      el('input', { type: 'text', inputmode: 'numeric', value: it.repMin ?? 8, oninput: (e) => { it.repMin = +e.target.value || null; } })),
    el('div', { style: 'flex:1' }, el('label', {}, 'Reps máx'),
      el('input', { type: 'text', inputmode: 'numeric', value: it.repMax ?? 10, oninput: (e) => { it.repMax = +e.target.value || null; } }))));
  c.append(el('div', { class: 'field' }, el('label', {}, 'Nota (reserva, alternância...)'),
    el('input', { value: it.note || '', oninput: (e) => { it.note = e.target.value; } })));

  // change exercise
  c.append(el('select', { style: 'margin-top:8px', onchange: (e) => { it.exerciseId = e.target.value; render(); } },
    ...store.state.exercises.map((o) => el('option', { value: o.id, selected: o.id === it.exerciseId }, `${o.name} (${o.muscle || '—'})`))));
  return c;
}

function addItem(wk, render) {
  const first = store.state.exercises[0];
  if (!first) return toast('Cadastre um exercício primeiro');
  wk.items.push({ exerciseId: first.id, sets: defaultSetTypes(3), repMin: 8, repMax: 10, note: '' });
  render();
}
