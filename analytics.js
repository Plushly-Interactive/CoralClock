import { formatMs } from './utils.js';
import { resolveSite } from './siteResolution.js';

const rangeSelect = document.querySelector('#range-select');
const tbody = document.querySelector('#analytics-body');
const emptyMsg = document.querySelector('#empty-msg');

rangeSelect.addEventListener('change', render);
render();

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
