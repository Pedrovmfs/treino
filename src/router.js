// Hash router. Routes are "#/a/:id" patterns.
const routes = [];
let notFound = () => {};

export function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$');
  routes.push({ rx, keys, handler });
}
export const setNotFound = (fn) => { notFound = fn; };

export function currentPath() {
  const h = location.hash.replace(/^#/, '');
  return h || '/';
}

export function parseQuery(path) {
  const q = {};
  const i = path.indexOf('?');
  if (i < 0) return { path, query: q };
  new URLSearchParams(path.slice(i + 1)).forEach((v, k) => (q[k] = v));
  return { path: path.slice(0, i), query: q };
}

export function navigate(to, { replace = false } = {}) {
  const url = '#' + to;
  if (location.hash === url) { dispatch(); return; } // same route: force re-render
  if (replace) location.replace(url); else location.hash = to;
}

function dispatch() {
  const { path, query } = parseQuery(currentPath());
  for (const r of routes) {
    const m = path.match(r.rx);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      r.handler(params, query);
      return;
    }
  }
  notFound();
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
