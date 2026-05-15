import { formatMs, localDayKey, dayKeysForRange } from '../../shared/timeUtils.js';
import { formatWithSmallSub, STAT_LABELS, CHART_LEGEND_HTML } from '../../shared/utils.js';
import { resolveSite } from '../../background/siteResolution.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { displayPath } from '../../shared/paths.js';
import { initDrill, isInDrillMode, enterDrill, exitDrillCompletely } from '../../shared/drill.js';
import { createHourlyChart } from '../../shared/hourlyChart.js';
import { buildOverviewData, drawOverviewCharts, subheadingText, activeDaysFromRange } from '../../shared/overview.js';

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
const timeTooltip = document.querySelector('#time-tooltip');
const timeLegend = document.querySelector('#time-legend');
const timeNoData = document.querySelector('#time-no-data');
const visitsChart = document.querySelector('#visits-chart');
const visitsTooltip = document.querySelector('#visits-tooltip');
const visitsNoData = document.querySelector('#visits-no-data');
const statsList = document.querySelector('#stats-list');
const backBtn = document.querySelector('#back-btn');
const crumbSite = document.querySelector('#path-crumb-site');

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

timeLegend.innerHTML = CHART_LEGEND_HTML;

const chartsGrid = document.querySelector('#charts-grid');
const drillView = document.querySelector('#drill-view');

backBtn.addEventListener('click', (e) => {
  e.preventDefault();
  if (isInDrillMode()) {
    exitDrillCompletely();
  } else {
    location.href = siteHref;
  }
});

let byDayCache = null;
let byHourCache = null;

function matchesPath(key) {
  return prefix ? (key === path || key.startsWith(path + '/')) : key === path;
}

function entryFor(cache, key) {
  const acc = { activeMs: 0, audioMs: 0, visits: 0 };
  const data = cache?.[key];
  if (!data) return acc;
  for (const sid of siteIds) {
    const sitePaths = data[sid];
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

const getDayEntry = (dayKey) => entryFor(byDayCache, dayKey);
const getHourEntry = (hourKey) => entryFor(byHourCache, hourKey);

function avgPerClockHour(dayKeys) {
  if (dayKeys.length === 0) return new Array(24).fill(0);
  const sums = new Array(24).fill(0);
  for (const dayKey of dayKeys) {
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      sums[h] += getHourEntry(hourKey).activeMs;
    }
  }
  return sums.map(s => s / dayKeys.length);
}

const hourly = createHourlyChart({
  chart: document.querySelector('#hourly-chart'),
  tooltip: document.querySelector('#hourly-tooltip'),
  container: document.querySelector('#hourly-chart-container'),
  subheading: document.querySelector('#hourly-subheading'),
  notRelevant: document.querySelector('#hourly-not-relevant'),
  allDaysLabel: '(all days from earliest data, excluding today)',
  getRangeValue: () => rangeSelect.dataset.value,
  loadAvgPerHour: (range) => {
    const todayKey = localDayKey(Date.now());
    return avgPerClockHour(dayKeysForRange(range, byDayCache).filter(d => d !== todayKey));
  },
});

initDrill({
  chartsGrid,
  drillView,
  rangeSelect,
  getDayEntry,
  getHourEntriesForDay: (dayKey) => {
    const result = {};
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      result[hourKey] = getHourEntry(hourKey);
    }
    return result;
  },
  getAvgPerClockHour: avgPerClockHour,
  render,
});

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

function render() {
  if (isInDrillMode()) return;
  const range = rangeSelect.dataset.value;
  const dayKeys = dayKeysForRange(range, byDayCache);
  const data = buildOverviewData({ range, dayKeys, getDayEntry, getHourEntry });
  drawOverviewCharts({
    data, range,
    timeChart, timeTooltip, timeLegend, timeNoData,
    visitsChart, visitsTooltip, visitsNoData,
    onEnterDrill: (r, metric) => enterDrill(r, null, metric),
  });
  renderStats(data, range);
  hourly.render(range);
}

function renderStats(data, range) {
  const totalMs = data.reduce((s, d) => s + d.activeMs, 0);
  const totalVisits = data.reduce((s, d) => s + d.visits, 0);
  const activeDays = activeDaysFromRange(range, byDayCache);
  const avgMs = activeDays > 0 ? totalMs / activeDays : 0;

  const totalEl = document.querySelector('#stat-total-time');
  if (totalMs > 0) totalEl.innerHTML = formatWithSmallSub(formatMs(totalMs));
  else totalEl.textContent = '—';

  const avgEl = document.querySelector('#stat-daily-avg');
  if (activeDays > 0 && totalMs > 0) avgEl.innerHTML = formatWithSmallSub(formatMs(avgMs));
  else avgEl.textContent = '—';

  document.querySelector('#stat-visits').textContent = totalVisits > 0 ? totalVisits : '—';
  document.querySelector('#overview-subheading').textContent = subheadingText(range);
}
