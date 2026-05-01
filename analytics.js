import { formatMs } from './utils.js';
import { resolveSite } from './siteResolution.js';

const rangeSelect = document.querySelector('#range-select');
const tbody = document.querySelector('#analytics-body');
const emptyMsg = document.querySelector('#empty-msg');

let analyticsCache = null;

const savedRange = sessionStorage.getItem('analyticsRange');
if (savedRange) rangeSelect.value = savedRange;

rangeSelect.addEventListener('change', () => {
  sessionStorage.setItem('analyticsRange', rangeSelect.value);
  render();
});

loadAndRender();

async function loadAndRender() {
  const { analytics = { byDay: {} } } = await chrome.storage.local.get('analytics');
  analyticsCache = analytics;
  render();
}

document.querySelector('#seed-btn').addEventListener('click', async () => {
  const sites = [
    'youtube.com', 'github.com', 'reddit.com', 'news.ycombinator.com', 'bbc.co.uk'
  ];
  const now = new Date();
  const analytics = { byDay: {}, byHour: {} };

  for (let d = 0; d < 365 * 3; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    analytics.byDay[dayKey] = {};

    for (const siteId of sites) {
      let totalMs = 0;
      let totalVisits = 0;

      for (let h = 0; h < 24; h++) {
        const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
        analytics.byHour[hourKey] ??= {};
        const ms = Math.random() > 0.4 ? Math.floor(Math.random() * 9000000) : 0;
        const visits = ms > 0 ? Math.floor(Math.random() * 3) + 1 : 0;
        analytics.byHour[hourKey][siteId] = { ms, visits };
        totalMs += ms;
        totalVisits += visits;
      }

      analytics.byDay[dayKey][siteId] = { ms: totalMs, visits: totalVisits };
    }
  }

  await chrome.storage.local.set({ analytics });
  analyticsCache = analytics;
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
  const analytics = analyticsCache ?? { byDay: {} };

  const allowed = dayKeys(range);
  const totals = {};

  for (const [day, sites] of Object.entries(analytics.byDay)) {
    if (allowed && !allowed.includes(day)) continue;
    for (const [siteId, entry] of Object.entries(sites)) {
      totals[siteId] ??= { ms: 0, visits: 0 };
      totals[siteId].ms += entry.ms;
      totals[siteId].visits += entry.visits;
    }
  }

  const rows = Object.entries(totals).sort((a, b) => b[1].ms - a[1].ms);

  if (rows.length === 0) {
    tbody.innerHTML = '';
    emptyMsg.style.display = 'block';
    return;
  }

  emptyMsg.style.display = 'none';
  tbody.innerHTML = rows.map(([siteId, { ms, visits }]) => {
    const { siteLabel } = resolveSite(siteId);
    const href = `site.html?id=${encodeURIComponent(siteId)}`;
    return `<tr class="clickable" data-href="${href}">
      <td><span class="site-label">${siteLabel}</span><span class="site-id">${siteId}</span></td>
      <td>${formatMs(ms)}</td>
      <td>${visits}</td>
    </tr>`;
  }).join('');

  tbody.querySelectorAll('tr.clickable').forEach(row => {
    row.addEventListener('click', () => { location.href = row.dataset.href; });
  });
}
