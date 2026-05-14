import { formatMs, localDayKey } from './timeUtils.js';
import { drawBarChart, formatWithSmallSub, escapeHtml } from './utils.js';
import { resolveSite } from './siteResolution.js';
import { seedTestData } from './seedTestData.js';
import { createRangeDropdown } from './rangeSelect.js';

document.querySelector('#header-center').appendChild(createRangeDropdown());
const rangeSelect = document.querySelector('#range-select');
const tbody = document.querySelector('#dashboard-body');
const emptyMsg = document.querySelector('#empty-msg');
const topChart = document.querySelector('#top-chart');
const topTooltip = document.querySelector('#top-tooltip');
const topChartContainer = document.querySelector('#top-chart-container');
const hourlyChart = document.querySelector('#hourly-chart');
const hourlyTooltip = document.querySelector('#hourly-tooltip');
const hourlyChartContainer = document.querySelector('#hourly-chart-container');
const hourlyNotRelevant = document.querySelector('#hourly-not-relevant');
const hourlySubheading = document.querySelector('#hourly-subheading');
const topSubheading = document.querySelector('#top-subheading');
const mergeToggle = document.querySelector('#merge-toggle');
const hideBriefToggle = document.querySelector('#hide-brief-toggle');

const avgPerHourCache = {};

let sortCol = 'time';
let sortDir = 'desc';
let currentRows = [];
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

function groupRows(rows) {
  const groups = {};
  for (const row of rows) {
    const key = row.siteLabel;
    if (!groups[key]) groups[key] = { siteLabel: key, siteIds: [], activeMs: 0, audioMs: 0, visits: 0 };
    groups[key].siteIds.push(row.siteId);
    groups[key].activeMs += row.activeMs;
    groups[key].audioMs += row.audioMs;
    groups[key].visits += row.visits;
  }
  return Object.values(groups);
}

function getDisplayRows() {
  const rows = mergeMode ? groupRows(currentRows) : currentRows;
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
    const ids = row.siteIds;
    const href = ids
      ? (ids.length === 1
          ? `site.html?id=${encodeURIComponent(ids[0])}`
          : `site.html?ids=${encodeURIComponent(ids.join(','))}`)
      : `site.html?id=${encodeURIComponent(row.siteId)}`;
    const subtitle = ids
      ? (ids.length === 1 ? ids[0] : `${ids.length} sites`)
      : row.siteId;
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
  updateHeaders();
}

function hourlySubheadingText(range) {
  if (range === 'all') return '(all days, excluding today)';
  return `(past ${parseInt(range)} days, excluding today)`;
}

async function loadAvgPerHour(range) {
  if (avgPerHourCache[range]) return;
  avgPerHourCache[range] = await chrome.runtime.sendMessage({ type: 'getAvgPerClockHour', siteIds: null, range });
}

function renderHourly(range) {
  hourlyChartContainer.style.display = 'block';

  if (range === 'today') {
    hourlyChart.style.display = 'none';
    hourlySubheading.textContent = '';
    hourlyNotRelevant.style.display = 'block';
    return;
  }
  hourlyNotRelevant.style.display = 'none';
  hourlyChart.style.display = 'block';
  hourlySubheading.textContent = hourlySubheadingText(range);

  if (!avgPerHourCache[range]) {
    loadAvgPerHour(range).then(() => renderHourly(rangeSelect.dataset.value));
    return;
  }

  const data = avgPerHourCache[range].map((avgMs, h) => {
    const hStr = String(h).padStart(2, '0');
    const hNext = String(h + 1).padStart(2, '0');
    return { label: `${hStr}:00`, range: `${hStr}:00 - ${hNext}:00`, activeMs: avgMs };
  });

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

let byDayCache = null;

const opts = { today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days', '180': 'Last 6 months', '365': 'Last year', all: 'All time' };
const savedRange = sessionStorage.getItem('analyticsRange') || '7';
rangeSelect.dataset.value = savedRange;
rangeSelect.firstChild.textContent = opts[savedRange];

rangeSelect.parentElement.querySelector('.dropdown-menu').querySelectorAll('button').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    rangeSelect.dataset.value = btn.value;
    rangeSelect.firstChild.textContent = btn.textContent;
    rangeSelect.parentElement.querySelector('.dropdown-menu').classList.remove('open');
    sessionStorage.setItem('analyticsRange', btn.value);
    render();
  });
});

rangeSelect.addEventListener('click', (e) => {
  e.stopPropagation();
  const menu = rangeSelect.parentElement.querySelector('.dropdown-menu');
  const isOpen = menu.classList.contains('open');
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
  if (!isOpen) menu.classList.add('open');
});

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
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

loadAndRender();

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

async function renderStorageBar() {
  const used = await chrome.storage.local.getBytesInUse(null);
  const quota = chrome.storage.local.QUOTA_BYTES;
  document.querySelector('#storage-bar-fill').style.width = `${(used / quota) * 100}%`;
  document.querySelector('#storage-bar-label').textContent = `${formatBytes(used)} / ${formatBytes(quota)}`;
}

async function loadAndRender() {
  if (new URL(location.href).searchParams.has('seed')) {
    history.replaceState(null, '', location.pathname);
    await seedTestData();
  }
  byDayCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByDay' });
  render();
  renderStorageBar();
}

document.querySelector('#seed-btn')?.addEventListener('click', async () => {
  await seedTestData();
  byDayCache = null;
  Object.keys(avgPerHourCache).forEach(k => delete avgPerHourCache[k]);
  await loadAndRender();
});

window.addEventListener('importcomplete', async () => {
  byDayCache = null;
  Object.keys(avgPerHourCache).forEach(k => delete avgPerHourCache[k]);
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
      ? `site.html?id=${encodeURIComponent(ids[0])}`
      : `site.html?ids=${encodeURIComponent(ids.join(','))}`;
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

  currentRows = Object.entries(totals).map(([siteId, { activeMs, audioMs, visits }]) => {
    const { siteLabel } = resolveSite(siteId);
    return { siteId, siteLabel, activeMs, audioMs, visits };
  });

  if (currentRows.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    topChartContainer.style.display = 'none';
    hourlyChartContainer.style.display = 'none';
    return;
  }

  emptyMsg.style.display = 'none';
  topChartContainer.style.display = 'block';
  renderHourly(range);

  renderTopChart();
  renderTable(sortedRows());
}
