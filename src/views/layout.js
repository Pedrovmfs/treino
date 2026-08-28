import { el } from '../ui.js';
import { navigate } from '../router.js';

export function screen({ title, back, actions = [], children }) {
  const head = el('div', { class: 'view-head' });
  if (back) head.append(el('button', { class: 'back-btn', onclick: () => (typeof back === 'string' ? navigate(back) : history.back()) }, '‹ Voltar'));
  head.append(el('h1', {}, title));
  actions.forEach((a) => head.append(a));
  const root = el('div', {});
  root.append(head);
  (Array.isArray(children) ? children : [children]).forEach((c) => c && root.append(c));
  return root;
}

export const card = (attrs, ...kids) => el('div', { class: 'card' + (attrs?.tappable ? ' tappable' : ''), ...attrs }, ...kids);
export const empty = (msg) => el('div', { class: 'empty' }, msg);
