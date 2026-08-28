import { el, fmtDate, relDays, num } from '../ui.js';
import { screen, card, empty } from './layout.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import { sessionVolume, sessionWorkSetCount } from '../calc.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function history(_, query) {
  const all = store.finishedSessions();
  const filter = query.w || '';
  const list = filter ? all.filter((s) => s.workoutId === filter) : all;

  const kids = [];

  const sel = el('select', { onchange: (e) => navigate('/history' + (e.target.value ? '?w=' + e.target.value : '')) },
    el('option', { value: '' }, 'Todos os treinos'),
    ...store.state.workouts.map((w) => el('option', { value: w.id, selected: w.id === filter }, w.name)));
  kids.push(el('div', { class: 'field' }, sel));

  if (!list.length) {
    kids.push(empty('Nenhum treino registrado ainda.'));
    return screen({ title: 'Histórico', children: kids });
  }

  let curKey = '';
  for (const s of list) {
    const [y, m] = s.date.split('-');
    const key = `${MONTHS[+m - 1]} ${y}`;
    if (key !== curKey) { curKey = key; kids.push(el('div', { class: 'list-sep' }, key)); }
    const vol = sessionVolume(s);
    kids.push(card({ tappable: true, onclick: () => navigate('/session/' + s.id) },
      el('div', { class: 'row between' },
        el('div', {},
          el('h3', { style: 'margin-bottom:2px' }, s.workoutName),
          el('small', {}, `${fmtDate(s.date)} · ${relDays(s.date)} · ${sessionWorkSetCount(s)} séries`)),
        el('div', { style: 'text-align:right' },
          el('div', { style: 'font-weight:700' }, num(vol / 1000) + ' t'),
          el('small', {}, 'volume')))));
  }

  return screen({ title: 'Histórico', children: kids });
}
