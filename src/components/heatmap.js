// GitHub-style training frequency grid. `activity` is a Map<dateStr, {sets, names}>.
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  kids.forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(String(c))));
  return n;
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DOW = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']; // Mon..Sun

export function heatmap(activity, weeks = 16) {
  const cell = 13, gap = 3, padL = 16, padT = 12;
  const W = padL + weeks * (cell + gap);
  const H = padT + 7 * (cell + gap);

  // start at Monday, (weeks-1) weeks before the current week's Monday
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) - (weeks - 1) * 7);
  monday.setHours(12, 0, 0, 0);

  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img' });

  for (let r = 0; r < 7; r++) {
    if (r % 2 === 0) {
      svg.append(s('text', { x: 0, y: padT + r * (cell + gap) + cell - 2, 'font-size': 8, fill: 'var(--text-dim)' }, DOW[r]));
    }
  }

  for (let c = 0; c < weeks; c++) {
    for (let r = 0; r < 7; r++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + c * 7 + r);
      if (d > today) continue;
      const key = iso(d);
      const a = activity.get(key);
      const n = a ? a.sets : 0;
      const level = n === 0 ? 0 : n <= 6 ? 1 : n <= 12 ? 2 : 3;
      const fill = level === 0 ? 'var(--surface-2)'
        : `color-mix(in srgb, var(--accent) ${25 + level * 25}%, transparent)`;
      const rect = s('rect', {
        x: padL + c * (cell + gap), y: padT + r * (cell + gap),
        width: cell, height: cell, rx: 3, fill,
      });
      const [, m, day] = key.split('-');
      rect.append(s('title', {}, a ? `${day}/${m} · ${a.names.join(', ')} · ${a.sets} séries` : `${day}/${m} · —`));
      svg.append(rect);
    }
  }

  wrap.append(svg);
  return wrap;
}
