import * as store from './store.js';
import { route, setNotFound, startRouter, currentPath, navigate } from './router.js';
import { applyTheme } from './theme.js';
import { clear } from './ui.js';
import { home } from './views/home.js';
import { sessionView } from './views/session.js';
import { history } from './views/history.js';
import { progressList, progressDetail } from './views/progress.js';
import { manage, workoutEditor } from './views/manage.js';
import { settings } from './views/settings.js';
import { setWakeLock } from './wakelock.js';

const app = document.getElementById('app');
const tabbar = document.getElementById('tabbar');

let lastView = null;
function mount(viewFn) {
  lastView = viewFn;
  clear(app);
  // close any floating panels from a previous view
  document.querySelectorAll('body > .card[style*="fixed"]').forEach((n) => n.remove());
  try {
    const node = viewFn();
    if (node) app.append(node);
  } catch (err) {
    console.error(err);
    app.append(Object.assign(document.createElement('pre'), { textContent: 'Erro: ' + err.message + '\n' + err.stack }));
  }
  window.scrollTo(0, 0);
  updateTabs();

  // keep the screen on only while logging an unfinished session (if enabled)
  const path = currentPath().split('?')[0];
  const inActiveSession = path.startsWith('/session/')
    && !store.sessionById(path.split('/')[2])?.finishedAt;
  setWakeLock(inActiveSession && store.getMeta('keepAwake', true));
}

const TABS = [
  ['/', '🏋️', 'Hoje'],
  ['/history', '🗓️', 'Histórico'],
  ['/progress', '📈', 'Progresso'],
  ['/manage', '🛠️', 'Gerenciar'],
  ['/settings', '⚙️', 'Config'],
];

function buildTabs() {
  tabbar.innerHTML = '';
  for (const [path, ic, label] of TABS) {
    const a = document.createElement('a');
    a.href = '#' + path;
    a.innerHTML = `<span class="ic">${ic}</span>${label}`;
    tabbar.append(a);
  }
  tabbar.hidden = false;
}
function updateTabs() {
  const p = currentPath().split('?')[0];
  [...tabbar.children].forEach((a, i) => {
    const base = TABS[i][0];
    const active = base === '/' ? p === '/' : p.startsWith(base);
    a.classList.toggle('active', active);
  });
}

function registerRoutes() {
  route('/', () => mount(() => home()));
  route('/session/:id', (params) => mount(() => sessionView(params)));
  route('/history', (_, q) => mount(() => history(_, q)));
  route('/progress', () => mount(() => progressList()));
  route('/progress/:exerciseId', (params) => mount(() => progressDetail(params)));
  route('/manage', () => mount(() => manage()));
  route('/manage/workout/:id', (params) => mount(() => workoutEditor(params)));
  route('/settings', () => mount(() => settings()));
  setNotFound(() => navigate('/', { replace: true }));
}

async function boot() {
  try {
    await store.load();
  } catch (e) {
    app.innerHTML = '<p style="padding:20px">Não foi possível abrir o banco de dados local. '
      + 'Em modo privado/anônimo o app não funciona.</p>';
    return;
  }
  applyTheme(store.getMeta('theme', 'auto'));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (store.getMeta('theme', 'auto') === 'auto') applyTheme('auto');
  });

  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => { if (!p) navigator.storage.persist().catch(() => {}); });
  }

  buildTabs();
  registerRoutes();

  // re-render current view when data changes structurally
  store.onChange(() => { if (lastView) mount(lastView); });

  startRouter();

  if ('serviceWorker' in navigator) {
    let reloading = false;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // a new version took over — reload once to pick it up (skip on first install)
      if (reloading || !hadController) return;
      reloading = true;
      location.reload();
    });
    // updateViaCache:'none' => the sw.js update check never uses the HTTP cache
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(() => {});
      // check for a new version whenever the app returns to the foreground
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
      // and periodically while it stays open
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(() => { /* offline / unsupported */ });
  }
}

boot();
