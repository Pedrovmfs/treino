import { el, num, kg, fmtDate } from '../ui.js';
import { screen, card, empty } from './layout.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import { lineChart, barChart } from '../components/chart.js';
import {
  exerciseSeries, exercisePRs, weeklyVolume, trend,
} from '../calc.js';

export function progressList() {
  const sessions = store.finishedSessions();
  const kids = [];

  if (!sessions.length) {
    kids.push(empty('Registre alguns treinos para ver a evolução.'));
    return screen({ title: 'Progresso', children: kids });
  }

  // weekly volume
  const wv = weeklyVolume(sessions).slice(-10).map((r) => ({ ...r, label: r.week, value: r.volume / 1000 }));
  kids.push(card({},
    el('h3', {}, 'Volume por semana (toneladas)'),
    barChart(wv, { valueKey: 'value', labelKey: 'label', yUnit: 't' })));

  const thisW = wv[wv.length - 1], lastW = wv[wv.length - 2];
  const diff = thisW && lastW ? thisW.value - lastW.value : null;
  kids.push(el('div', { class: 'kpi-grid' },
    kpi(thisW ? num(thisW.value) + ' t' : '—', 'volume esta semana'),
    kpi(diff == null ? '—' : (diff >= 0 ? '+' : '') + num(diff) + ' t', 'vs semana passada'),
    kpi(String(thisW ? thisW.sessions : 0), 'treinos esta semana'),
    kpi(String(thisW ? thisW.sets : 0), 'séries válidas')));

  // exercise list, most recently trained first
  const lastByEx = new Map();
  sessions.forEach((s) => s.entries.forEach((e) => {
    if (!lastByEx.has(e.exerciseId) || s.date > lastByEx.get(e.exerciseId)) lastByEx.set(e.exerciseId, s.date);
  }));
  const exIds = [...lastByEx.keys()].sort((a, b) => (lastByEx.get(a) < lastByEx.get(b) ? 1 : -1));

  kids.push(el('div', { class: 'list-sep' }, 'Exercícios'));
  for (const id of exIds) {
    const series = exerciseSeries(sessions, id);
    if (!series.length) continue;
    const last = series[series.length - 1];
    const t = trend(series, 'bestE1rm');
    const arrow = Math.abs(t) < 0.5 ? '→' : t > 0 ? '▲' : '▼';
    const acls = Math.abs(t) < 0.5 ? 'same' : t > 0 ? 'up' : 'down';
    kids.push(card({ tappable: true, onclick: () => navigate('/progress/' + encodeURIComponent(id)) },
      el('div', { class: 'row between' },
        el('div', {},
          el('h3', { style: 'margin-bottom:2px' }, store.exerciseName(id)),
          el('small', {}, `${fmtDate(last.date)} · melhor ${num(last.top.weight)}×${num(last.top.reps)} · 1RM ~${num(last.bestE1rm)}`)),
        el('span', { class: 'delta ' + acls }, `${arrow} ${num(Math.abs(t))}`))));
  }

  return screen({ title: 'Progresso', children: kids });
}

export function progressDetail({ exerciseId }) {
  const id = exerciseId;
  const name = store.exerciseName(id);
  const series = exerciseSeries(store.finishedSessions(), id);
  const kids = [];

  if (series.length === 0) {
    kids.push(empty('Sem dados para ' + name + '.'));
    return screen({ title: name, back: '/progress', children: kids });
  }

  const prs = exercisePRs(series);
  kids.push(el('div', { class: 'kpi-grid' },
    kpi(kg(prs.weight.value), `PR carga (${num(prs.weight.reps)} reps · ${fmtDate(prs.weight.date)})`),
    kpi('~' + num(prs.e1rm.value), `PR 1RM est. (${fmtDate(prs.e1rm.date)})`),
    kpi(num(prs.volume.value / 1000) + ' t', `melhor volume/sessão`),
    kpi(String(series.length), 'sessões registradas')));

  kids.push(card({},
    el('h3', {}, 'Evolução'),
    lineChart({
      series: series.map((r) => ({ t: r.t, y: r.topWeight, date: r.date, sub: `${num(r.topWeight)}×${num(r.topReps)}` })),
      series2: series.map((r) => ({ t: r.t, y: Math.round(r.bestE1rm * 10) / 10, date: r.date })),
      names: ['carga melhor série', '1RM estimado'],
      yUnit: 'kg',
    })));

  const rows = el('table', { class: 'log' },
    el('thead', {}, el('tr', {}, el('th', {}, 'Data'), el('th', {}, 'Séries válidas'), el('th', {}, 'Melhor'), el('th', {}, '1RM'), el('th', {}, 'Vol'))),
    el('tbody', {}, ...series.slice().reverse().map((r) => el('tr', {},
      el('td', {}, fmtDate(r.date)),
      el('td', {}, r.sets.map((s) => `${num(s.weight)}×${num(s.reps)}`).join(', ')),
      el('td', {}, `${num(r.top.weight)}×${num(r.top.reps)}`),
      el('td', {}, '~' + num(r.bestE1rm)),
      el('td', {}, num(r.volume / 1000) + 't')))));
  kids.push(card({}, el('h3', {}, 'Histórico'), el('div', { style: 'overflow-x:auto' }, rows)));

  return screen({ title: name, back: '/progress', children: kids });
}

function kpi(v, l) {
  return el('div', { class: 'kpi' }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l));
}
