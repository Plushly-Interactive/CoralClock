import { formatMs, localDayKey, DEFAULT_CLOCK_FORMAT } from '../../shared/timeUtils.js';
import { drawBarChart, formatWithSmallSub, escapeHtml, formatBytes, navButton, faviconUrl, loadFaviconCache, attachInputClear } from '../../shared/utils.js';
import { eTLDPlus1 } from '../../background/siteResolution.js';
import { formatHostnameLabel } from '../../shared/labels.js';
import { createRangeDropdown, initRangeSelect } from '../../shared/rangeSelect.js';
import { createHourlyChart } from '../../shared/hourlyChart.js';
import { getSitesByDay, getAvgPerClockHour } from '../../data/intervalAggregates.js';
import { count } from '../../data/intervalLog.js';
import { PREF_CLOCK_FORMAT, PREF_HIDE_BRIEF } from '../../shared/prefKeys.js';

// Clone of the dashboard that renders the interval log instead of the scalar
// aggregates. Render logic is duplicated from dashboard.js by design (isolated,
// ditchable); only the two data sources differ — getSitesByDay /
// getAvgPerClockHour from intervalAggregates. `visits` here = non-contiguous
// presence intervals per domain (no audio visits). Row links open the real site
// page (scalar data) — a known limitation, since there is no interval-data site
// page.
const PREF_MERGE_MODE = 'mergeMode';
const PREF_GROUP_MODE = 'groupMode';
const PREF_SEARCH = 'siteSearch';

document.querySelector('#header-center').appendChild(createRangeDropdown());
navButton(document.querySelector('#timeline-btn'), '../interval-timeline/interval-timeline.html');
navButton(document.querySelector('#rules-btn'), '../rules/rules.html');
navButton(document.querySelector('#prune-btn'), '../storage-management/storage-management.html');
navButton(document.querySelector('#settings-btn'), '../settings/settings.html');
const rangeSelect = document.querySelector('#range-select');
const dashboardTable = document.querySelector('#dashboard-table');
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
const siteSearchInput = document.querySelector('#site-search');
const siteSearchClearBtn = document.querySelector('#site-search-clear');

await loadFaviconCache();
const clockFormatStored = await chrome.storage.local.get(PREF_CLOCK_FORMAT);
const clockFormat = clockFormatStored[PREF_CLOCK_FORMAT] ?? DEFAULT_CLOCK_FORMAT;

const hourly = createHourlyChart({
  chart: hourlyChart,
  tooltip: hourlyTooltip,
  container: hourlyChartContainer,
  subheading: hourlySubheading,
  notRelevant: hourlyNotRelevant,
  allDaysLabel: '(all days, excluding today)',
  getRangeValue: () => rangeSelect.dataset.value,
  loadAvgPerHour: (range) => getAvgPerClockHour(range),
  clockFormat,
});

let sortCol = 'time';
let sortDir = 'desc';
let currentRows = [];
let groupMode = sessionStorage.getItem(PREF_GROUP_MODE) === 'true';
groupToggle.checked = groupMode;
let mergeMode = sessionStorage.getItem(PREF_MERGE_MODE) !== 'false';
mergeToggle.checked = mergeMode;
let hideBrief = sessionStorage.getItem(PREF_HIDE_BRIEF) !== 'false';
hideBriefToggle.checked = hideBrief;
let searchQuery = sessionStorage.getItem(PREF_SEARCH) ?? '';
siteSearchInput.value = searchQuery;

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
    renderTable(filteredRows());
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

function filteredRows() {
  const q = searchQuery.toLowerCase().trim();
  if (!q) return sortedRows();
  return sortedRows().filter(row => {
    if (row.siteLabel.toLowerCase().includes(q)) return true;
    if (row.siteId && row.siteId.toLowerCase().includes(q)) return true;
    if (row.hostnames) {
      for (const h of row.hostnames) {
        if (h.toLowerCase().includes(q)) return true;
      }
    }
    return false;
  });
}

