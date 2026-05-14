import { formatMs, localDayKey, dayKeysForRange } from '../../shared/timeUtils.js';
import { drawBarChart, formatWithSmallSub, STAT_LABELS } from '../../shared/utils.js';
import { resolveSite } from '../../background/siteResolution.js';
import { initDrill, isInDrillMode, enterDrill } from './drill.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { createHourlyChart } from '../../shared/hourlyChart.js';
import { mergePaths, displayPath } from '../../shared/paths.js';
import { escapeHtml } from '../../shared/utils.js';

const params = new URLSearchParams(location.search);
const siteId = params.get('id');
const siteIds = params.get('ids')?.split(',') ?? null;
const isMerged = !!siteIds;
const effectiveSiteIds = isMerged ? siteIds : [siteId];
document.querySelector('#header-center').appendChild(createRangeDropdown());
const rangeSelect = document.querySelector('#range-select');
const timeChart = document.querySelector('#time-chart');
const visitsChart = document.querySelector('#visits-chart');
const timeNoData = document.querySelector('#time-no-data');
const visitsNoData = document.querySelector('#visits-no-data');
const peakTooltip = document.querySelector('#peak-tooltip');
const statsContainer = document.querySelector('#stats-container');

const statsList = document.querySelector('#stats-list');

const rootStyle = getComputedStyle(document.documentElement);

const topStats = [
  { label: STAT_LABELS.today, id: 'stat-today' },
  { label: STAT_LABELS.dailyAvg, id: 'stat-daily-avg' },
  { label: STAT_LABELS.peakDay, id: 'stat-peak' },
];

const bottomStats = [
  { label: STAT_LABELS.totalTime, id: 'stat-total-time' },
  { label: STAT_LABELS.visits, id: 'stat-visits' },
  { label: STAT_LABELS.avgSession, id: 'stat-avg-session' },
];

topStats.forEach((stat, i) => {
  const item = document.createElement('div');
  item.className = 'stat-item';
  if (i === 2) {
    item.id = 'stat-peak-item';
    item.innerHTML = `<span class="stat-label">${stat.label}</span><span class="stat-value-row"><span class="stat-value" id="${stat.id}"></span><span id="stat-peak-info" class="stat-info" style="display:none" title="">ⓘ</span></span>`;
  } else {
    item.innerHTML = `<span class="stat-label">${stat.label}</span><span class="stat-value" id="${stat.id}"></span>`;
  }
  statsList.appendChild(item);
});

const divider = document.createElement('hr');
divider.id = 'stats-divider';
statsList.appendChild(divider);

bottomStats.forEach(stat => {
  const item = document.createElement('div');
  item.className = 'stat-item';
  item.innerHTML = `<span class="stat-label">${stat.label}</span><span class="stat-value" id="${stat.id}"></span>`;
  statsList.appendChild(item);
});

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

function entrySum(obj) {
  const zero = { activeMs: 0, audioMs: 0, visits: 0 };
  if (!obj) return zero;
  if (!isMerged) {
    const e = obj[siteId];
    return e ? { activeMs: e.activeMs ?? 0, audioMs: e.audioMs ?? 0, visits: e.visits ?? 0 } : zero;
  }
  return siteIds.reduce((acc, id) => {
    const e = obj[id];
    if (!e) return acc;
    return { activeMs: acc.activeMs + (e.activeMs ?? 0), audioMs: acc.audioMs + (e.audioMs ?? 0), visits: acc.visits + (e.visits ?? 0) };
  }, { ...zero });
}

if (siteId || siteIds) {
  const { siteLabel } = resolveSite(siteId ?? siteIds[0]);
  document.querySelector('#site-label').textContent = siteLabel;
  document.querySelector('#site-id').textContent = isMerged ? siteIds.join(', ') : siteId;
  document.title = `BiteGuard — ${siteLabel}`;
}

let byDayCache = null;
let byHourCache = null;
let subpagesByDayCache = null;
let currentDepth = null;
let currentSort = 'time';

