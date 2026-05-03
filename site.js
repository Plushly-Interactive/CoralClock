import { formatMs, drawBarChart } from './utils.js';
import { resolveSite } from './siteResolution.js';

const siteId = new URLSearchParams(location.search).get('id');
const rangeSelect = document.querySelector('#range-select');
const emptyMsg = document.querySelector('#empty-msg');
const timeChart = document.querySelector('#time-chart');
const visitsChart = document.querySelector('#visits-chart');
const timeChartContainer = document.querySelector('#time-chart-container');
const visitsChartContainer = document.querySelector('#visits-chart-container');
const audioChartContainer = document.querySelector('#audio-chart-container');

if (siteId) {
  const { siteLabel } = resolveSite(siteId);
  document.querySelector('#site-label').textContent = siteLabel;
  document.querySelector('#site-id').textContent = siteId;
  document.title = `BiteGuard — ${siteLabel}`;
}

let byDayCache = null;
let byHourCache = null;
const avgPerHourCache = {};

const hourlyChart = document.querySelector('#hourly-chart');
const hourlyTooltip = document.querySelector('#hourly-tooltip');
const hourlyChartContainer = document.querySelector('#hourly-chart-container');
const hourlyNotRelevant = document.querySelector('#hourly-not-relevant');
const hourlySubheading = document.querySelector('#hourly-subheading');

function hourlySubheadingText(range) {
  if (range === 'all') return '(all days, excluding today)';
  return `(past ${parseInt(range)} days, excluding today)`;
}

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

async function loadAvgPerHour(range) {
  if (avgPerHourCache[range]) return;
  avgPerHourCache[range] = await chrome.runtime.sendMessage({ type: 'getAvgPerClockHour', siteId, range });
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
        activeMs: byHourCache[hourKey]?.[siteId]?.activeMs ?? 0,
        audioMs: byHourCache[hourKey]?.[siteId]?.audioMs ?? 0,
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
        const activeMs = days.reduce((sum, day) => sum + (byDayCache?.[day]?.[siteId]?.activeMs ?? 0), 0);
        const audioMs = days.reduce((sum, day) => sum + (byDayCache?.[day]?.[siteId]?.audioMs ?? 0), 0);
        const visits = days.reduce((sum, day) => sum + (byDayCache?.[day]?.[siteId]?.visits ?? 0), 0);
        return { label: month, range: month, activeMs, audioMs, visits };
      });
    } else {
      const shortLabel = parseInt(range) <= 30;
      data = dayKeys.map(day => ({
        label: shortLabel ? day.slice(5) : day,
        range: day,
        activeMs: byDayCache?.[day]?.[siteId]?.activeMs ?? 0,
        audioMs: byDayCache?.[day]?.[siteId]?.audioMs ?? 0,
        visits: byDayCache?.[day]?.[siteId]?.visits ?? 0,
      }));
    }
  }

  const hasData = data.some(d => d.activeMs > 0 || d.visits > 0);
  emptyMsg.style.display = hasData ? 'none' : 'block';
  timeChartContainer.style.display = hasData ? 'block' : 'none';
  visitsChartContainer.style.display = hasData ? 'block' : 'none';
  const hasAudio = data.some(d => d.audioMs > 0);
  audioChartContainer.style.display = hasAudio ? 'block' : 'none';
  if (hasData) drawChart(data);
  renderHourly(range);
}

function renderHourly(range) {
  if (range === 'today') {
    hourlyChart.style.display = 'none';
    hourlyTooltip.style.display = 'none';
    hourlyNotRelevant.style.display = 'block';
    hourlyChartContainer.style.display = 'block';
    return;
  }
  hourlyNotRelevant.style.display = 'none';
  hourlyChart.style.display = 'block';
  hourlySubheading.textContent = hourlySubheadingText(range);

  if (!avgPerHourCache[range]) {
    loadAvgPerHour(range).then(() => renderHourly(rangeSelect.value));
    return;
  }

  const data = avgPerHourCache[range].map((avgMs, h) => {
    const hStr = String(h).padStart(2, '0');
    const hNext = String(h + 1).padStart(2, '0');
    return { label: `${hStr}:00`, range: `${hStr}:00 - ${hNext}:00`, activeMs: avgMs };
  });

  const hasData = data.some(d => d.activeMs > 0);
  if (!hasData) {
    hourlyChartContainer.style.display = 'none';
    return;
  }
  hourlyChartContainer.style.display = 'block';

  drawBarChart({
    svgEl: hourlyChart,
    tooltipEl: hourlyTooltip,
    data,
    maxVal: Math.max(...data.map(d => d.activeMs)),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: '#0891b2',
  });
}

function drawChart(data) {
  drawBarChart({
    svgEl: timeChart,
    tooltipEl: document.querySelector('#time-tooltip'),
    data,
    maxVal: Math.max(...data.map(d => d.activeMs)),
    getValue: d => d.activeMs,
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
  if (data.some(d => d.audioMs > 0)) {
    drawBarChart({
      svgEl: document.querySelector('#audio-chart'),
      tooltipEl: document.querySelector('#audio-tooltip'),
      data,
      maxVal: Math.max(...data.map(d => d.audioMs)),
      getValue: d => d.audioMs,
      formatVal: ms => formatMs(ms),
      color: '#7c3aed',
    });
  }
}