function renderTable(rows) {
  if (rows.length === 0) {
    tbody.innerHTML = '';
    entriesCount.textContent = '';
    emptyMsg.textContent = searchQuery.trim() ? 'No sites match your search.' : 'No data for this period.';
    dashboardTable.style.display = 'none';
    emptyMsg.style.display = 'flex';
    return;
  }
  dashboardTable.style.display = '';
  emptyMsg.style.display = 'none';
  tbody.innerHTML = rows.map(row => {
    const { siteLabel, activeMs, audioMs, visits } = row;
    const etld1Count = row.etld1s?.size ?? 0;
    const hostCount = row.hostnames?.size ?? 0;
    const faviconHost = row.etld1s ? [...row.hostnames][0] : row.siteId;
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
      <td><div class="site-cell-content"><img class="site-favicon" src="${faviconUrl(faviconHost)}" alt=""><div class="site-text"><span class="site-label">${escapeHtml(siteLabel)}</span><span class="site-id text-meta">${escapeHtml(subtitle)}</span></div></div></td>
      <td><span class="stat-value">${formatWithSmallSub(formatMs(activeMs))}</span></td>
      <td><span class="stat-value">${formatWithSmallSub(formatMs(audioMs))}</span></td>
      <td><span class="stat-value">${visits}</span></td>
    </tr>`;
  }).join('');
  tbody.querySelectorAll('.site-favicon').forEach(img => {
    img.addEventListener('error', () => { img.style.display = 'none'; });
  });
  tbody.querySelectorAll('tr.clickable').forEach(row => {
    navButton(row, row.dataset.href);
  });
  entriesCount.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}`;
  updateHeaders();
}

let byDayCache = null;

initRangeSelect(rangeSelect, render);

groupToggle.addEventListener('change', () => {
  groupMode = groupToggle.checked;
  sessionStorage.setItem(PREF_GROUP_MODE, groupMode);
  render();
});

mergeToggle.addEventListener('change', () => {
  mergeMode = mergeToggle.checked;
  sessionStorage.setItem(PREF_MERGE_MODE, mergeMode);
  render();
});

hideBriefToggle.addEventListener('change', () => {
  hideBrief = hideBriefToggle.checked;
  sessionStorage.setItem(PREF_HIDE_BRIEF, hideBrief);
  render();
});

function applySearch() {
  searchQuery = siteSearchInput.value;
  sessionStorage.setItem(PREF_SEARCH, searchQuery);
  renderTable(filteredRows());
}
const syncSearchClear = attachInputClear(siteSearchInput, siteSearchClearBtn, applySearch);
syncSearchClear();

window.addEventListener('storage', (e) => {
  if (e.key === 'theme') render();
});

window.addEventListener('pageshow', () => {
  hideBrief = sessionStorage.getItem(PREF_HIDE_BRIEF) !== 'false';
  hideBriefToggle.checked = hideBrief;
  mergeMode = sessionStorage.getItem(PREF_MERGE_MODE) !== 'false';
  mergeToggle.checked = mergeMode;
  groupMode = sessionStorage.getItem(PREF_GROUP_MODE) === 'true';
  groupToggle.checked = groupMode;
  searchQuery = sessionStorage.getItem(PREF_SEARCH) ?? '';
  siteSearchInput.value = searchQuery;
  syncSearchClear();
  if (currentRows.length) render();
});

async function loadAndRender() {
  byDayCache = await getSitesByDay();
  render();
  showIntervalSize();
}

// Footprint comparison in the header: interval DB vs the regular (scalar)
// tracking data. Interval size = navigator.storage.estimate() (origin IndexedDB
// usage — the interval DB dominates it). Scalar size = bytes of the scalar
// tracking keys in chrome.storage.local. Different measurement bases, so both
// are approximate, but enough to compare orders of magnitude.
const SCALAR_KEYS = ['sitesByDay', 'sitesByHour', 'wallClockByHour', 'subpagesByDay', 'subpagesByHour'];

async function showIntervalSize() {
  const el = document.querySelector('#storage-bar-label');
  const n = await count().catch(() => 0);
  let txt = `interval: ${n.toLocaleString()} rows`;
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate().catch(() => null);
    if (est?.usage != null) txt += ` (~${formatBytes(est.usage)})`;
  }
  const scalarBytes = await chrome.storage.local.getBytesInUse(SCALAR_KEYS).catch(() => null);
  if (scalarBytes != null) txt += ` · regular: ~${formatBytes(scalarBytes)}`;
  el.textContent = txt;
}

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
    return { label: row.siteLabel, range: ids.join(', '), val: getVal(row), href, faviconDataUrl: faviconUrl(ids[0]) };
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
    dashboardTable.style.display = 'none';
    emptyMsg.textContent = 'No data for this period.';
    emptyMsg.style.display = 'flex';
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
  renderTable(filteredRows());
}

// Last: all consts (TOP_SUBHEADING/TOP_COLOR) and fns are now initialized.
await loadAndRender();