const chartsGrid = document.querySelector('#charts-grid');
const drillView = document.querySelector('#drill-view');
const navLabel = document.querySelector('#nav-label');
const navPrev = document.querySelector('#nav-prev');
const navNext = document.querySelector('#nav-next');
const navClose = document.querySelector('#nav-close');
const drillChart = document.querySelector('#drill-chart');
const drillTooltip = document.querySelector('#drill-tooltip');
const drillLegend = document.querySelector('#drill-legend');
const drillTimeBtn = document.querySelector('#drill-time-btn');
const drillVisitsBtn = document.querySelector('#drill-visits-btn');
const drillHourBtn = document.querySelector('#drill-hour-btn');
const drillNoData = document.querySelector('#drill-no-data');
const drillMonthLink = document.querySelector('#drill-month-link');
const drillStats = document.querySelector('#drill-stats');
const drillScaleBtn = document.querySelector('#drill-scale-btn');
const drillKeysBtn = document.querySelector('#drill-keys-btn');
const drillKeysPopup = document.querySelector('#drill-keys-popup');
const backBtn = document.querySelector('#back-btn');

const hourlyChart = document.querySelector('#hourly-chart');
const hourlyTooltip = document.querySelector('#hourly-tooltip');
const hourlyChartContainer = document.querySelector('#hourly-chart-container');
const hourlyNotRelevant = document.querySelector('#hourly-not-relevant');
const hourlySubheading = document.querySelector('#hourly-subheading');

const legendTpl = document.querySelector('#legend-tpl');
document.querySelector('#time-legend').append(legendTpl.content.cloneNode(true));
document.querySelector('#drill-legend').append(legendTpl.content.cloneNode(true));

const hourly = createHourlyChart({
  chart: hourlyChart,
  tooltip: hourlyTooltip,
  container: hourlyChartContainer,
  subheading: hourlySubheading,
  notRelevant: hourlyNotRelevant,
  siteIds: effectiveSiteIds,
  allDaysLabel: '(all days from earliest data, excluding today)',
  getRangeValue: () => rangeSelect.dataset.value,
});

initRangeSelect(rangeSelect, render);

window.addEventListener('storage', (e) => {
  if (e.key === 'theme') render();
});

initDrill({
  chartsGrid,
  drillView,
  rangeSelect,
  backBtn,
  navPrev,
  navNext,
  navClose,
  drillTimeBtn,
  drillVisitsBtn,
  drillHourBtn,
  drillChart,
  drillTooltip,
  drillLegend,
  drillNoData,
  drillMonthLink,
  drillStats,
  drillScaleBtn,
  drillKeysBtn,
  drillKeysPopup,
  navLabel,
  entrySum,
  get byDayCache() { return byDayCache; },
  siteIds: effectiveSiteIds,
  render,
});

loadAndRender();

async function loadAndRender() {
  byDayCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByDay' });
  subpagesByDayCache = await chrome.runtime.sendMessage({ type: 'getSubpagesByDay' });
  if (rangeSelect.dataset.value === 'today') await loadByHour();
  render();
}

async function loadByHour() {
  if (byHourCache) return;
  byHourCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByHourToday' });
}

