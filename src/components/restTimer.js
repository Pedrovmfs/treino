// Global rest-timer bar (singleton). Wall-clock based so background timer
// throttling can't make it drift. Sits just above the tab bar.
let endsAt = 0;          // epoch ms when rest ends (when running)
let pausedAt = null;     // seconds remaining while paused
let total = 0;
let finished = false;
let tick = null;
let audio = null;
let bar = null;

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, '0')}`;
const left = () => (pausedAt != null ? pausedAt : Math.max(0, (endsAt - Date.now()) / 1000));

// must run inside a user gesture at least once for sound to work on iOS
export function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio */ }
}

function beeps(n = 3) {
  if (!audio) return;
  const t0 = audio.currentTime;
  for (let i = 0; i < n; i++) {
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g); g.connect(audio.destination);
    const t = t0 + i * 0.28;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.start(t); o.stop(t + 0.24);
  }
}

function ensureBar() {
  if (bar) return bar;
  bar = document.createElement('div');
  bar.className = 'rest-bar';
  bar.hidden = true;
  bar.innerHTML = `
    <button data-act="minus" class="rt-adj" aria-label="menos 15s">−15</button>
    <div class="rt-mid">
      <span class="rt-time">0:00</span>
      <div class="rt-track"><div class="rt-fill"></div></div>
    </div>
    <button data-act="plus" class="rt-adj" aria-label="mais 15s">+15</button>
    <button data-act="toggle" class="rt-adj" aria-label="pausar">⏸</button>
    <button data-act="close" class="rt-adj" aria-label="fechar">✕</button>`;
  bar.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'minus' || act === 'plus') {
      const d = act === 'plus' ? 15 : -15;
      if (pausedAt != null) pausedAt = Math.max(5, pausedAt + d);
      else endsAt = Math.max(Date.now() + 5000, endsAt + d * 1000);
      total = Math.max(total, left());
      finished = false;
      bar.classList.remove('done');
      paint();
    } else if (act === 'toggle') {
      if (pausedAt != null) { endsAt = Date.now() + pausedAt * 1000; pausedAt = null; }
      else pausedAt = left();
      paint();
    } else if (act === 'close') {
      stopRest();
    }
  });
  document.body.append(bar);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && tick) paint();
  });
  return bar;
}

function paint() {
  const b = ensureBar();
  const s = left();
  b.querySelector('.rt-fill').style.width = (total > 0 ? Math.max(0, s) / total * 100 : 0) + '%';
  b.querySelector('[data-act="toggle"]').textContent = pausedAt != null ? '▶' : '⏸';

  if (s <= 0 && !finished) {
    finished = true;
    b.classList.add('done');
    clearInterval(tick); tick = null;
    // only alert if we're within ~30s of the end (app may have been backgrounded)
    if (Date.now() - endsAt < 30000) {
      beeps();
      try { navigator.vibrate?.([120, 80, 120]); } catch { /* unsupported */ }
    }
  }
  b.querySelector('.rt-time').textContent = finished ? 'descanso ok' : mmss(s);
}

export function startRest(seconds) {
  if (!seconds || seconds <= 0) return;
  total = Math.round(seconds);
  endsAt = Date.now() + total * 1000;
  pausedAt = null;
  finished = false;
  const b = ensureBar();
  b.hidden = false;
  b.classList.remove('done');
  paint();
  clearInterval(tick);
  tick = setInterval(paint, 500);
}

export function stopRest() {
  clearInterval(tick); tick = null;
  endsAt = 0; total = 0; pausedAt = null; finished = false;
  if (bar) { bar.hidden = true; bar.classList.remove('done'); }
}

export const isRunning = () => tick != null;
