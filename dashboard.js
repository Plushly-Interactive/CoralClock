import { formatMs, drawBarChart } from './utils.js';
import { resolveSite } from './siteResolution.js';
import { seedTestData } from './seedTestData.js';

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
const mergeToggle = document.querySelector('#merge-toggle');

const avgPerHourCache = {};

let sortCol = 'time';
let sortDir = 'desc';
let currentRows = [];
let mergeMode = sessionStorage.getItem('mergeMode') !== 'false';
mergeToggle.checked = mergeMode;

const thName = document.querySelector('#th-name');
const thTime = document.querySelector('#th-time');
const thVisits = document.querySelector('#th-visits');

const TH_LABELS = { name: 'Site', time: 'Time', visits: 'Visits' };

function updateHeaders() {
  for (const [col, th] of [['name', thName], ['time', thTime], ['visits', thVisits]]) {
    const arrow = sortCol === col ? (sortDir === 'desc' ? ' ↓' : ' ↑') : '';
    th.textContent = TH_LABELS[col] + arrow;
  }
}

[['name', thName], ['time', thTime], ['visits', thVisits]].forEach(([col, th]) => {
  th.style.cursor = 'pointer';
  th.addEventListener('click', () => {
    if (sortCol === col) {
      sortDir = sortDir === 'desc' ? 'asc' : 'desc';
    } else {
      sortCol = col;
      sortDir = col === 'name' ? 'asc' : 'desc';
    }
    renderTable(sortedRows());
  });
});

function groupRows(rows) {
  const groups = {};
  for (const row of rows) {
    const key = row.siteLabel;
    if (!groups[key]) groups[key] = { siteLabel: key, siteIds: [], activeMs: 0, visits: 0 };
    groups[key].siteIds.push(row.siteId);
    groups[key].activeMs += row.activeMs;
    groups[key].visits += row.visits;
  }
  return Object.values(groups);
}

function getDisplayRows() {
  return mergeMode ? groupRows(currentRows) : currentRows;
}

function sortedRows() {
  return [...getDisplayRows()].sort((a, b) => {
    let cmp;
    if (sortCol === 'name') cmp = a.siteLabel.localeCompare(b.siteLabel);
    else if (sortCol === 'time') cmp = a.activeMs - b.activeMs;
    else cmp = a.visits - b.visits;
    return sortDir === 'desc' ? -cmp : cmp;
  });
}

function renderTable(rows) {
  tbody.innerHTML = rows.map(row => {
    const { siteLabel, activeMs, visits } = row;
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
      <td><span class="site-label">${siteLabel}</span><span class="site-id">${subtitle}</span></td>
      <td>${formatMs(activeMs)}</td>
      <td>${visits}</td>
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
  avgPerHourCache[range] = await chrome.runtime.sendMessage({ type: 'getAvgPerClockHour', siteId: null, range });
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
    loadAvgPerHour(range).then(() => renderHourly(rangeSelect.value));
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
    color: '#0891b2',
  });
}

let byDayCache = null;

const savedRange = sessionStorage.getItem('analyticsRange');
if (savedRange) rangeSelect.value = savedRange;

rangeSelect.addEventListener('change', () => {
  sessionStorage.setItem('analyticsRange', rangeSelect.value);
  render();
});

mergeToggle.addEventListener('change', () => {
  mergeMode = mergeToggle.checked;
  sessionStorage.setItem('mergeMode', mergeMode);
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
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return keys;
}

function render() {
  const range = rangeSelect.value;
  const byDay = byDayCache ?? {};

  const allowed = dayKeys(range);
  const totals = {};

  for (const [day, sites] of Object.entries(byDay)) {
    if (allowed && !allowed.includes(day)) continue;
    for (const [siteId, entry] of Object.entries(sites)) {
      totals[siteId] ??= { activeMs: 0, visits: 0 };
      totals[siteId].activeMs += entry.activeMs;
      totals[siteId].visits += entry.visits;
    }
  }

  currentRows = Object.entries(totals).map(([siteId, { activeMs, visits }]) => {
    const { siteLabel } = resolveSite(siteId);
    return { siteId, siteLabel, activeMs, visits };
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

  const top = [...getDisplayRows()].sort((a, b) => b.activeMs - a.activeMs).slice(0, 5).map(row => ({
    label: row.siteLabel, range: row.siteIds ? row.siteIds.join(', ') : row.siteId, activeMs: row.activeMs,
  }));
  drawBarChart({
    svgEl: topChart,
    tooltipEl: topTooltip,
    data: top,
    maxVal: Math.max(...top.map(d => d.activeMs)),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: '#10b981',
  });

  renderTable(sortedRows());
}
