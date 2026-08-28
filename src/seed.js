// Default data, applied once on first run (meta.seeded).
import { bulkPut, metaGet, metaSet, getAll } from './db.js';

const slug = (s) => 'ex-' + s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

// set-type layout from number of prescribed sets (user's convention: 2 valid sets)
export function defaultSetTypes(n) {
  if (n <= 2) return Array(Math.max(1, n)).fill('work');
  if (n === 3) return ['prep', 'work', 'work'];
  if (n === 4) return ['warmup', 'prep', 'work', 'work'];
  return ['warmup', 'prep', ...Array(n - 2).fill('work')];
}

const EX = [
  ['Peck deck', 'peito'],
  ['Supino com halteres (inclinado)', 'peito'],
  ['Cross over', 'peito'],
  ['Desenvolvimento (ombro)', 'ombro'],
  ['Tríceps francês', 'tríceps'],
  ['Tríceps corda', 'tríceps'],
  ['Puxada aberta', 'costas'],
  ['Remada curvada', 'costas'],
  ['Remada triângulo', 'costas'],
  ['Peck deck invertido', 'ombro'],
  ['Rosca direta (barra)', 'bíceps'],
  ['Rosca Scott', 'bíceps'],
  ['Leg press', 'quadríceps'],
  ['Agachamento livre ou Hack', 'quadríceps'],
  ['Cadeira extensora', 'quadríceps'],
  ['Cadeira flexora', 'posterior'],
  ['Panturrilha em pé', 'panturrilha'],
  ['Flexão de punho', 'antebraço'],
  ['Extensão de punho', 'antebraço'],
  ['Supino reto', 'peito'],
  ['Peito inclinado máquina (reserva: smith)', 'peito'],
  ['Puxada triângulo', 'costas'],
  ['Remada com barra', 'costas'],
  ['Elevação lateral halteres', 'ombro'],
  ['Rosca direta / Rosca Scott (alternando semana)', 'bíceps'],
  ['Tríceps francês / Tríceps corda (alternando semana)', 'tríceps'],
  ['Panturrilha sentada', 'panturrilha'],
  ['Stiff', 'posterior'],
  ['Elevação pélvica (reserva: mesa flexora)', 'glúteo'],
  ['Cadeira extensora / Leg press / Smith (à escolha)', 'quadríceps'],
  ['Panturrilha em pé (reserva: leg press)', 'panturrilha'],
];

const WORKOUTS = [
  ['Treino A — Push', [
    ['Peck deck', 4], ['Supino com halteres (inclinado)', 3], ['Cross over', 3],
    ['Desenvolvimento (ombro)', 3], ['Tríceps francês', 3], ['Tríceps corda', 3],
  ]],
  ['Treino B — Pull', [
    ['Puxada aberta', 4], ['Remada curvada', 3], ['Remada triângulo', 3],
    ['Peck deck invertido', 3], ['Rosca direta (barra)', 3], ['Rosca Scott', 3],
  ]],
  ['Treino C — Legs (quadríceps) + Antebraço', [
    ['Leg press', 4], ['Agachamento livre ou Hack', 3], ['Cadeira extensora', 3],
    ['Cadeira flexora', 3], ['Panturrilha em pé', 4], ['Flexão de punho', 3], ['Extensão de punho', 3],
  ]],
  ['Treino D — Upper + Panturrilha', [
    ['Supino reto', 4], ['Peito inclinado máquina (reserva: smith)', 3], ['Puxada triângulo', 4],
    ['Remada com barra', 3], ['Elevação lateral halteres', 3],
    ['Rosca direta / Rosca Scott (alternando semana)', 3],
    ['Tríceps francês / Tríceps corda (alternando semana)', 3], ['Panturrilha sentada', 4],
  ]],
  ['Treino E — Legs (posterior) + Antebraço', [
    ['Stiff', 4], ['Cadeira flexora', 3], ['Elevação pélvica (reserva: mesa flexora)', 3],
    ['Cadeira extensora / Leg press / Smith (à escolha)', 3],
    ['Panturrilha em pé (reserva: leg press)', 4], ['Flexão de punho', 3], ['Extensão de punho', 3],
  ]],
];

export async function seedIfNeeded() {
  if (await metaGet('seeded')) return;
  const existing = await getAll('exercises');
  if (existing.length) { await metaSet('seeded', true); return; }

  const now = new Date().toISOString();
  const exercises = EX.map(([name, muscle]) => ({ id: slug(name), name, muscle, notes: '', createdAt: now }));
  await bulkPut('exercises', exercises);

  const workouts = WORKOUTS.map(([name, items], i) => ({
    id: 'wk-' + String.fromCharCode(97 + i),
    name, order: i, createdAt: now, updatedAt: now,
    items: items.map(([exName, n]) => ({
      exerciseId: slug(exName),
      sets: defaultSetTypes(n),
      repMin: 8, repMax: 10, note: '',
    })),
  }));
  await bulkPut('workouts', workouts);

  await metaSet('seeded', true);
  await metaSet('unit', 'kg');
}