function render() {
  if (isInDrillMode()) return;
  const range = rangeSelect.dataset.value;

  let data;
  if (range === 'today') {
    if (!byHourCache) { loadByHour().then(render); return; }
    const dayKey = localDayKey(Date.now());
    data = Array.from({ length: 24 }, (_, h) => {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const hStr = String(h).padStart(2, '0');
      const hNext = String(h + 1).padStart(2, '0');
      return { label: `${hStr}:00`, range: `${hStr}:00 - ${hNext}:00`, ...entrySum(byHourCache[hourKey]) };
    });
  } else {
    let dayKeys;
    if (range === 'all') {
      const allDays = Object.keys(byDayCache ?? {}).sort();
      const daysWithSiteData = allDays.filter(day => {
        const entry = entrySum(byDayCache[day]);
        return entry.activeMs > 0 || entry.visits > 0;
      });
      if (daysWithSiteData.length > 0) {
        const firstDay = daysWithSiteData[0];
        const [y1, m1, d1] = firstDay.split('-').map(Number);
        const today = new Date();
        const [y2, m2, d2] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
        dayKeys = [];
        for (let date = new Date(y1, m1 - 1, d1); date <= new Date(y2, m2 - 1, d2); date.setDate(date.getDate() + 1)) {
          dayKeys.push(localDayKey(date.getTime()));
        }
      } else {
        dayKeys = [];
      }
    } else {
      const now = new Date();
      dayKeys = Array.from({ length: parseInt(range) }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (parseInt(range) - 1 - i));
        return localDayKey(d.getTime());
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
        const totals = days.reduce((acc, day) => {
          const e = entrySum(byDayCache?.[day]);
          return { activeMs: acc.activeMs + e.activeMs, audioMs: acc.audioMs + e.audioMs, visits: acc.visits + e.visits };
        }, { activeMs: 0, audioMs: 0, visits: 0 });
        return { label: month, range: month, ...totals };
      });
    } else {
      const shortLabel = parseInt(range) <= 30;
      data = dayKeys.map(day => ({ label: shortLabel ? day.slice(5) : day, range: day, ...entrySum(byDayCache?.[day]) }));
    }
  }

  const hasData = data.some(d => d.activeMs > 0 || d.visits > 0);
  document.querySelector('#time-legend').style.display = 'none';
  timeChart.style.display = hasData ? 'block' : 'none';
  visitsChart.style.display = hasData ? 'block' : 'none';
  timeNoData.style.display = hasData ? 'none' : 'block';
  visitsNoData.style.display = hasData ? 'none' : 'block';
  if (hasData) drawChart(data, range);
  hourly.render(range);
  renderStats(data, range);
  renderSubpages(range);
}


function renderStats(data, range) {
  const todayKey = localDayKey(Date.now());
  const todayMs = entrySum(byDayCache?.[todayKey]).activeMs;

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

  let peakMs = 0, peakLabel = '';
  if (range !== 'today' && byDayCache) {
    const cutoff = range === 'all' ? null : (() => {
      const d = new Date();
      d.setDate(d.getDate() - (parseInt(range) - 1));
      return localDayKey(d.getTime());
    })();
    for (const [day, sites] of Object.entries(byDayCache)) {
      if (cutoff && day < cutoff) continue;
      const ms = entrySum(sites).activeMs;
      if (ms > peakMs) { peakMs = ms; peakLabel = day; }
    }
  }

  document.querySelector('#stat-today').textContent = formatMs(todayMs) || '0m';
  const dailyAvgEl = document.querySelector('#stat-daily-avg');
  if (activeDays > 0) {
    dailyAvgEl.innerHTML = formatWithSmallSub(formatMs(avgMs));
  } else {
    dailyAvgEl.textContent = '—';
  }
  const peakEl = document.querySelector('#stat-peak');
  peakEl.textContent = peakMs > 0 ? formatMs(peakMs) : '—';
  peakEl.classList.remove('has-tooltip');
  peakInfo.style.display = peakMs > 0 ? 'inline' : 'none';
  peakInfo.dataset.date = peakMs > 0 ? peakLabel : '';
  peakInfo.title = '';
  const totalTimeEl = document.querySelector('#stat-total-time');
  if (totalMs > 0) {
    totalTimeEl.innerHTML = formatWithSmallSub(formatMs(totalMs));
  } else {
    totalTimeEl.textContent = '—';
  }
  document.querySelector('#stat-visits').textContent = totalVisits > 0 ? totalVisits : '—';
  document.querySelector('#stat-avg-session').textContent = totalVisits > 0 ? formatMs(totalMs / totalVisits) : '—';

  const subheadings = { today: '(today)', '7': '(last 7 days)', '30': '(last 30 days)', '180': '(last 6 months)', '365': '(last year)', all: '(all time, from earliest data)' };
  document.querySelector('#overview-subheading').textContent = subheadings[range] ?? '';
}

