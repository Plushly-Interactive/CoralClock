import { formatMs } from '../../shared/timeUtils.js';
import { faviconUrl, loadFaviconCache } from '../../shared/utils.js';
import { formatHostnameLabel } from '../../shared/labels.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { allIntervals } from '../../data/intervalLog.js';

// Visualization only (not in the spec): a horizontal timeline of the top-5 sites'
// browsing history, with active + audio + idle bars per site. Reads the raw
// interval rows directly. Each row shows only the lanes it actually has, so a
// site with no audio/idle isn't padded with empty lanes.

document.querySelector('#back-btn').href = '../interval-dashboard/interval-dashboard.html';
document.querySelector('#header-center').appendChild(createRangeDropdown());
const rangeSelect = document.querySelector('#range-select');
const svg = document.querySelector('#timeline-chart');
const tooltip = document.querySelector('#timeline-tooltip');
const empty = document.querySelector('#timeline-empty');
const subheading = document.querySelector('#timeline-subheading');

const LABEL_W = 160;
const PAD_R = 16;
const LANE_H = 14;
const STRIDE = LANE_H + 3;
const ROW_MIN = 26;       // floor so the (single-line) label fits even with one lane
const AXIS_H = 22;
const TOP_PAD = 8;

let rows = [];   // all interval rows

function midnight(daysAgo) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

function windowBounds() {
  const now = Date.now();
  const r = rangeSelect.dataset.value;
  if (r === 'today') return [midnight(0), now];
  if (r === 'all') {
    if (rows.length === 0) return [now - 3600000, now];
    let lo = Infinity, hi = -Infinity;
    for (const x of rows) { if (x.from < lo) lo = x.from; if (x.to > hi) hi = x.to; }
    return [lo, hi];
  }
  const n = parseInt(r);
  return [midnight(n - 1), now];
}

function clip(from, to, lo, hi) {
  const f = Math.max(from, lo), t = Math.min(to, hi);
  return t > f ? [f, t] : null;
}

function unionLen(ranges) {
  if (ranges.length === 0) return 0;
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0, [cs, ce] = ranges[0];
  for (let i = 1; i < ranges.length; i++) {
    const [s, e] = ranges[i];
    if (s > ce) { total += ce - cs; cs = s; ce = e; }
    else if (e > ce) ce = e;
  }
  return total + (ce - cs);
}

function fmtTick(t, spanMs) {
  const d = new Date(t);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (spanMs > 36 * 3600000) return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  return hm;
}

function render() {
  const [winStart, winEnd] = windowBounds();
  const span = Math.max(1, winEnd - winStart);

  const byDomain = new Map();
  for (const r of rows) {
    if (r.kind !== 'active' && r.kind !== 'audio' && r.kind !== 'idle') continue;
    const c = clip(r.from, r.to, winStart, winEnd);
    if (!c) continue;
    let d = byDomain.get(r.domain);
    if (!d) { d = { active: [], audio: [], idle: [] }; byDomain.set(r.domain, d); }
    d[r.kind].push(c);
  }

  const top = [...byDomain.entries()]
    .map(([domain, d]) => ({ domain, ...d, total: unionLen([...d.active, ...d.audio]) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  subheading.textContent = `(${new Date(winStart).toLocaleString()} → ${new Date(winEnd).toLocaleString()})`;

  if (top.length === 0) {
    svg.innerHTML = '';
    svg.style.display = 'none';
    empty.style.display = 'flex';
    return;
  }
  svg.style.display = '';
  empty.style.display = 'none';

  const W = svg.clientWidth || 900;
  const x0 = LABEL_W, x1 = W - PAD_R;
  const plotW = Math.max(1, x1 - x0);
  const xOf = (t) => x0 + ((t - winStart) / span) * plotW;

  const style = getComputedStyle(document.documentElement);
  const colActive = style.getPropertyValue('--color-chart-time').trim();
  const colAudio = style.getPropertyValue('--color-chart-audio').trim();
  const colIdle = style.getPropertyValue('--color-text-secondary').trim();
  const colText = style.getPropertyValue('--color-text-secondary').trim();
  const colBorder = style.getPropertyValue('--color-border').trim();

  // Lay out rows: only the lanes that have data; row height grows with lane count.
  const laid = top.map(site => {
    const lanes = [
      ['active', site.active, colActive],
      ['audio', site.audio, colAudio],
      ['idle', site.idle, colIdle],
    ].filter(l => l[1].length > 0);
    return { site, lanes, rowH: Math.max(ROW_MIN, lanes.length * STRIDE + 8) };
  });
  const rowsH = laid.reduce((s, r) => s + r.rowH, 0);
  const H = TOP_PAD + rowsH + AXIS_H;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.style.height = `${H}px`;   // natural height — viewBox width = clientWidth, so 1:1 (no stretch)

  const parts = [];
  const tipData = [];

  const TICKS = 5;
  for (let i = 0; i <= TICKS; i++) {
    const t = winStart + (span * i) / TICKS;
    const x = xOf(t);
    parts.push(`<line x1="${x.toFixed(1)}" y1="${TOP_PAD}" x2="${x.toFixed(1)}" y2="${TOP_PAD + rowsH}" stroke="${colBorder}" stroke-width="1"/>`);
    parts.push(`<text x="${x.toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="${colText}">${fmtTick(t, span)}</text>`);
  }

  const lane = (ranges, laneY, color, kind, label) => {
    for (const [f, t] of ranges) {
      const bx = xOf(f), bw = Math.max(1, xOf(t) - bx);
      const idx = tipData.length;
      tipData.push({ label, kind, from: f, to: t });
      parts.push(`<rect data-tip="${idx}" x="${bx.toFixed(1)}" y="${laneY}" width="${bw.toFixed(1)}" height="${LANE_H}" fill="${color}" rx="2"/>`);
    }
  };

  let y = TOP_PAD;
  for (const { site, lanes, rowH } of laid) {
    const label = formatHostnameLabel(site.domain);
    const cy = y + rowH / 2;
    parts.push(`<image href="${faviconUrl(site.domain)}" x="8" y="${cy - 8}" width="16" height="16"/>`);
    parts.push(`<text x="30" y="${cy + 4}" font-size="12" fill="var(--color-text)">${label} <tspan fill="${colText}" font-size="10">${formatMs(site.total)}</tspan></text>`);
    lanes.forEach((l, li) => lane(l[1], y + 4 + li * STRIDE, l[2], l[0], label));
    parts.push(`<line x1="0" y1="${y + rowH}" x2="${W}" y2="${y + rowH}" stroke="${colBorder}" stroke-width="1"/>`);
    y += rowH;
  }

  svg.innerHTML = parts.join('');

  svg.querySelectorAll('rect[data-tip]').forEach(rect => {
    const d = tipData[Number(rect.dataset.tip)];
    rect.addEventListener('mouseenter', () => {
      const dur = formatMs(d.to - d.from);
      const t = (ms) => new Date(ms).toLocaleTimeString();
      tooltip.textContent = `${d.label} · ${d.kind} · ${t(d.from)}–${t(d.to)} · ${dur}`;
      tooltip.style.display = 'block';
    });
    rect.addEventListener('mousemove', e => {
      tooltip.style.left = `${e.clientX + 12}px`;
      tooltip.style.top = `${e.clientY - 32}px`;
    });
    rect.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

initRangeSelect(rangeSelect, render);
window.addEventListener('resize', () => { if (rows.length) render(); });

await loadFaviconCache();
rows = await allIntervals();
render();
