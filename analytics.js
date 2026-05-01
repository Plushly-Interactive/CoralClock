import { formatMs } from './utils.js';
import { resolveSite } from './siteResolution.js';

const rangeSelect = document.querySelector('#range-select');
const tbody = document.querySelector('#analytics-body');
const emptyMsg = document.querySelector('#empty-msg');

rangeSelect.addEventListener('change', render);
render();

document.querySelector('#seed-btn').addEventListener('click', async () => {
  const sites = [
    'youtube.com', 'github.com', 'reddit.com', 'news.ycombinator.com', 'bbc.co.uk'
  ];
  const now = new Date();
  const analytics = { byDay: {}, byHour: {} };

  for (let d = 0; d < 30; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    analytics.byDay[dayKey] = {};

    for (const siteId of sites) {
      const ms = Math.floor(Math.random() * 3600000);
      const visits = Math.floor(Math.random() * 10) + 1;
      analytics.byDay[dayKey][siteId] = { ms, visits };

      for (let h = 8; h < 22; h++) {
        const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
        analytics.byHour[hourKey] ??= {};
        analytics.byHour[hourKey][siteId] = {
          ms: Math.floor(ms * Math.random() * 0.3),
          visits: Math.random() > 0.6 ? 1 : 0,
        };
      }
    }
  }

  await chrome.storage.local.set({ analytics });
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

async function render() {
  const range = rangeSelect.value;
  const { analytics = { byDay: {} } } = await chrome.storage.local.get('analytics');

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
    return `<tr>
      <td><span class="site-label">${siteLabel}</span><span class="site-id">${siteId}</span></td>
      <td>${formatMs(ms)}</td>
      <td>${visits}</td>
    </tr>`;
  }).join('');
}
