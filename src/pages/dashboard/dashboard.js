import { formatMs, localDayKey } from '../../shared/timeUtils.js';
import { drawBarChart, formatWithSmallSub, escapeHtml, renderStorageBar, navButton } from '../../shared/utils.js';
import { eTLDPlus1 } from '../../background/siteResolution.js';
import { formatHostnameLabel } from '../../shared/labels.js';
import { seedTestData } from '../../data/seedTestData.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { createHourlyChart } from '../../shared/hourlyChart.js';
import { runTour, readTourState, writeTourState, clearTourProgress, TOUR_VERSION } from '../../shared/tour.js';
import { analyticsRequest, clearMockModeCache } from '../../shared/tourMockData.js';
import { openModal, closeModal } from '../../data/importData.js';

document.querySelector('#header-center').appendChild(createRangeDropdown());
navButton(document.querySelector('#rules-btn'), '../rules/rules.html');
document.querySelector('#prune-btn').addEventListener('click', () => {
  location.href = '../storage-pruning/storage-pruning.html';
});
const rangeSelect = document.querySelector('#range-select');
const tbody = document.querySelector('#dashboard-body');
const emptyMsg = document.querySelector('#empty-msg');
const entriesCount = document.querySelector('#entries-count');
const topChart = document.querySelector('#top-chart');
const topTooltip = document.querySelector('#top-tooltip');
const topChartContainer = document.querySelector('#top-chart-container');
const topNotRelevant = document.querySelector('#top-not-relevant');
const hourlyChart = document.querySelector('#hourly-chart');
const hourlyTooltip = document.querySelector('#hourly-tooltip');
const hourlyChartContainer = document.querySelector('#hourly-chart-container');
const hourlyNotRelevant = document.querySelector('#hourly-not-relevant');
const hourlySubheading = document.querySelector('#hourly-subheading');
const topSubheading = document.querySelector('#top-subheading');
const groupToggle = document.querySelector('#group-toggle');
const mergeToggle = document.querySelector('#merge-toggle');
const hideBriefToggle = document.querySelector('#hide-brief-toggle');

const hourly = createHourlyChart({
  chart: hourlyChart,
  tooltip: hourlyTooltip,
  container: hourlyChartContainer,
  subheading: hourlySubheading,
  notRelevant: hourlyNotRelevant,
  allDaysLabel: '(all days, excluding today)',
  getRangeValue: () => rangeSelect.dataset.value,
  loadAvgPerHour: (range) => analyticsRequest({
    type: 'getAvgPerClockHour', siteIds: null, range,
  }),
});

let sortCol = 'time';
let sortDir = 'desc';
let currentRows = [];
let groupMode = sessionStorage.getItem('groupMode') === 'true';
groupToggle.checked = groupMode;
let mergeMode = sessionStorage.getItem('mergeMode') !== 'false';
mergeToggle.checked = mergeMode;
let hideBrief = sessionStorage.getItem('hideBrief') !== 'false';
hideBriefToggle.checked = hideBrief;

const thName = document.querySelector('#th-name');
const thTime = document.querySelector('#th-time');
const thAudio = document.querySelector('#th-audio');
const thVisits = document.querySelector('#th-visits');

const TH_LABELS = { name: 'Site', time: 'Active time', audio: 'Audio playback', visits: 'Visits' };

const rootStyle = getComputedStyle(document.documentElement);

function updateHeaders() {
  for (const [col, th] of [['name', thName], ['time', thTime], ['audio', thAudio], ['visits', thVisits]]) {
    const isSorted = sortCol === col;
    const arrow = isSorted ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
    th.textContent = TH_LABELS[col] + arrow;
    th.classList.toggle('sorted', isSorted);
  }
}

[['name', thName], ['time', thTime], ['audio', thAudio], ['visits', thVisits]].forEach(([col, th]) => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    if (sortCol === col) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortCol = col;
      sortDir = col === 'name' ? 'asc' : 'desc';
    }
    renderTopChart();
    renderTable(sortedRows());
  });
});

function groupByEtld1(rows) {
  const groups = {};
  for (const row of rows) {
    const key = row.etld1;
    if (!groups[key]) groups[key] = {
      siteLabel: formatHostnameLabel(key),
      siteIds: [], hostnames: new Set(), etld1s: new Set([key]),
      activeMs: 0, audioMs: 0, visits: 0,
    };
    groups[key].siteIds.push(row.siteId);
    groups[key].hostnames.add(row.siteId);
    groups[key].activeMs += row.activeMs;
    groups[key].audioMs += row.audioMs;
    groups[key].visits += row.visits;
  }
  return Object.values(groups);
}

