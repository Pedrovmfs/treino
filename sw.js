// Bump this string on every deploy to force clients to update.
const CACHE = 'treino-v10';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/app.js',
  './src/router.js',
  './src/store.js',
  './src/db.js',
  './src/seed.js',
  './src/calc.js',
  './src/ui.js',
  './src/theme.js',
  './src/version.js',
  './src/update.js',
  './src/wakelock.js',
  './src/profiles.js',
  './src/components/chart.js',
  './src/components/restTimer.js',
  './src/components/heatmap.js',
  './src/views/layout.js',
  './src/views/home.js',
  './src/views/session.js',
  './src/views/history.js',
  './src/views/progress.js',
  './src/views/manage.js',
  './src/views/settings.js',
  './assets/icons/icon-32.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
];

// Files that MUST be cached for the app to boot offline. If any of these fail
// during install, the install fails and the old version keeps serving (safe).
const CRITICAL = ['./', './index.html', './src/app.js', './src/styles.css'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // Per-file so one flaky/not-yet-propagated asset can't abort the whole update.
    // Missing non-critical files get lazily cached by the fetch handler later.
    await Promise.allSettled(
      ASSETS.map((u) => c.add(new Request(u, { cache: 'reload' })))
    );
    const shell = await Promise.all(CRITICAL.map((u) => c.match(u)));
    if (shell.some((r) => !r)) throw new Error('shell incompleto — nova versão adiada');
    await self.skipWaiting();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  // Navigations: try network first (fresh app), fall back to the cached shell offline.
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('./index.html')));
    return;
  }

  // Everything else: serve the precached version (authoritative for this CACHE);
  // only hit the network for things not in the precache list.
  e.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
