import { formatMs } from './utils.js';
import { resolveSite } from './siteResolution.js';

const siteId = new URLSearchParams(location.search).get('id');
const rangeSelect = document.querySelector('#range-select');
const emptyMsg = document.querySelector('#empty-msg');
const timeChart = document.querySelector('#time-chart');
const visitsChart = document.querySelector('#visits-chart');
const timeChartContainer = document.querySelector('#time-chart-container');
const visitsChartContainer = document.querySelector('#visits-chart-container');

if (siteId) {
  const { siteLabel } = resolveSite(siteId);
  document.querySelector('#site-label').textContent = siteLabel;
  document.querySelector('#site-id').textContent = siteId;
  document.title = `BiteGuard — ${siteLabel}`;
}

let byDayCache = null;
let byHourCache = null;

const savedRange = sessionStorage.getItem('analyticsRange');
if (savedRange) rangeSelect.value = savedRange;

rangeSelect.addEventListener('change', () => {
  sessionStorage.setItem('analyticsRange', rangeSelect.value);
  render();
});

loadAndRender();

async function loadAndRender() {
  byDayCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByDay' });
  if (rangeSelect.value === 'today') await loadByHour();
  render();
}

async function loadByHour() {
  if (byHourCache) return;
  byHourCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByHourToday' });
}

function todayDayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function render() {
  const range = rangeSelect.value;

  let data;
  if (range === 'today') {
    if (!byHourCache) { loadByHour().then(render); return; }
    const dayKey = todayDayKey();
    data = Array.from({ length: 24 }, (_, h) => {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return {
        label: `${hStr}:00`,
        range: `${hStr}:00 - ${hNext}:00`,
        ms: byHourCache[hourKey]?.[siteId]?.ms ?? 0,
        visits: byHourCache[hourKey]?.[siteId]?.visits ?? 0,
      };
    });
  } else {
    let dayKeys;
    if (range === 'all') {
      dayKeys = Object.keys(byDayCache ?? {}).sort();
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
        const days = dayKeys.filter(day => day.startsWith(month));
        const ms = days.reduce((sum, day) => sum + (byDayCache?.[day]?.[siteId]?.ms ?? 0), 0);
        const visits = days.reduce((sum, day) => sum + (byDayCache?.[day]?.[siteId]?.visits ?? 0), 0);
        return { label: month, range: month, ms, visits };
      });
    } else {
      const shortLabel = parseInt(range) <= 30;
      data = dayKeys.map(day => ({
        label: shortLabel ? day.slice(5) : day,
        range: day,
        ms: byDayCache?.[day]?.[siteId]?.ms ?? 0,
        visits: byDayCache?.[day]?.[siteId]?.visits ?? 0,
      }));
    }
  }

  const hasData = data.some(d => d.ms > 0 || d.visits > 0);
  emptyMsg.style.display = hasData ? 'none' : 'block';
  timeChartContainer.style.display = hasData ? 'block' : 'none';
  visitsChartContainer.style.display = hasData ? 'block' : 'none';
  if (!hasData) return;

  drawChart(data);
}

function drawChart(data) {
  drawBarChart({
    svgEl: timeChart,
    tooltipEl: document.querySelector('#time-tooltip'),
    data,
    maxVal: Math.max(...data.map(d => d.ms)),
    getValue: d => d.ms,
    formatVal: ms => formatMs(ms),
    color: '#2563eb',
  });
  drawBarChart({
    svgEl: visitsChart,
    tooltipEl: document.querySelector('#visits-tooltip'),
    data,
    maxVal: Math.max(...data.map(d => d.visits)),
    getValue: d => d.visits,
    formatVal: v => `${Math.round(v)}`,
    formatTooltip: v => { const n = Math.round(v); return `${n} visit${n === 1 ? '' : 's'}`; },
    hideMidTicks: maxVal => maxVal < 3,
    color: '#ea580c',
  });
}

function drawBarChart({ svgEl, tooltipEl, data, maxVal, getValue, formatVal, formatTooltip = formatVal, hideMidTicks = () => false, color }) {
  const W = 600, H = 200, padLeft = 52, padRight = 8, padTop = 10, padBottom = 28;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const barW = Math.max(2, Math.floor(innerW / data.length) - 2);
  const gap = Math.floor(innerW / data.length);
  const labelEvery = data.length === 24 ? 3 : Math.ceil(data.length / 10);

  const yTicks = [0, 0.33, 0.66, 1].map(t => ({
    val: maxVal * t,
    y: padTop + innerH - Math.round(t * innerH),
  }));

  const hideMid = hideMidTicks(maxVal);
  const gridlines = yTicks.map(({ y, val }, i) => {
    const isMid = i === 1 || i === 2;
    const label = hideMid && isMid ? '' : `<text x="${padLeft - 6}" y="${y + 4}" text-anchor="end" font-size="10" fill="#888">${formatVal(val)}</text>`;
    return `<line x1="${padLeft}" y1="${y}" x2="${W - padRight}" y2="${y}" stroke="#f0f0f0" stroke-width="1"/>${label}`;
  }).join('');

  const rects = data.map((d, i) => {
    const val = getValue(d);
    const barH = maxVal > 0 ? Math.round((val / maxVal) * innerH) : 0;
    const x = padLeft + i * gap + (gap - barW) / 2;
    const y = padTop + innerH - barH;
    const showLabel = i % labelEvery === 0 || i === data.length - 1;
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="${color}" rx="2"></rect>
      <rect x="${x}" y="${padTop}" width="${barW}" height="${innerH}" fill="transparent"
        data-range="${d.range}" data-val="${val}"></rect>
      ${showLabel ? `<text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#888">${d.label}</text>` : ''}
    `;
  }).join('');

  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.setAttribute('width', '100%');
  svgEl.setAttribute('height', H);
  svgEl.innerHTML = gridlines + rects;

  svgEl.querySelectorAll('rect[data-range]').forEach(rect => {
    rect.addEventListener('mouseenter', () => {
      tooltipEl.textContent = `${formatTooltip(Number(rect.dataset.val))} / ${rect.dataset.range}`;
      tooltipEl.style.display = 'block';
    });
    rect.addEventListener('mousemove', (e) => {
      const box = svgEl.getBoundingClientRect();
      tooltipEl.style.left = `${e.clientX - box.left + 10}px`;
      tooltipEl.style.top = `${e.clientY - box.top - 28}px`;
    });
    rect.addEventListener('mouseleave', () => {
      tooltipEl.style.display = 'none';
    });
  });
}
