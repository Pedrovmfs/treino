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

// [name, muscle, load increment in kg for the +/- steppers]
const EX = [
  ['Peck deck', 'peito', 5],
  ['Supino com halteres (inclinado)', 'peito', 2],
  ['Cross over', 'peito', 2.5],
  ['Desenvolvimento (ombro)', 'ombro', 2.5],
  ['Tríceps francês', 'tríceps', 2.5],
  ['Tríceps corda', 'tríceps', 2.5],
  ['Puxada aberta', 'costas', 5],
  ['Remada curvada', 'costas', 5],
  ['Remada triângulo', 'costas', 5],
  ['Peck deck invertido', 'ombro', 5],
  ['Rosca direta (barra)', 'bíceps', 2.5],
  ['Rosca Scott', 'bíceps', 2.5],
  ['Leg press', 'quadríceps', 10],
  ['Agachamento livre ou Hack', 'quadríceps', 5],
  ['Cadeira extensora', 'quadríceps', 5],
  ['Cadeira flexora', 'posterior', 5],
  ['Panturrilha em pé', 'panturrilha', 10],
  ['Flexão de punho', 'antebraço', 2],
  ['Extensão de punho', 'antebraço', 2],
  ['Supino reto', 'peito', 5],
  ['Peito inclinado máquina (reserva: smith)', 'peito', 5],
  ['Puxada triângulo', 'costas', 5],
  ['Remada com barra', 'costas', 5],
  ['Elevação lateral halteres', 'ombro', 2],
  ['Rosca direta / Rosca Scott (alternando semana)', 'bíceps', 2.5],
  ['Tríceps francês / Tríceps corda (alternando semana)', 'tríceps', 2.5],
  ['Panturrilha sentada', 'panturrilha', 5],
  ['Stiff', 'posterior', 5],
  ['Elevação pélvica (reserva: mesa flexora)', 'glúteo', 10],
  ['Cadeira extensora / Leg press / Smith (à escolha)', 'quadríceps', 5],
  ['Panturrilha em pé (reserva: leg press)', 'panturrilha', 10],
];

// map of exercise id -> default increment, used to backfill existing installs
export const DEFAULT_INCREMENTS = Object.fromEntries(
  EX.map(([name, , inc]) => [slug(name), inc || 2.5])
);
export const DEFAULT_INCREMENT = 2.5;

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
  const exercises = EX.map(([name, muscle, inc]) => ({
    id: slug(name), name, muscle, notes: '', increment: inc || DEFAULT_INCREMENT, createdAt: now,
  }));
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
