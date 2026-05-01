import { formatMs, drawBarChart } from './utils.js';
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

