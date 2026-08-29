import { APP_VERSION } from './version.js';

export { APP_VERSION };

// Manually check GitHub Pages for a new version and apply it.
// onStatus gets: 'checking' | 'downloading' | 'updating' | 'current' | 'offline' | 'no-sw' | 'unsupported'
export async function checkForUpdate(onStatus = () => {}) {
  if (!('serviceWorker' in navigator)) return onStatus('unsupported');
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return onStatus('no-sw');

  onStatus('checking');
  try {
    await reg.update();
  } catch {
    return onStatus('offline');
  }

  if (reg.waiting) return apply(reg.waiting, onStatus);
  if (reg.installing) {
    onStatus('downloading');
    const sw = reg.installing;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed') apply(reg.waiting || sw, onStatus);
      else if (sw.state === 'activated') { onStatus('updating'); scheduleReload(); }
    });
    return;
  }
  onStatus('current');
}

function apply(sw, onStatus) {
  onStatus('updating');
  try { sw.postMessage('skipWaiting'); } catch { /* ignore */ }
  scheduleReload();
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  // controllerchange (in app.js) normally reloads first; this is the iOS fallback
  reloadTimer = setTimeout(() => location.reload(), 3500);
}
