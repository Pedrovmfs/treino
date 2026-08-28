// Tiny DOM + formatting helpers.

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (k in n && k !== 'list') { try { n[k] = v; } catch { n.setAttribute(k, v); } }
    else n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return n;
}

export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

export function frag(...kids) {
  const f = document.createDocumentFragment();
  for (const k of kids.flat()) if (k != null && k !== false) f.append(k.nodeType ? k : document.createTextNode(String(k)));
  return f;
}

const NF = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const num = (n) => (n == null || isNaN(n) ? '—' : NF.format(Number(n)));
export const kg = (n) => (n == null || isNaN(n) ? '—' : NF.format(Number(n)) + ' kg');

export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(',', '.');
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function relDays(iso) {
  if (!iso) return '';
  const then = new Date(iso + 'T12:00:00'), now = new Date();
  const days = Math.round((now - then) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  if (days < 30) return `há ${Math.round(days / 7)} sem`;
  return `há ${Math.round(days / 30)} mês(es)`;
}

let toastTimer;
export function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = el('div', { class: 'toast' }); document.body.append(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

export const confirmAction = (msg) => Promise.resolve(window.confirm(msg));

export function deltaEl(curr, prev, unit = '') {
  if (prev == null || curr == null) return el('span', { class: 'delta same' }, '');
  const d = curr - prev;
  const cls = Math.abs(d) < 1e-6 ? 'same' : d > 0 ? 'up' : 'down';
  const arrow = cls === 'same' ? '=' : cls === 'up' ? '▲' : '▼';
  const txt = cls === 'same' ? '=' : `${arrow} ${num(Math.abs(d))}${unit}`;
  return el('span', { class: 'delta ' + cls }, txt);
}
