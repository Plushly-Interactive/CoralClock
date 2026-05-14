import { formatMs, localDayKey, dayKeysForRange } from '../../shared/timeUtils.js';
import { drawBarChart, formatWithSmallSub, STAT_LABELS } from '../../shared/utils.js';
import { resolveSite } from '../../background/siteResolution.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { displayPath } from '../../shared/paths.js';

const drill = JSON.parse(sessionStorage.getItem('subpageDrill') || 'null');
if (!drill) {
  location.href = '../dashboard/dashboard.html';
}

const { siteIds, path, prefix } = drill;
const siteId = siteIds[0];
const isMerged = siteIds.length > 1;

document.querySelector('#header-center').appendChild(createRangeDropdown());
const rangeSelect = document.querySelector('#range-select');
const timeChart = document.querySelector('#time-chart');
const visitsChart = document.querySelector('#visits-chart');
const timeNoData = document.querySelector('#time-no-data');
const visitsNoData = document.querySelector('#visits-no-data');
const hourlyChart = document.querySelector('#hourly-chart');
const hourlyTooltip = document.querySelector('#hourly-tooltip');
const hourlyNotRelevant = document.querySelector('#hourly-not-relevant');
const hourlySubheading = document.querySelector('#hourly-subheading');
const statsList = document.querySelector('#stats-list');
const backBtn = document.querySelector('#back-btn');
const crumbSite = document.querySelector('#path-crumb-site');

const rootStyle = getComputedStyle(document.documentElement);

const { siteLabel } = resolveSite(siteId);
document.querySelector('#site-label').textContent = siteLabel;
crumbSite.textContent = siteLabel;
document.title = `BiteGuard — ${siteLabel} ${displayPath(path)}`;
document.querySelector('#path-crumb-path').textContent = displayPath(path) + (prefix ? '*' : '');

const siteHref = isMerged
  ? `../site/site.html?ids=${encodeURIComponent(siteIds.join(','))}`
  : `../site/site.html?id=${encodeURIComponent(siteId)}`;
backBtn.href = siteHref;
crumbSite.href = siteHref;

const stats = [
  { label: STAT_LABELS.totalTime, id: 'stat-total-time' },
  { label: 'Daily avg', id: 'stat-daily-avg' },
  { label: STAT_LABELS.visits, id: 'stat-visits' },
];
stats.forEach(s => {
  const item = document.createElement('div');
  item.className = 'stat-item';
  item.innerHTML = `<span class="stat-label">${s.label}</span><span class="stat-value" id="${s.id}"></span>`;
  statsList.appendChild(item);
});

const legendTpl = document.querySelector('#legend-tpl');
document.querySelector('#time-legend').append(legendTpl.content.cloneNode(true));

let byDayCache = null;
let byHourCache = null;

initRangeSelect(rangeSelect, render);
window.addEventListener('storage', (e) => { if (e.key === 'theme') render(); });

loadAndRender();

async function loadAndRender() {
  [byDayCache, byHourCache] = await Promise.all([
    chrome.runtime.sendMessage({ type: 'getSubpagesByDay' }),
    chrome.runtime.sendMessage({ type: 'getSubpagesByHour' }),
  ]);
  render();
}

function matchesPath(key) {
  return prefix ? (key === path || key.startsWith(path + '/')) : key === path;
}

function entryForDay(dayKey) {
  const acc = { activeMs: 0, audioMs: 0, visits: 0 };
  const dayData = byDayCache?.[dayKey];
  if (!dayData) return acc;
  for (const sid of siteIds) {
    const sitePaths = dayData[sid];
    if (!sitePaths) continue;
    for (const [k, d] of Object.entries(sitePaths)) {
      if (!matchesPath(k)) continue;
      acc.activeMs += d.activeMs || 0;
      acc.audioMs += d.audioMs || 0;
      acc.visits += d.visits || 0;
    }
  }
  return acc;
}

function entryForHour(hourKey) {
  const acc = { activeMs: 0, audioMs: 0, visits: 0 };
  const hourData = byHourCache?.[hourKey];
  if (!hourData) return acc;
  for (const sid of siteIds) {
    const sitePaths = hourData[sid];
    if (!sitePaths) continue;
    for (const [k, d] of Object.entries(sitePaths)) {
      if (!matchesPath(k)) continue;
      acc.activeMs += d.activeMs || 0;
      acc.audioMs += d.audioMs || 0;
      acc.visits += d.visits || 0;
    }
  }
  return acc;
}

