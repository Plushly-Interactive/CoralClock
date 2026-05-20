import { formatMs, localDayKey, dayKeysForRange } from '../../shared/timeUtils.js';
import { formatWithSmallSub, STAT_LABELS, escapeHtml, CHART_LEGEND_HTML } from '../../shared/utils.js';
import { eTLDPlus1 } from '../../background/siteResolution.js';
import { formatHostnameLabel } from '../../shared/labels.js';
import { initDrill, isInDrillMode, enterDrill, exitDrillCompletely } from '../../shared/drill.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { createHourlyChart } from '../../shared/hourlyChart.js';
import { mergePaths, displayPath, stripQuery } from '../../shared/paths.js';
import { buildOverviewData, drawOverviewCharts, subheadingText, activeDaysFromRange } from '../../shared/overview.js';
import { autoStartIfMatches } from '../../shared/tour.js';
import { analyticsRequest, clearMockModeCache } from '../../shared/tourMockData.js';

const params = new URLSearchParams(location.search);
const siteId = params.get('id');
const siteIds = params.get('ids')?.split(',') ?? null;
const isMerged = !!siteIds;
let effectiveSiteIds = isMerged ? siteIds : [siteId];
let isAggregatedEtld1 = false;
document.querySelector('#header-center').appendChild(createRangeDropdown());
const rangeSelect = document.querySelector('#range-select');
const timeChart = document.querySelector('#time-chart');
const timeTooltip = document.querySelector('#time-tooltip');
const timeLegend = document.querySelector('#time-legend');
const visitsChart = document.querySelector('#visits-chart');
const visitsTooltip = document.querySelector('#visits-tooltip');
const timeNoData = document.querySelector('#time-no-data');
const visitsNoData = document.querySelector('#visits-no-data');
const peakTooltip = document.querySelector('#peak-tooltip');
const statsContainer = document.querySelector('#stats-container');

const statsList = document.querySelector('#stats-list');

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
  return effectiveSiteIds.reduce((acc, id) => {
    const e = obj[id];
    if (!e) return acc;
    return { activeMs: acc.activeMs + (e.activeMs ?? 0), audioMs: acc.audioMs + (e.audioMs ?? 0), visits: acc.visits + (e.visits ?? 0) };
  }, { ...zero });
}

function applyHeader() {
  if (!siteId && !siteIds) return;
  const primary = siteId ?? siteIds[0];
  const label = formatHostnameLabel(primary);
  document.querySelector('#site-label').textContent = label;
  let secondary;
  if (isMerged) secondary = siteIds.join(', ');
  else if (isAggregatedEtld1) secondary = effectiveSiteIds.join(', ');
  else secondary = siteId;
  document.querySelector('#site-id').textContent = secondary;
  document.title = `BiteGuard — ${label}`;
}
applyHeader();

let byDayCache = null;
let byHourCache = null;
let subpagesByDayCache = null;
let currentDepth = null;
let currentSort = 'time';
let stripParams = sessionStorage.getItem('subpagesStripParams') !== 'false';
const stripParamsToggle = document.querySelector('#strip-params-toggle');
stripParamsToggle.checked = stripParams;
stripParamsToggle.addEventListener('change', () => {
  stripParams = stripParamsToggle.checked;
  sessionStorage.setItem('subpagesStripParams', stripParams);
  renderSubpages(rangeSelect.dataset.value);
});

let hideBriefSubpages = sessionStorage.getItem('hideBrief') !== 'false';
const hideBriefSubpagesToggle = document.querySelector('#hide-brief-subpages-toggle');
hideBriefSubpagesToggle.checked = hideBriefSubpages;
hideBriefSubpagesToggle.addEventListener('change', () => {
  hideBriefSubpages = hideBriefSubpagesToggle.checked;
  sessionStorage.setItem('hideBrief', hideBriefSubpages);
  renderSubpages(rangeSelect.dataset.value);
});

const chartsGrid = document.querySelector('#charts-grid');
const drillView = document.querySelector('#drill-view');
const backBtn = document.querySelector('#back-btn');

