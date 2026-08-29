// Screen Wake Lock — keep the display on during a workout. Best-effort:
// silently does nothing where unsupported (older iOS).
let lock = null;
let want = false;

async function acquire() {
  if (!want || lock || !('wakeLock' in navigator)) return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { lock = null; }
}
function release() {
  try { lock && lock.release(); } catch { /* ignore */ }
  lock = null;
}

export function setWakeLock(on) {
  want = !!on;
  if (want) acquire(); else release();
}
export const wakeLockSupported = () => 'wakeLock' in navigator;

// iOS drops the lock when the tab is hidden — re-acquire on return.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquire();
});
