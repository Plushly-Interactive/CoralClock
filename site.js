import { formatMs, drawBarChart } from './utils.js';
import { resolveSite } from './siteResolution.js';

const siteId = new URLSearchParams(location.search).get('id');
const rangeSelect = document.querySelector('#range-select');
const timeChart = document.querySelector('#time-chart');
const visitsChart = document.querySelector('#visits-chart');
const timeNoData = document.querySelector('#time-no-data');
const visitsNoData = document.querySelector('#visits-no-data');
const peakTooltip = document.querySelector('#peak-tooltip');
const statsContainer = document.querySelector('#stats-container');

const peakItem = document.querySelector('#stat-peak-item');
const peakInfo = document.querySelector('#stat-peak-info');

peakItem.addEventListener('mouseenter', () => {
  if (!peakInfo.dataset.date) return;
  peakTooltip.textContent = peakInfo.dataset.date;
  peakTooltip.style.display = 'block';
});
peakItem.addEventListener('mousemove', (e) => {
  if (!peakInfo.dataset.date) return;
  const box = statsContainer.getBoundingClientRect();
  peakTooltip.style.left = `${e.clientX - box.left + 10}px`;
  peakTooltip.style.top = `${e.clientY - box.top - 28}px`;
});
peakItem.addEventListener('mouseleave', () => {
  peakTooltip.style.display = 'none';
});

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

window.addEventListener('storage', (e) => {
  if (e.key === 'theme') render();
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
  timeChart.style.display = hasData ? 'block' : 'none';
  visitsChart.style.display = hasData ? 'block' : 'none';
  timeNoData.style.display = hasData ? 'none' : 'block';
  visitsNoData.style.display = hasData ? 'none' : 'block';
  if (hasData) drawChart(data);
  renderHourly(range);
  renderStats(data, range);
}

function formatTotalTime(ms) {
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  const h = ms / 3600000;
  const hStr = `${h < 10 ? h.toFixed(1).replace(/\.0$/, '') : Math.round(h)}h`;
  if (ms < 86400000) return hStr;
  const d = ms / 86400000;
  const dStr = `${d < 10 ? d.toFixed(1).replace(/\.0$/, '') : Math.round(d)}d`;
  return `${hStr} (${dStr})`;
}

function renderStats(data, range) {
  const todayKey = todayDayKey();
  const todayMs = byDayCache?.[todayKey]?.[siteId]?.activeMs ?? 0;

  const totalMs = data.reduce((s, d) => s + d.activeMs, 0);
  const totalVisits = data.reduce((s, d) => s + d.visits, 0);
  const activeDays = range !== 'today' ? data.filter(d => d.activeMs > 0).length : 0;
  const avgMs = activeDays > 0 ? totalMs / activeDays : 0;

  let peakMs = 0, peakLabel = '';
  if (range !== 'today' && byDayCache) {
    const cutoff = range === 'all' ? null : (() => {
      const d = new Date();
      d.setDate(d.getDate() - (parseInt(range) - 1));
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();
    for (const [day, sites] of Object.entries(byDayCache)) {
      if (cutoff && day < cutoff) continue;
      const ms = sites[siteId]?.activeMs ?? 0;
      if (ms > peakMs) { peakMs = ms; peakLabel = day; }
    }
  }

  document.querySelector('#stat-today').textContent = formatMs(todayMs) || '0m';
  document.querySelector('#stat-daily-avg').textContent = activeDays > 0 ? formatMs(avgMs) : '—';
  const peakEl = document.querySelector('#stat-peak');
  peakEl.textContent = peakMs > 0 ? formatMs(peakMs) : '—';
  peakEl.classList.remove('has-tooltip');
  peakInfo.style.display = peakMs > 0 ? 'inline' : 'none';
  peakInfo.dataset.date = peakMs > 0 ? peakLabel : '';
  peakInfo.title = '';
  const totalTimeEl = document.querySelector('#stat-total-time');
  if (totalMs > 0) {
    const full = formatTotalTime(totalMs);
    const match = full.match(/^(.+?)(\s*\(.+\))?$/);
    totalTimeEl.innerHTML = match[2] ? `${match[1]}<span class="stat-sub"> ${match[2]}</span>` : full;
  } else {
    totalTimeEl.textContent = '—';
  }
  document.querySelector('#stat-visits').textContent = totalVisits > 0 ? totalVisits : '—';
  document.querySelector('#stat-avg-session').textContent = totalVisits > 0 ? formatMs(totalMs / totalVisits) : '—';

  const subheadings = { today: '(today)', '7': '(last 7 days)', '30': '(last 30 days)', '180': '(last 6 months)', '365': '(last year)', all: '(all time)' };
  document.querySelector('#overview-subheading').textContent = subheadings[range] ?? '';
}

function renderHourly(range) {
  hourlyChartContainer.style.display = 'block';

  if (range === 'today') {
    hourlyChart.style.display = 'none';
    hourlyNotRelevant.textContent = 'Not relevant for "Today".';
    hourlyNotRelevant.style.display = 'block';
    hourlySubheading.textContent = '';
    return;
  }

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
    hourlyChart.style.display = 'none';
    hourlyNotRelevant.textContent = 'No data for past days yet.';
    hourlyNotRelevant.style.display = 'block';
    return;
  }

  hourlyChart.style.display = 'block';
  hourlyNotRelevant.style.display = 'none';

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
  const hasAudio = data.some(d => d.audioMs > 0);
  document.querySelector('#time-legend').style.display = hasAudio ? 'block' : 'none';

  const timeSeriesData = hasAudio
    ? [
        { label: 'Active', getValue: d => d.activeMs, color: '#2563eb', formatVal: formatMs },
        { label: 'Audio', getValue: d => d.audioMs, color: '#7c3aed', formatVal: formatMs },
      ]
    : undefined;

  drawBarChart({
    svgEl: timeChart,
    tooltipEl: document.querySelector('#time-tooltip'),
    data,
    maxVal: Math.max(...data.map(d => Math.max(d.activeMs, d.audioMs || 0))),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: '#2563eb',
    series: timeSeriesData,
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