const hourlyChart = document.querySelector('#hourly-chart');
const hourlyTooltip = document.querySelector('#hourly-tooltip');
const hourlyChartContainer = document.querySelector('#hourly-chart-container');
const hourlyNotRelevant = document.querySelector('#hourly-not-relevant');
const hourlySubheading = document.querySelector('#hourly-subheading');

timeLegend.innerHTML = CHART_LEGEND_HTML;

const hourly = createHourlyChart({
  chart: hourlyChart,
  tooltip: hourlyTooltip,
  container: hourlyChartContainer,
  subheading: hourlySubheading,
  notRelevant: hourlyNotRelevant,
  allDaysLabel: '(all days from earliest data, excluding today)',
  getRangeValue: () => rangeSelect.dataset.value,
  loadAvgPerHour: (range) => analyticsRequest({
    type: 'getAvgPerClockHour', siteIds: effectiveSiteIds, range,
  }),
});

initRangeSelect(rangeSelect, render);

window.addEventListener('storage', (e) => {
  if (e.key === 'theme') render();
});

backBtn.addEventListener('click', (e) => {
  if (!isInDrillMode()) return;
  e.preventDefault();
  location.href = '../dashboard/dashboard.html';
});

initDrill({
  chartsGrid,
  drillView,
  rangeSelect,
  getDayEntry: (dayKey) => entrySum(byDayCache?.[dayKey]),
  getHourEntriesForDay: async (dayKey) => {
    const hourData = await analyticsRequest({ type: 'getAnalyticsByHourForDay', dayKey });
    const result = {};
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      result[hourKey] = entrySum(hourData?.[hourKey]);
    }
    return result;
  },
  getAvgPerClockHour: (dayKeys) => analyticsRequest({
    type: 'getAvgPerClockHour', siteIds: effectiveSiteIds, range: null, dayKeys,
  }),
  render,
});

const loadAndRenderPromise = loadAndRender();

window.addEventListener('pageshow', () => {
  hideBriefSubpages = sessionStorage.getItem('hideBrief') !== 'false';
  hideBriefSubpagesToggle.checked = hideBriefSubpages;
  stripParams = sessionStorage.getItem('subpagesStripParams') !== 'false';
  stripParamsToggle.checked = stripParams;
  if (subpagesByDayCache) renderSubpages(rangeSelect.dataset.value);
});

async function loadAndRender() {
  byDayCache = await analyticsRequest({ type: 'getAnalyticsByDay' });
  subpagesByDayCache = await analyticsRequest({ type: 'getSubpagesByDay' });
  resolveAggregationMode();
  if (rangeSelect.dataset.value === 'today') await loadByHour();
  render();
}

function resolveAggregationMode() {
  if (isMerged || !siteId) return;
  const matched = new Set();
  for (const cache of [byDayCache, subpagesByDayCache])
    for (const sites of Object.values(cache ?? {}))
      for (const host of Object.keys(sites))
        if (host === siteId || eTLDPlus1(host) === siteId) matched.add(host);
  if (matched.size > 1) {
    effectiveSiteIds = [...matched];
    isAggregatedEtld1 = true;
    applyHeader();
  }
}

async function loadByHour() {
  if (byHourCache) return;
  byHourCache = await analyticsRequest({ type: 'getAnalyticsByHourToday' });
}

function siteDayKeysForRange(range) {
  if (range === 'today') return [localDayKey(Date.now())];
  if (range === 'all') {
    const allDays = Object.keys(byDayCache ?? {}).sort();
    const daysWithSiteData = allDays.filter(day => {
      const entry = entrySum(byDayCache[day]);
      return entry.activeMs > 0 || entry.visits > 0;
    });
    if (daysWithSiteData.length === 0) return [];
    const [y1, m1, d1] = daysWithSiteData[0].split('-').map(Number);
    const today = new Date();
    const [y2, m2, d2] = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
    const out = [];
    for (let date = new Date(y1, m1 - 1, d1); date <= new Date(y2, m2 - 1, d2); date.setDate(date.getDate() + 1)) {
      out.push(localDayKey(date.getTime()));
    }
    return out;
  }
  return dayKeysForRange(range, byDayCache);
}

