import { formatMs } from './utils.js';
import { resolveSite } from './siteResolution.js';

const siteId = new URLSearchParams(location.search).get('id');
const rangeSelect = document.querySelector('#range-select');
const emptyMsg = document.querySelector('#empty-msg');
const chart = document.querySelector('#chart');

if (siteId) {
  const { siteLabel } = resolveSite(siteId);
  document.querySelector('#site-label').textContent = siteLabel;
  document.querySelector('#site-id').textContent = siteId;
  document.title = `BiteGuard — ${siteLabel}`;
}

let analyticsCache = null;

const savedRange = sessionStorage.getItem('analyticsRange');
if (savedRange) rangeSelect.value = savedRange;

rangeSelect.addEventListener('change', () => {
  sessionStorage.setItem('analyticsRange', rangeSelect.value);
  render();
});

loadAndRender();

async function loadAndRender() {
  const { analytics = { byDay: {}, byHour: {} } } = await chrome.storage.local.get('analytics');
  analyticsCache = analytics;
  render();
}

function todayDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function render() {
  const range = rangeSelect.value;
  const analytics = analyticsCache ?? { byDay: {}, byHour: {} };

  let data;
  if (range === 'today') {
    const dayKey = todayDayKey();
    data = Array.from({ length: 24 }, (_, h) => {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return {
        label: `${hStr}:00`,
        range: `${hStr}:00 - ${hNext}:00`,
        ms: analytics.byHour[hourKey]?.[siteId]?.ms ?? 0,
      };
    });
  } else {
    let dayKeys;
    if (range === 'all') {
      dayKeys = Object.keys(analytics.byDay).sort();
    } else {
      const now = new Date();
      dayKeys = Array.from({ length: parseInt(range) }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (parseInt(range) - 1 - i));
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      });
    }
    if (range === 'all' || parseInt(range) > 90) {
      let monthKeys;
      if (range === 'all') {
        monthKeys = [...new Set(dayKeys.map(day => day.slice(0, 7)))].sort();
      } else {
        const numMonths = Math.round(parseInt(range) / 30);
        const now = new Date();
        monthKeys = Array.from({ length: numMonths }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        });
      }
      data = monthKeys.map(month => {
        const ms = dayKeys.filter(day => day.startsWith(month))
          .reduce((sum, day) => sum + (analytics.byDay[day]?.[siteId]?.ms ?? 0), 0);
        return { label: month, range: month, ms };
      });
    } else {
      const shortLabel = parseInt(range) <= 30;
      data = dayKeys.map(day => ({ label: shortLabel ? day.slice(5) : day, range: day, ms: analytics.byDay[day]?.[siteId]?.ms ?? 0 }));
    }
  }

  const hasData = data.some(d => d.ms > 0);
  emptyMsg.style.display = hasData ? 'none' : 'block';
  chart.style.display = hasData ? 'block' : 'none';
  if (!hasData) return;

  drawChart(data);
}

function drawChart(data) {
  const W = 600, H = 200, padLeft = 52, padRight = 8, padTop = 10, padBottom = 28;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const maxMs = Math.max(...data.map(d => d.ms));
  const barW = Math.max(2, Math.floor(innerW / data.length) - 2);
  const gap = Math.floor(innerW / data.length);
  const labelEvery = data.length === 24 ? 3 : Math.ceil(data.length / 10);

  const yTicks = [0, 0.33, 0.66, 1].map(t => ({
    ms: maxMs * t,
    y: padTop + innerH - Math.round(t * innerH),
  }));

  const gridlines = yTicks.map(({ y, ms }) => `
    <line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>
    <text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#888">${formatMs(ms)}</text>
  `).join('');

  const rects = data.map((d, i) => {
    const barH = maxMs > 0 ? Math.round((d.ms / maxMs) * innerH) : 0;
    const x = padLeft + i * gap + (gap - barW) / 2;
    const y = padTop + innerH - barH;
    const showLabel = i % labelEvery === 0 || i === data.length - 1;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#2563eb" rx="2"></rect>
      <rect x="${x}" y="${padTop}" width="${barW}" height="${innerH}" fill="transparent"
        data-range="${d.range}" data-ms="${d.ms}"></rect>
      ${showLabel ? `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#888">${d.label}</text>` : ''}
    `;
  }).join('');

  chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
  chart.setAttribute('width', '100%');
  chart.setAttribute('height', H);
  chart.innerHTML = gridlines + rects;

  const tooltip = document.querySelector('#tooltip');
  chart.querySelectorAll('rect[data-range]').forEach(rect => {
    rect.addEventListener('mouseenter', () => {
      tooltip.textContent = `${formatMs(Number(rect.dataset.ms))} / ${rect.dataset.range}`;
      tooltip.style.display = 'block';
    });
    rect.addEventListener('mousemove', (e) => {
      const box = chart.getBoundingClientRect();
      tooltip.style.left = `${e.clientX - box.left + 10}px`;
      tooltip.style.top = `${e.clientY - box.top - 28}px`;
    });
    rect.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });
  });
}