function mergeByLabel(rows) {
  const groups = {};
  for (const row of rows) {
    const key = row.siteLabel;
    if (!groups[key]) groups[key] = {
      siteLabel: key,
      siteIds: [], hostnames: new Set(), etld1s: new Set(),
      activeMs: 0, audioMs: 0, visits: 0,
    };
    groups[key].siteIds.push(...(row.siteIds ?? [row.siteId]));
    for (const h of (row.hostnames ?? [row.siteId])) groups[key].hostnames.add(h);
    for (const e of (row.etld1s ?? [row.etld1])) groups[key].etld1s.add(e);
    groups[key].activeMs += row.activeMs;
    groups[key].audioMs += row.audioMs;
    groups[key].visits += row.visits;
  }
  return Object.values(groups);
}

function getDisplayRows() {
  let rows = currentRows;
  if (groupMode) rows = groupByEtld1(rows);
  if (mergeMode) rows = mergeByLabel(rows);
  return hideBrief ? rows.filter(r => r.activeMs >= 60_000 || r.audioMs >= 60_000) : rows;
}

function sortedRows() {
  return [...getDisplayRows()].sort((a, b) => {
    let cmp;
    if (sortCol === 'name') cmp = a.siteLabel.localeCompare(b.siteLabel);
    else if (sortCol === 'time') cmp = a.activeMs - b.activeMs;
    else if (sortCol === 'audio') cmp = a.audioMs - b.audioMs;
    else cmp = a.visits - b.visits;
    return sortDir === 'desc' ? -cmp : cmp;
  });
}