function render() {
  if (isInDrillMode()) return;
  const range = rangeSelect.dataset.value;
  if (range === 'today' && !byHourCache) { loadByHour().then(render); return; }
  const dayKeys = siteDayKeysForRange(range);
  const data = buildOverviewData({
    range, dayKeys,
    getDayEntry: (dayKey) => entrySum(byDayCache?.[dayKey]),
    getHourEntry: (hourKey) => entrySum(byHourCache?.[hourKey]),
  });
  drawOverviewCharts({
    data, range,
    timeChart, timeTooltip, timeLegend, timeNoData,
    visitsChart, visitsTooltip, visitsNoData,
    onEnterDrill: (r, metric) => enterDrill(r, null, metric),
  });
  hourly.render(range);
  renderStats(data, range);
  renderSubpages(range);
}


function renderStats(data, range) {
  const todayKey = localDayKey(Date.now());
  const todayMs = entrySum(byDayCache?.[todayKey]).activeMs;

  const totalMs = data.reduce((s, d) => s + d.activeMs, 0);
  const totalVisits = data.reduce((s, d) => s + d.visits, 0);
  const activeDays = activeDaysFromRange(range, byDayCache);
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

  document.querySelector('#overview-subheading').textContent = subheadingText(range);
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
        const key = stripParams ? stripQuery(path) : path;
        out[key] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
        out[key].activeMs += d.activeMs || 0;
        out[key].audioMs += d.audioMs || 0;
        out[key].overlapMs += d.overlapMs || 0;
        out[key].visits += d.visits || 0;
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

const sortTimeBtn = document.querySelector('#sort-time-btn');
const sortVisitsBtn = document.querySelector('#sort-visits-btn');
sortTimeBtn.onclick = () => setSort('time');
sortVisitsBtn.onclick = () => setSort('visits');

function setSort(sort) {
  currentSort = sort;
  sortTimeBtn.classList.toggle('active', sort === 'time');
  sortVisitsBtn.classList.toggle('active', sort === 'visits');
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

  if (hideBriefSubpages && !mergePaths(raw, currentDepth).some(r => r.activeMs >= 60_000)) {
    const actualMax = Math.max(...paths.map(p => p.split('/').filter(Boolean).length));
    const shownMax = Math.min(5, actualMax - 1);
    for (let d = shownMax; d >= 1; d--) {
      if (mergePaths(raw, d).some(r => r.activeMs >= 60_000)) { currentDepth = d; break; }
    }
  }

  buildDepthToggle(paths);

  let merged = mergePaths(raw, currentDepth);
  merged.sort((a, b) => currentSort === 'time' ? b.activeMs - a.activeMs : b.visits - a.visits);
  if (hideBriefSubpages) merged = merged.filter(r => r.activeMs >= 60_000);

  const pathSiteMs = {};
  if (effectiveSiteIds.length > 1) {
    for (const dayKey of dayKeysForRange(range, subpagesByDayCache)) {
      const dayData = subpagesByDayCache?.[dayKey];
      if (!dayData) continue;
      for (const sid of effectiveSiteIds) {
        for (const [p, d] of Object.entries(dayData[sid] ?? {})) {
          const key = stripParams ? stripQuery(p) : p;
          pathSiteMs[key] ??= {};
          pathSiteMs[key][sid] = (pathSiteMs[key][sid] ?? 0) + (d.activeMs || 0);
        }
      }
    }
  }

  function domainForPath(path) {
    if (effectiveSiteIds.length === 1) return effectiveSiteIds[0];
    const siteMs = pathSiteMs[path];
    if (!siteMs) return effectiveSiteIds[0];
    return effectiveSiteIds.reduce((best, sid) => (siteMs[sid] ?? 0) > (siteMs[best] ?? 0) ? sid : best);
  }

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
    const drill = document.createElement('div');
    drill.className = 'subpage-drill';
    drill.innerHTML = `<span class="subpage-path">${display}${star}</span><span class="subpage-num">${num}</span>`;
    drill.onclick = () => {
      sessionStorage.setItem('subpageDrill', JSON.stringify({
        siteIds: effectiveSiteIds,
        path: row.path,
        prefix: row.truncated,
        stripParams,
      }));
      location.href = '../path/path.html';
    };
    let openPath = row.path;
    if (row.truncated) {
      const prefix = row.path + '/';
      let bestMs = -1;
      for (const [p, d] of Object.entries(raw)) {
        if (p.startsWith(prefix) && (d.activeMs || 0) > bestMs) {
          bestMs = d.activeMs || 0;
          openPath = p;
        }
      }
    }
    const openBtn = document.createElement('a');
    openBtn.className = 'subpage-open-btn';
    openBtn.href = `https://${domainForPath(openPath)}${openPath}`;
    openBtn.target = '_blank';
    openBtn.rel = 'noopener noreferrer';
    openBtn.textContent = '↗ Open';
    li.appendChild(drill);
    li.appendChild(openBtn);
    list.appendChild(li);
  }
  document.querySelector('#subpages-count').textContent = `${merged.length} page${merged.length !== 1 ? 's' : ''}`;
}