function drawChart(data, range) {
  const timeOnClick = range !== 'today' ? r => enterDrill(r, null, 'time') : null;
  const visitsOnClick = range !== 'today' ? r => enterDrill(r, null, 'visits') : null;
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
    onBarClick: timeOnClick,
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
    onBarClick: visitsOnClick,
  });
}

function aggregateSubpages(range) {
  const out = {};
  if (!subpagesByDayCache) return out;
  const dayKeys = dayKeysForRange(range, subpagesByDayCache);
  for (const dayKey of dayKeys) {
    const dayData = subpagesByDayCache[dayKey];
    if (!dayData) continue;
    for (const sid of effectiveSiteIds) {
      const sitePaths = dayData[sid];
      if (!sitePaths) continue;
      for (const [path, d] of Object.entries(sitePaths)) {
        out[path] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
        out[path].activeMs += d.activeMs || 0;
        out[path].audioMs += d.audioMs || 0;
        out[path].overlapMs += d.overlapMs || 0;
        out[path].visits += d.visits || 0;
      }
    }
  }
  return out;
}

function buildDepthToggle(paths) {
  const actualMax = Math.max(...paths.map(p => p.split('/').filter(Boolean).length));
  const shownMax = Math.min(5, actualMax - 1);
  const toggle = document.querySelector('#depth-toggle');
  toggle.innerHTML = '';
  for (let d = 1; d <= shownMax; d++) {
    const btn = document.createElement('button');
    btn.className = 'seg-btn';
    btn.textContent = String(d);
    btn.onclick = () => setDepth(d, btn);
    if (currentDepth === d) btn.classList.add('active');
    toggle.appendChild(btn);
  }
  const full = document.createElement('button');
  full.className = 'seg-btn';
  full.textContent = 'Full';
  full.onclick = () => setDepth(null, full);
  if (currentDepth === null) full.classList.add('active');
  toggle.appendChild(full);
}

function setDepth(depth, btn) {
  currentDepth = depth;
  document.querySelectorAll('#depth-toggle .seg-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderSubpages(rangeSelect.dataset.value);
}

document.querySelector('#sort-time-btn').onclick = () => setSort('time');
document.querySelector('#sort-visits-btn').onclick = () => setSort('visits');

function setSort(sort) {
  currentSort = sort;
  document.querySelector('#sort-time-btn').classList.toggle('active', sort === 'time');
  document.querySelector('#sort-visits-btn').classList.toggle('active', sort === 'visits');
  renderSubpages(rangeSelect.dataset.value);
}

function renderSubpages(range) {
  const raw = aggregateSubpages(range);
  const paths = Object.keys(raw);
  if (paths.length === 0) {
    chartsGrid.classList.remove('has-subpages');
    return;
  }
  chartsGrid.classList.add('has-subpages');
  buildDepthToggle(paths);

  const merged = mergePaths(raw, currentDepth);
  merged.sort((a, b) => currentSort === 'time' ? b.activeMs - a.activeMs : b.visits - a.visits);

  const list = document.querySelector('#subpages-list');
  list.innerHTML = '';
  for (const row of merged) {
    const li = document.createElement('li');
    const decoded = displayPath(row.path);
    const display = escapeHtml(decoded);
    const star = row.truncated ? '<span class="subpage-truncated">*</span>' : '';
    const num = currentSort === 'time'
      ? formatMs(row.activeMs)
      : `${row.visits} visit${row.visits === 1 ? '' : 's'}`;
    li.title = decoded + (row.truncated ? '*' : '');
    li.innerHTML = `<span class="subpage-path">${display}${star}</span><span class="subpage-num">${num}</span>`;
    li.onclick = () => {
      sessionStorage.setItem('subpageDrill', JSON.stringify({
        siteIds: effectiveSiteIds,
        path: row.path,
        prefix: row.truncated,
      }));
      location.href = '../path/path.html';
    };
    list.appendChild(li);
  }
  document.querySelector('#subpages-count').textContent = `${merged.length} path${merged.length !== 1 ? 's' : ''}`;
}