function renderTable(rows) {
  tbody.innerHTML = rows.map(row => {
    const { siteLabel, activeMs, audioMs, visits } = row;
    const etld1Count = row.etld1s?.size ?? 0;
    const hostCount = row.hostnames?.size ?? 0;
    let href, subtitle;
    if (!row.etld1s) {
      href = `../site/site.html?id=${encodeURIComponent(row.siteId)}`;
      subtitle = row.siteId;
    } else if (etld1Count === 1 && hostCount === 1) {
      const only = [...row.hostnames][0];
      href = `../site/site.html?id=${encodeURIComponent(only)}`;
      subtitle = only;
    } else if (etld1Count === 1) {
      const onlyEtld1 = [...row.etld1s][0];
      href = `../site/site.html?id=${encodeURIComponent(onlyEtld1)}`;
      subtitle = `${hostCount} subdomains`;
    } else if (hostCount === etld1Count) {
      href = `../site/site.html?ids=${encodeURIComponent([...row.hostnames].join(','))}`;
      subtitle = `${etld1Count} sites`;
    } else {
      href = `../site/site.html?ids=${encodeURIComponent([...row.hostnames].join(','))}`;
      subtitle = `${etld1Count} sites · ${hostCount} subdomains`;
    }
    return `<tr class="clickable" data-href="${href}">
      <td><span class="site-label">${escapeHtml(siteLabel)}</span><span class="site-id text-meta">${escapeHtml(subtitle)}</span></td>
      <td><span class="stat-value">${formatWithSmallSub(formatMs(activeMs))}</span></td>
      <td><span class="stat-value">${formatWithSmallSub(formatMs(audioMs))}</span></td>
      <td><span class="stat-value">${visits}</span></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('tr.clickable').forEach(row => {
    row.addEventListener('click', () => { location.href = row.dataset.href; });
  });
  entriesCount.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`;
  updateHeaders();
}

let byDayCache = null;

initRangeSelect(rangeSelect, render);

groupToggle.addEventListener('change', () => {
  groupMode = groupToggle.checked;
  sessionStorage.setItem('groupMode', groupMode);
  render();
});

mergeToggle.addEventListener('change', () => {
  mergeMode = mergeToggle.checked;
  sessionStorage.setItem('mergeMode', mergeMode);
  render();
});

hideBriefToggle.addEventListener('change', () => {
  hideBrief = hideBriefToggle.checked;
  sessionStorage.setItem('hideBrief', hideBrief);
  render();
});

window.addEventListener('storage', (e) => {
  if (e.key === 'theme') render();
});

(async () => {
  if (new URLSearchParams(location.search).get('tour') === '1') {
    await maybeEnableMockMode();
  }
  await loadAndRender();
})();

window.addEventListener('pageshow', () => {
  hideBrief = sessionStorage.getItem('hideBrief') !== 'false';
  hideBriefToggle.checked = hideBrief;
  mergeMode = sessionStorage.getItem('mergeMode') !== 'false';
  mergeToggle.checked = mergeMode;
  groupMode = sessionStorage.getItem('groupMode') === 'true';
  groupToggle.checked = groupMode;
  if (currentRows.length) render();
});

async function loadAndRender() {
  if (new URL(location.href).searchParams.has('seed')) {
    history.replaceState(null, '', location.pathname);
    await seedTestData();
  }
  byDayCache = await analyticsRequest({ type: 'getAnalyticsByDay' });
  render();
  renderStorageBar();
}

document.querySelector('#seed-btn')?.addEventListener('click', async () => {
  await seedTestData();
  byDayCache = null;
  hourly.clearCache();
  await loadAndRender();
});

window.addEventListener('importcomplete', async () => {
  byDayCache = null;
  hourly.clearCache();
  await loadAndRender();
});

function dayKeys(range) {
  const keys = [];
  const now = new Date();
  if (range === 'all') return null;

  const days = range === 'today' ? 1 : parseInt(range);
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    keys.push(localDayKey(d.getTime()));
  }
  return keys;
}

const TOP_SUBHEADING = { time: '(active time)', audio: '(audio playback)', visits: '(visits)' };
const TOP_COLOR = { 
  time: rootStyle.getPropertyValue('--color-chart-time'), 
  audio: rootStyle.getPropertyValue('--color-chart-audio'), 
  visits: rootStyle.getPropertyValue('--color-chart-visits') };

function renderTopChart() {
  const col = sortCol === 'name' ? 'time' : sortCol;
  topSubheading.textContent = TOP_SUBHEADING[col];
  const getVal = col === 'audio' ? r => r.audioMs : col === 'visits' ? r => r.visits : r => r.activeMs;
  const fmt = col === 'visits' ? v => String(Math.round(v)) : formatMs;

  const top = [...getDisplayRows()].sort((a, b) => getVal(b) - getVal(a)).slice(0, 5).map(row => {
    const ids = row.siteIds ?? [row.siteId];
    const href = ids.length === 1
      ? `../site/site.html?id=${encodeURIComponent(ids[0])}`
      : `../site/site.html?ids=${encodeURIComponent(ids.join(','))}`;
    return { label: row.siteLabel, range: ids.join(', '), val: getVal(row), href };
  });
  const hrefByRange = new Map(top.map(d => [d.range, d.href]));
  drawBarChart({
    svgEl: topChart,
    tooltipEl: topTooltip,
    data: top,
    maxVal: Math.max(...top.map(d => d.val), 1),
    getValue: d => d.val,
    formatVal: fmt,
    color: TOP_COLOR[col],
    onBarClick: r => { location.href = hrefByRange.get(r); },
  });
}

function render() {
  const range = rangeSelect.dataset.value;
  const byDay = byDayCache ?? {};

  const allowed = dayKeys(range);
  const totals = {};

  for (const [day, sites] of Object.entries(byDay)) {
    if (allowed && !allowed.includes(day)) continue;
    for (const [siteId, entry] of Object.entries(sites)) {
      totals[siteId] ??= { activeMs: 0, audioMs: 0, visits: 0 };
      totals[siteId].activeMs += entry.activeMs;
      totals[siteId].audioMs += entry.audioMs ?? 0;
      totals[siteId].visits += entry.visits;
    }
  }

  currentRows = Object.entries(totals).map(([siteId, { activeMs, audioMs, visits }]) => ({
    siteId,
    siteLabel: formatHostnameLabel(siteId),
    etld1: eTLDPlus1(siteId),
    activeMs, audioMs, visits,
  }));

  if (currentRows.length === 0) {
    tbody.innerHTML = '';
    entriesCount.textContent = '';
    emptyMsg.style.display = 'block';
    topChartContainer.style.display = 'block';
    topChart.style.display = 'none';
    topSubheading.textContent = '';
    topNotRelevant.textContent = 'No data for this period.';
    topNotRelevant.style.display = 'block';
    hourly.render(range);
    return;
  }

  emptyMsg.style.display = 'none';
  topChartContainer.style.display = 'block';
  topChart.style.display = 'block';
  topNotRelevant.style.display = 'none';
  hourly.render(range);

  renderTopChart();
  renderTable(sortedRows());
}

const tourBtn = document.querySelector('#tour-btn');

const dashboardTourSteps = [
  {
    selector: '#tour-btn',
    title: 'Welcome to BiteGuard',
    body: 'This guided tour will walk you through each surface of BiteGuard.',
  },
  {
    selector: '#range-select',
    title: 'Time range',
    body: 'Choose a time range here. All charts and the table update to match.',
  },
  {
    selector: '#top-chart-container',
    title: 'Top sites',
    body: 'Your five most-active sites for the selected range.',
  },
  {
    selector: '#dashboard-table-col',
    title: 'All browsed sites',
    body: 'Every site you visited in this range, with active time, audio playback and visit counts.',
  },
  {
    selector: '#import-btn',
    title: 'Import / Export',
    body: 'Open the import/export modal to back up your data or transfer it between installs.',
    advanceOn: 'click',
  },
  {
    selector: '#io-section-bg',
    title: 'BiteGuard format',
    body: 'Export and import all your BiteGuard data — daily and hourly stats for sites and subpages.',
    modalStep: true,
    onEnter: openModal,
  },
  {
    selector: '#io-section-tt',
    title: 'Time Tracker compatibility',
    body: 'Exchange data with the Time Tracker extension. Daily site totals and visit counts are compatible; audio time and subpage data are not.',
    modalStep: true,
    onEnter: openModal,
  },
  {
    title: 'Open the popup',
    body: 'Click the BiteGuard icon in your browser toolbar to continue the tour.',
    tooltipPosition: 'top-right',
    arrow: 'up',
    handoff: { nextSurface: 'popup', mode: 'crossDocument' },
  },
  {
    selector: '#dashboard-table-col',
    title: 'See site details',
    body: 'Click any row in the table to drill into a site and see per-day detail.',
    handoff: { nextSurface: 'site', mode: 'inPage' },
  },
  {
    selector: '#prune-btn',
    title: 'Open Storage pruning',
    body: 'Click Storage pruning to see how BiteGuard manages its storage and remove low-value entries.',
    handoff: { nextSurface: 'storage-pruning', mode: 'inPage' },
  },
];

async function maybeEnableMockMode() {
  const { analyticsByDay = {} } = await chrome.storage.local.get('analyticsByDay');
  const empty = Object.keys(analyticsByDay).length === 0;
  if (empty) {
    await writeTourState({ useMockData: true });
    clearMockModeCache();
  }
}

let isTourRunning = false;
let currentTourHandle = null;

async function startDashboardTour(startIndex = 0) {
  if (isTourRunning) return;
  const tourState = await readTourState();
  if (tourState.completed && (tourState.completedVersion ?? 0) >= TOUR_VERSION) return;
  isTourRunning = true;
  if (startIndex === 0) {
    const wasMock = tourState.useMockData;
    await maybeEnableMockMode();
    const nowState = await readTourState();
    if (!wasMock && nowState.useMockData) {
      await loadAndRender();
    }
  }
  currentTourHandle = runTour({
    surface: 'dashboard',
    steps: dashboardTourSteps,
    startIndex,
    onClose: ({ skipped }) => {
      isTourRunning = false;
      currentTourHandle = null;
      clearMockModeCache();
      if (skipped) loadAndRender();
    },
  });
}

tourBtn.addEventListener('click', async () => {
  await writeTourState({ completed: false, inProgress: null });
  startDashboardTour(0);
});

async function checkResume() {
  const state = await readTourState();
  if ((state.completed && (state.completedVersion ?? 0) >= TOUR_VERSION) || state.inProgress?.surface !== 'dashboard') return;
  const wantedIndex = state.inProgress.stepIndex || 0;
  if (currentTourHandle) {
    if (currentTourHandle.getIndex() !== wantedIndex) {
      currentTourHandle.goto(wantedIndex);
    }
  } else if (!isTourRunning) {
    startDashboardTour(wantedIndex);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkResume();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.tourAdvanceRequest) checkResume();
});

(async () => {
  if (new URLSearchParams(location.search).get('tour') === '1') {
    history.replaceState(null, '', location.pathname);
    await clearTourProgress();
    startDashboardTour(0);
    return;
  }
  const state = await readTourState();
  if (state.completed && (state.completedVersion ?? 0) >= TOUR_VERSION) return;
  if (state.inProgress?.surface === 'dashboard') {
    startDashboardTour(state.inProgress.stepIndex || 0);
    return;
  }
  const pendingSurface = state.inProgress?.surface;
  if (pendingSurface) {
    const handoffIdx = dashboardTourSteps.findIndex(s => s.handoff?.nextSurface === pendingSurface);
    if (handoffIdx >= 0) startDashboardTour(handoffIdx);
  }
})();
