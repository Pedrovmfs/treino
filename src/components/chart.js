// Dependency-free SVG charts. Colors come from CSS custom properties.
const SVGNS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  kids.flat().forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(String(c))));
  return n;
};
const fmt = (n) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n);
const dm = (iso) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

/**
 * lineChart({ series:[{t,y,label?}], series2?, names:[a,b], yUnit })
 * t = epoch ms (x axis is time-proportional).
 */
export function lineChart(cfg) {
  const W = 340, H = 190, padL = 38, padR = 10, padT = 12, padB = 26;
  const all = [cfg.series, cfg.series2].filter(Boolean);
  const pts = all.flat();
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  if (pts.length < 2) {
    wrap.innerHTML = '<p class="muted" style="padding:20px 0;text-align:center">Poucos dados para o gráfico ainda.</p>';
    return wrap;
  }
  const xs = pts.map((p) => p.t), ys = pts.map((p) => p.y);
  let xMin = Math.min(...xs), xMax = Math.max(...xs);
  if (xMin === xMax) { xMin -= 864e5; xMax += 864e5; }
  let yMin = Math.min(...ys), yMax = Math.max(...ys);
  const padY = (yMax - yMin) * 0.15 || Math.max(1, yMax * 0.05);
  yMin = Math.max(0, yMin - padY); yMax = yMax + padY;

  const X = (t) => padL + ((t - xMin) / (xMax - xMin)) * (W - padL - padR);
  const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);

  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img' });

  // gridlines + y labels
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = yMin + (i / ticks) * (yMax - yMin);
    const y = Y(v);
    svg.append(s('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'var(--border)', 'stroke-width': 1 }));
    svg.append(s('text', { x: padL - 5, y: y + 3, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-dim)' }, fmt(v)));
  }
  // x labels (start / mid / end)
  [xMin, (xMin + xMax) / 2, xMax].forEach((t, i) => {
    const nearest = pts.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    svg.append(s('text', {
      x: X(nearest.t), y: H - 8, 'font-size': 9, fill: 'var(--text-dim)',
      'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle',
    }, dm(nearest.date || new Date(nearest.t).toISOString().slice(0, 10))));
  });

  const colors = ['var(--accent)', 'var(--warn)'];
  all.forEach((series, si) => {
    const sorted = series.slice().sort((a, b) => a.t - b.t);
    const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
    svg.append(s('path', {
      d, fill: 'none', stroke: colors[si], 'stroke-width': 2,
      'stroke-dasharray': si ? '4 3' : null, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
    }));
    sorted.forEach((p) => svg.append(s('circle', { cx: X(p.t), cy: Y(p.y), r: 2.6, fill: colors[si] })));
  });

  // interaction layer
  const focus = s('g', { visibility: 'hidden' });
  const fLine = s('line', { y1: padT, y2: H - padB, stroke: 'var(--text-dim)', 'stroke-width': 1 });
  const fDot = s('circle', { r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', 'stroke-width': 2 });
  const fBg = s('rect', { rx: 4, fill: 'var(--text)', opacity: 0.92 });
  const fText = s('text', { 'font-size': 10, fill: 'var(--bg)' });
  focus.append(fLine, fBg, fText, fDot);
  svg.append(focus);

  const sortedMain = cfg.series.slice().sort((a, b) => a.t - b.t);
  const move = (evt) => {
    const rect = svg.getBoundingClientRect();
    const cx = ((evt.touches ? evt.touches[0].clientX : evt.clientX) - rect.left) / rect.width * W;
    const p = sortedMain.reduce((a, b) => (Math.abs(X(b.t) - cx) < Math.abs(X(a.t) - cx) ? b : a));
    focus.setAttribute('visibility', 'visible');
    fLine.setAttribute('x1', X(p.t)); fLine.setAttribute('x2', X(p.t));
    fDot.setAttribute('cx', X(p.t)); fDot.setAttribute('cy', Y(p.y));
    const label = `${dm(p.date)}  ${fmt(p.y)}${cfg.yUnit ? ' ' + cfg.yUnit : ''}${p.sub ? '  ' + p.sub : ''}`;
    fText.textContent = label;
    const tw = label.length * 5.4 + 10;
    let tx = X(p.t) + 6;
    if (tx + tw > W) tx = X(p.t) - tw - 6;
    fBg.setAttribute('x', tx); fBg.setAttribute('y', padT); fBg.setAttribute('width', tw); fBg.setAttribute('height', 16);
    fText.setAttribute('x', tx + 5); fText.setAttribute('y', padT + 11);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', () => focus.setAttribute('visibility', 'hidden'));

  wrap.append(svg);
  if (cfg.names && all.length > 1) {
    const leg = document.createElement('div');
    leg.style.cssText = 'display:flex;gap:14px;font-size:.78rem;color:var(--text-dim);margin-top:4px';
    leg.innerHTML = cfg.names.map((nm, i) =>
      `<span><span style="display:inline-block;width:10px;height:2px;background:${colors[i]};vertical-align:middle"></span> ${nm}</span>`).join('');
    wrap.append(leg);
  }
  return wrap;
}

export function barChart(rows, { valueKey = 'value', labelKey = 'label', yUnit = '' } = {}) {
  const W = 340, H = 160, padL = 38, padR = 8, padT = 10, padB = 24;
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  if (!rows.length) { wrap.innerHTML = '<p class="muted" style="text-align:center;padding:16px 0">Sem dados.</p>'; return wrap; }
  const max = Math.max(...rows.map((r) => r[valueKey])) * 1.1 || 1;
  const svg = s('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}` });
  for (let i = 0; i <= 3; i++) {
    const v = (i / 3) * max, y = padT + (1 - i / 3) * (H - padT - padB);
    svg.append(s('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'var(--border)' }));
    svg.append(s('text', { x: padL - 5, y: y + 3, 'text-anchor': 'end', 'font-size': 9, fill: 'var(--text-dim)' }, fmt(v)));
  }
  const bw = (W - padL - padR) / rows.length;
  rows.forEach((r, i) => {
    const h = (r[valueKey] / max) * (H - padT - padB);
    const x = padL + i * bw + bw * 0.15;
    svg.append(s('rect', { x, y: H - padB - h, width: bw * 0.7, height: Math.max(0, h), rx: 2, fill: 'var(--accent)' }));
    if (i % Math.ceil(rows.length / 6) === 0 || i === rows.length - 1) {
      svg.append(s('text', { x: x + bw * 0.35, y: H - 8, 'text-anchor': 'middle', 'font-size': 8, fill: 'var(--text-dim)' },
        String(r[labelKey]).replace(/^\d{4}-W/, 'S')));
    }
    const title = s('title', {}, `${r[labelKey]}: ${fmt(r[valueKey])} ${yUnit}`);
    svg.lastChild.append?.(title);
  });
  wrap.append(svg);
  return wrap;
}