function ensureDrillOpen() {
  if (isInDrillMode()) return;
  const days = Object.keys(byDayCache ?? {}).sort();
  const pick = days[days.length - 1];
  if (pick) enterDrill(pick, null, 'time');
}

const siteTourSteps = [
  {
    selector: '#site-title',
    title: 'Site details',
    body: 'This page shows everything BiteGuard tracks for a single site. The site name and ID are shown here.',
  },
  {
    selector: '#time-chart-container',
    title: 'Time spent',
    body: 'Active browsing time and audio playback on this site, per day in the selected range.',
  },
  {
    selector: '#stats-container',
    title: 'Overview',
    body: 'Aggregate stats for the range: daily average, peak day, total time and more.',
  },
  {
    selector: '#visits-chart-container',
    title: 'Visits',
    body: 'Number of separate visits to this site per day.',
  },
  {
    selector: '#hourly-chart-container',
    title: 'Average per clock hour',
    body: 'Your typical browsing pattern on this site across the 24 hours of the day.',
  },
  {
    selector: '#time-chart-container',
    title: 'Drill into a day',
    body: 'Click any day in the time chart to see hourly detail for that single day.',
    advanceOn: 'click',
  },
  {
    selector: '#drill-chart-wrapper',
    title: 'Daily detail',
    body: 'This shows the activity for the chosen day in finer granularity.',
    drillStep: true,
    onEnter: ensureDrillOpen,
    onExit: ({ direction }) => {
      if (direction === 'backward' && isInDrillMode()) exitDrillCompletely();
    },
  },
  {
    selector: '#drill-controls',
    title: 'Navigate and switch metric',
    body: 'Move to neighboring days with the arrows, or switch between Time, Visits and Hourly average.',
    drillStep: true,
    onEnter: ensureDrillOpen,
  },
  {
    selector: '#nav-close',
    title: 'Back to overview',
    body: 'Click Overview to leave drill mode and return to the full range.',
    advanceOn: 'click',
    drillStep: true,
    onEnter: ensureDrillOpen,
  },
  {
    selector: '#subpages-container',
    title: 'Page activity',
    body: 'Every subpage under this site. Click a row to drill into a subpage.',
    handoff: { nextSurface: 'path', mode: 'inPage' },
  },
];

loadAndRenderPromise.then(() => autoStartIfMatches('site', siteTourSteps, {
  onClose: ({ skipped }) => {
    if (skipped) {
      clearMockModeCache();
      byDayCache = null;
      subpagesByDayCache = null;
      byHourCache = null;
      loadAndRender();
    }
  },
}));
