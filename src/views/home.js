import { el, relDays, toast, confirmAction } from '../ui.js';
import { screen, card, empty } from './layout.js';
import { navigate } from '../router.js';
import * as store from '../store.js';
import { lastSessionForWorkout, sessionWorkSetCount } from '../calc.js';

export function home() {
  const kids = [];

  if (store.backupDue()) {
    kids.push(el('div', { class: 'banner' },
      el('span', {}, '⚠️'),
      el('span', {}, 'Faça um backup dos seus dados (iOS pode limpá-los).'),
      el('button', { class: 'btn-sm', onclick: () => navigate('/settings') }, 'Backup')));
  }

  const active = store.activeSession();
  if (active) {
    const mins = Math.round((Date.now() - new Date(active.startedAt).getTime()) / 60000);
    kids.push(card({ class: 'card', style: 'border-color:var(--accent)' },
      el('div', { class: 'row between' },
        el('div', {},
          el('h2', {}, 'Treino em andamento'),
          el('small', {}, `${active.workoutName} · iniciado há ${mins} min`)),
      ),
      el('div', { class: 'row', style: 'margin-top:10px;gap:8px' },
        el('button', { class: 'btn-primary', style: 'flex:1', onclick: () => navigate('/session/' + active.id) }, 'Continuar'),
        el('button', { class: 'btn-danger btn-sm', onclick: async () => {
          if (await confirmAction('Descartar este treino em andamento?')) { await store.deleteSession(active.id); toast('Descartado'); }
        } }, 'Descartar'))));
  }

  kids.push(el('div', { class: 'list-sep' }, 'Iniciar treino'));

  if (!store.state.workouts.length) {
    kids.push(empty('Nenhum treino cadastrado. Vá em Gerenciar para criar.'));
  }

  for (const wk of store.state.workouts) {
    const last = lastSessionForWorkout(store.finishedSessions(), wk.id);
    const sub = last
      ? `última vez ${relDays(last.date)} · ${sessionWorkSetCount(last)} séries válidas`
      : 'nunca feito';
    kids.push(card({ tappable: true, onclick: () => startWorkout(wk.id) },
      el('div', { class: 'row between' },
        el('div', {},
          el('h2', { style: 'margin-bottom:2px' }, wk.name),
          el('small', {}, `${wk.items.length} exercícios · ${sub}`)),
        el('span', { class: 'pill accent' }, 'Iniciar'))));
  }

  if (!active) {
    kids.push(el('button', { class: 'btn btn-block', style: 'margin-top:4px', onclick: async () => {
      const se = await store.startCardioSession();
      navigate('/session/' + se.id);
    } }, '🏃 Registrar cardio'));
  }

  return screen({ title: 'Hoje', children: kids });
}

async function startWorkout(workoutId) {
  const active = store.activeSession();
  if (active) {
    if (active.workoutId === workoutId) return navigate('/session/' + active.id);
    if (!(await confirmAction('Já existe um treino em andamento. Continuar nele?'))) return;
    return navigate('/session/' + active.id);
  }
  const se = await store.startSession(workoutId);
  navigate('/session/' + se.id);
}
