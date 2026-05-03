import { formatMs, drawBarChart } from './utils.js';
import { resolveSite } from './siteResolution.js';

const rangeSelect = document.querySelector('#range-select');
const tbody = document.querySelector('#analytics-body');
const emptyMsg = document.querySelector('#empty-msg');
const topChart = document.querySelector('#top-chart');
const topTooltip = document.querySelector('#top-tooltip');
const topChartContainer = document.querySelector('#top-chart-container');

let byDayCache = null;

const savedRange = sessionStorage.getItem('analyticsRange');
if (savedRange) rangeSelect.value = savedRange;

rangeSelect.addEventListener('change', () => {
  sessionStorage.setItem('analyticsRange', rangeSelect.value);
  render();
});

loadAndRender();

async function loadAndRender() {
  byDayCache = await chrome.runtime.sendMessage({ type: 'getAnalyticsByDay' });
  render();
}

document.querySelector('#seed-btn').addEventListener('click', async () => {
  const sites = [
    'youtube.com', 'github.com', 'reddit.com', 'news.ycombinator.com', 'bbc.co.uk'
  ];
  const now = new Date();
  const analyticsByDay = {}, analyticsByHour = {};

  for (let d = 0; d < 365 * 3; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    analyticsByDay[dayKey] = {};

    for (const siteId of sites) {
      let totalMs = 0;
      let totalVisits = 0;

      for (let h = 0; h < 24; h++) {
        const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
        analyticsByHour[hourKey] ??= {};
        const ms = Math.random() > 0.4 ? Math.floor(Math.random() * 9000000) : 0;
        const visits = ms > 0 ? Math.floor(Math.random() * 3) + 1 : 0;
        analyticsByHour[hourKey][siteId] = { activeMs: ms, visits };
        totalMs += ms;
        totalVisits += visits;
      }

      analyticsByDay[dayKey][siteId] = { activeMs: totalMs, visits: totalVisits };
    }
  }

  await chrome.storage.local.set({ analyticsByDay, analyticsByHour });
  byDayCache = analyticsByDay;
  render();
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

  const rows = Object.entries(totals).sort((a, b) => b[1].activeMs - a[1].activeMs);

  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    topChartContainer.style.display = 'none';
    return;
  }

  emptyMsg.style.display = 'none';
  topChartContainer.style.display = 'block';

  const top = rows.slice(0, 5).map(([siteId, { activeMs }]) => {
    const { siteLabel } = resolveSite(siteId);
    return { label: siteLabel, range: siteId, activeMs };
  });
  drawBarChart({
    svgEl: topChart,
    tooltipEl: topTooltip,
    data: top,
    maxVal: Math.max(...top.map(d => d.activeMs)),
    getValue: d => d.activeMs,
    formatVal: ms => formatMs(ms),
    color: '#2563eb',
  });

  tbody.innerHTML = rows.map(([siteId, { activeMs, visits }]) => {
    const { siteLabel } = resolveSite(siteId);
    const href = `site.html?id=${encodeURIComponent(siteId)}`;
    return `<tr class="clickable" data-href="${href}">
      <td><span class="site-label">${siteLabel}</span><span class="site-id">${siteId}</span></td>
      <td>${formatMs(activeMs)}</td>
      <td>${visits}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr.clickable').forEach(row => {
    row.addEventListener('click', () => { location.href = row.dataset.href; });
  });
}