function render() {
  const range = rangeSelect.dataset.value;

  let data;
  if (range === 'today') {
    const dayKey = localDayKey(Date.now());
    data = Array.from({ length: 24 }, (_, h) => {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return { label: `${hStr}:00`, range: `${hStr}:00 - ${hNext}:00`, ...entryForHour(hourKey) };
    });
  } else {
    const dayKeys = dayKeysForRange(range, byDayCache);
    if (range === 'all' || parseInt(range) > 90) {
      let monthKeys;
      if (range === 'all') {
        monthKeys = [...new Set(dayKeys.map(d => d.slice(0, 7)))].sort();
      } else {
        const numMonths = Math.round(parseInt(range) / 30);
        const now = new Date();
        monthKeys = Array.from({ length: numMonths }, (_, i) => {
          const d = new Date(now.getFullYear(), now.getMonth() - (numMonths - 1 - i), 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        });
      }
      data = monthKeys.map(month => {
        const days = dayKeys.filter(d => d.startsWith(month));
        const totals = days.reduce((acc, d) => {
          const e = entryForDay(d);
          return { activeMs: acc.activeMs + e.activeMs, audioMs: acc.audioMs + e.audioMs, visits: acc.visits + e.visits };
        }, { activeMs: 0, audioMs: 0, visits: 0 });
        return { label: month, range: month, ...totals };
      });
    } else {
      const shortLabel = parseInt(range) <= 30;
      data = dayKeys.map(d => ({ label: shortLabel ? d.slice(5) : d, range: d, ...entryForDay(d) }));
    }
  }

  const hasData = data.some(d => d.activeMs > 0 || d.visits > 0);
  document.querySelector('#time-legend').style.display = 'none';
  timeChart.style.display = hasData ? 'block' : 'none';
  visitsChart.style.display = hasData ? 'block' : 'none';
  timeNoData.style.display = hasData ? 'none' : 'block';
  visitsNoData.style.display = hasData ? 'none' : 'block';
  if (hasData) drawCharts(data);
  renderStats(data, range);
  renderHourly(range);
}

function drawCharts(data) {
  const hasAudio = data.some(d => d.audioMs > 0);
  document.querySelector('#time-legend').style.display = hasAudio ? 'flex' : 'none';

  const timeSeriesData = hasAudio
    ? [
        { label: 'Active', getValue: d => d.activeMs, color: rootStyle.getPropertyValue('--color-chart-time'), formatVal: formatMs },
        { label: 'Audio', getValue: d => d.audioMs, color: rootStyle.getPropertyValue('--color-chart-audio'), formatVal: formatMs },
      ]
    : undefined;

  drawBarChart({
    svgEl: timeChart,
    tooltipEl: document.querySelector('#time-tooltip'),
    data,
    maxVal: Math.max(...data.map(d => Math.max(d.activeMs, d.audioMs || 0))),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: rootStyle.getPropertyValue('--color-chart-time'),
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
    color: rootStyle.getPropertyValue('--color-chart-visits'),
  });
}

function renderStats(data, range) {
  const totalMs = data.reduce((s, d) => s + d.activeMs, 0);
  const totalVisits = data.reduce((s, d) => s + d.visits, 0);

  let activeDays = 0;
  if (range !== 'today') {
    if (range === 'all') {
      const allDays = Object.keys(byDayCache ?? {}).sort();
      if (allDays.length > 0) {
        const [y1, m1, d1] = allDays[0].split('-').map(Number);
        const [y2, m2, d2] = allDays[allDays.length - 1].split('-').map(Number);
        const start = new Date(y1, m1 - 1, d1);
        const end = new Date(y2, m2 - 1, d2);
        activeDays = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
      }
    } else {
      activeDays = parseInt(range);
    }
  }
  const avgMs = activeDays > 0 ? totalMs / activeDays : 0;

  const totalEl = document.querySelector('#stat-total-time');
  if (totalMs > 0) totalEl.innerHTML = formatWithSmallSub(formatMs(totalMs));
  else totalEl.textContent = '—';

  const avgEl = document.querySelector('#stat-daily-avg');
  if (activeDays > 0 && totalMs > 0) avgEl.innerHTML = formatWithSmallSub(formatMs(avgMs));
  else avgEl.textContent = '—';

  document.querySelector('#stat-visits').textContent = totalVisits > 0 ? totalVisits : '—';

  const subheadings = { today: '(today)', '7': '(last 7 days)', '30': '(last 30 days)', '180': '(last 6 months)', '365': '(last year)', all: '(all time, from earliest data)' };
  document.querySelector('#overview-subheading').textContent = subheadings[range] ?? '';
}

function renderHourly(range) {
  const container = document.querySelector('#hourly-chart-container');
  container.style.display = 'block';

  if (range === 'today') {
    hourlyChart.style.display = 'none';
    hourlySubheading.textContent = '';
    hourlyNotRelevant.textContent = 'Not relevant for "Today".';
    hourlyNotRelevant.style.display = 'block';
    return;
  }

  const dayKeys = dayKeysForRange(range, byDayCache).filter(d => d !== localDayKey(Date.now()));
  const buckets = Array.from({ length: 24 }, () => ({ totalMs: 0, days: 0 }));
  for (const dayKey of dayKeys) {
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const e = entryForHour(hourKey);
      buckets[h].totalMs += e.activeMs;
    }
    buckets.forEach(b => b.days++);
  }

  hourlySubheading.textContent = range === 'all'
    ? '(all days from earliest data, excluding today)'
    : `(past ${parseInt(range)} days, excluding today)`;

  const data = buckets.map((b, h) => {
    const hStr = String(h).padStart(2, '0');
    const hNext = String(h + 1).padStart(2, '0');
    const avgMs = b.days > 0 ? b.totalMs / b.days : 0;
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
    maxVal: Math.max(...data.map(d => d.activeMs), 1),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: rootStyle.getPropertyValue('--color-chart-hourly'),
  });
}
