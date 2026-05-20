import { formatHostnameLabel } from '../../shared/labels.js';
import { escapeHtml, showNotification, formatBytes, renderStorageBar } from '../../shared/utils.js';
import { formatMs } from '../../shared/timeUtils.js';
import {
  scanSiteBucket, scanSubpageBucket,
  applySiteDeletions, applySubpageDeletions,
} from '../../data/prune.js';
import { ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY } from '../../background/siteTracking.js';
import { autoStartIfMatches } from '../../shared/tour.js';
import { SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY } from '../../background/subpageTracking.js';

const STORE_LABELS = {
  [ANALYTICS_DAY_KEY]: 'Domains — daily',
  [ANALYTICS_HOUR_KEY]: 'Domains — hourly',
  [SUBPAGES_DAY_KEY]: 'Subpages — daily',
  [SUBPAGES_HOUR_KEY]: 'Subpages — hourly',
};
const STORE_ORDER = [ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY];

const thresholdInput = document.querySelector('#threshold-input');
const scopeSiteDaily = document.querySelector('#scope-site-daily');
const scopeSiteHourly = document.querySelector('#scope-site-hourly');
const scopeSubpageDaily = document.querySelector('#scope-subpage-daily');
const scopeSubpageHourly = document.querySelector('#scope-subpage-hourly');
const scopeChecks = [scopeSiteDaily, scopeSiteHourly, scopeSubpageDaily, scopeSubpageHourly];
const scanBtn = document.querySelector('#scan-btn');
const resultsSection = document.querySelector('#results-section');
const resultsList = document.querySelector('#results-list');
const resultsSummary = document.querySelector('#results-summary');
const deleteBtn = document.querySelector('#delete-btn');
const deleteRow = document.querySelector('#delete-row');
const emptyMsg = document.querySelector('#empty-msg');

let currentResults = [];
let scannedStores = {};
const sortState = {};
for (const store of STORE_ORDER) sortState[store] = { col: 'site', dir: 'asc' };

init();

async function init() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  const saved = Number(settings.pruneThresholdSeconds);
  thresholdInput.value = Number.isFinite(saved) && saved > 0 ? saved : 30;
  updateScanEnabled();
  renderStorageBar();
}

thresholdInput.addEventListener('input', () => {
  updateScanEnabled();
  persistThreshold();
});
for (const cb of scopeChecks) cb.addEventListener('change', updateScanEnabled);
scanBtn.addEventListener('click', runScan);
deleteBtn.addEventListener('click', runDelete);

function getScopes() {
  return {
    siteDaily: scopeSiteDaily.checked,
    siteHourly: scopeSiteHourly.checked,
    subpageDaily: scopeSubpageDaily.checked,
    subpageHourly: scopeSubpageHourly.checked,
  };
}

function getThresholdSeconds() {
  const v = Number(thresholdInput.value);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function updateScanEnabled() {
  const validThreshold = getThresholdSeconds() !== null;
  const anyScope = scopeChecks.some(c => c.checked);
  scanBtn.disabled = !(validThreshold && anyScope);
}

async function persistThreshold() {
  const v = getThresholdSeconds();
  if (v === null) return;
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings.pruneThresholdSeconds = v;
  await chrome.storage.local.set({ settings });
}

async function runScan() {
  const thresholdMs = getThresholdSeconds() * 1000;
  const scopes = getScopes();
  scanBtn.disabled = true;
  const keys = [];
  if (scopes.siteDaily) keys.push(ANALYTICS_DAY_KEY);
  if (scopes.siteHourly) keys.push(ANALYTICS_HOUR_KEY);
  if (scopes.subpageDaily) keys.push(SUBPAGES_DAY_KEY);
  if (scopes.subpageHourly) keys.push(SUBPAGES_HOUR_KEY);
  const stores = await chrome.storage.local.get(keys);
  scannedStores = stores;
  const results = [];
  if (scopes.siteDaily) results.push(...scanSiteBucket(stores[ANALYTICS_DAY_KEY] ?? {}, thresholdMs, ANALYTICS_DAY_KEY));
  if (scopes.siteHourly) results.push(...scanSiteBucket(stores[ANALYTICS_HOUR_KEY] ?? {}, thresholdMs, ANALYTICS_HOUR_KEY));
  if (scopes.subpageDaily) results.push(...scanSubpageBucket(stores[SUBPAGES_DAY_KEY] ?? {}, thresholdMs, SUBPAGES_DAY_KEY));
  if (scopes.subpageHourly) results.push(...scanSubpageBucket(stores[SUBPAGES_HOUR_KEY] ?? {}, thresholdMs, SUBPAGES_HOUR_KEY));
  currentResults = results.map((r, i) => ({ ...r, _id: i, _selected: true }));
  renderResults();
  updateScanEnabled();
}

function renderResults() {
  resultsSection.removeAttribute('hidden');
  if (currentResults.length === 0) {
    resultsList.innerHTML = '';
    emptyMsg.style.display = 'block';
    deleteRow.style.display = 'none';
    deleteBtn.disabled = true;
    resultsSummary.textContent = '';
    return;
  }
  emptyMsg.style.display = 'none';
  deleteRow.removeAttribute('hidden');
  deleteRow.style.display = '';

  const grouped = {};
  for (const r of currentResults) {
    grouped[r.store] ??= [];
    grouped[r.store].push(r);
  }

  const parts = [];
  for (const store of STORE_ORDER) {
    const rows = grouped[store];
    if (!rows?.length) continue;
    parts.push(`<details class="result-group" open data-store="${store}">`);
    parts.push(`<summary class="result-group-title">${STORE_LABELS[store]} (${rows.length})</summary>`);
    parts.push(`<table class="data-table"><thead><tr>
      ${headerCellsHtml(store)}
    </tr></thead><tbody>${rowsHtml(sortRows(rows, sortState[store]), store)}</tbody></table></details>`);
  }
  resultsList.innerHTML = parts.join('');

  for (const cb of resultsList.querySelectorAll('tbody input[type="checkbox"]')) {
    cb.addEventListener('change', onRowToggle);
  }
  for (const th of resultsList.querySelectorAll('th[data-col]')) {
    th.addEventListener('click', onHeaderClick);
  }
  for (const cb of resultsList.querySelectorAll('.group-select')) {
    cb.addEventListener('change', onGroupSelect);
  }
  updateGroupCheckboxes();
  updateSummary();
}

function headerCellsHtml(store) {
  const s = sortState[store];
  const arrow = (col) => s.col === col ? (s.dir === 'desc' ? ' ↓' : ' ↑') : '';
  const sortedCls = (col) => s.col === col ? 'sorted' : '';
  return `<th class="th-site ${sortedCls('site')}" data-col="site">Site${arrow('site')}</th>
      <th class="th-last ${sortedCls('last')}" data-col="last">Last visit${arrow('last')}</th>
      <th class="th-time ${sortedCls('time')}" data-col="time">Total active${arrow('time')}</th>
      <th class="th-time ${sortedCls('audio')}" data-col="audio">Total audio${arrow('audio')}</th>
      <th class="th-records ${sortedCls('records')}" data-col="records">Records${arrow('records')}</th>
      <th class="th-select"><label class="group-select-label"><input type="checkbox" class="group-select"> Selected</label></th>`;
}

function rowsHtml(rows, store) {
  const isSubpage = store === SUBPAGES_DAY_KEY || store === SUBPAGES_HOUR_KEY;
  return rows.map(r => {
    const siteLabel = formatHostnameLabel(r.siteId ?? '');
    const topText = isSubpage ? (r.siteId ?? '') : siteLabel;
    const subtitleText = isSubpage ? (r.path ?? '') : (r.siteId ?? '');
    const titleAttr = isSubpage ? ` title="${escapeHtml(r.path ?? '')}"` : '';
    const { day, hour } = splitDateKey(r.lastVisit);
    return `<tr data-id="${r._id}" class="${r._selected ? '' : 'unchecked'}">
      <td class="td-site"${titleAttr}><span class="site-label truncate">${escapeHtml(topText)}</span><span class="site-id text-meta truncate">${escapeHtml(subtitleText)}</span></td>
      <td><span class="site-label">${escapeHtml(day)}</span>${hour ? `<span class="site-id text-meta">${escapeHtml(hour)}</span>` : ''}</td>
      <td><span class="stat-value">${formatMs(r.totalActive)}</span></td>
      <td><span class="stat-value">${formatMs(r.totalAudio)}</span></td>
      <td><span class="stat-value">${r.recordCount}</span></td>
      <td class="td-select"><input type="checkbox" data-id="${r._id}" ${r._selected ? 'checked' : ''}></td>
    </tr>`;
  }).join('');
}

function splitDateKey(key) {
  if (key.length === 10) return { day: key, hour: null };
  const h = Number(key.slice(11));
  const start = String(h).padStart(2, '0');
  const next = String((h + 1) % 24).padStart(2, '0');
  return { day: key.slice(0, 10), hour: `${start}:00 – ${next}:00` };
}

function sortRows(rows, { col, dir }) {
  const copy = [...rows];
  copy.sort((a, b) => {
    let cmp;
    if (col === 'time') {
      cmp = a.totalActive - b.totalActive;
    } else if (col === 'audio') {
      cmp = a.totalAudio - b.totalAudio;
    } else if (col === 'records') {
      cmp = a.recordCount - b.recordCount;
    } else if (col === 'last') {
      cmp = a.lastVisit.localeCompare(b.lastVisit);
    } else {
      const aLabel = formatHostnameLabel(a.siteId ?? '');
      const bLabel = formatHostnameLabel(b.siteId ?? '');
      cmp = aLabel.localeCompare(bLabel);
      if (cmp === 0 && a.path && b.path) cmp = a.path.localeCompare(b.path);
    }
    return dir === 'desc' ? -cmp : cmp;
  });
  return copy;
}

function onHeaderClick(e) {
  const th = e.currentTarget;
  const col = th.dataset.col;
  const details = th.closest('details');
  const store = details.dataset.store;
  const s = sortState[store];
  if (s.col === col) s.dir = s.dir === 'desc' ? 'asc' : 'desc';
  else { s.col = col; s.dir = 'asc'; }
  rerenderGroup(details, store);
}

function onGroupSelect(e) {
  const details = e.target.closest('details');
  const store = details.dataset.store;
  const checked = e.target.checked;
  for (const r of currentResults) {
    if (r.store === store) r._selected = checked;
  }
  const tbody = details.querySelector('tbody');
  for (const tr of tbody.querySelectorAll('tr')) {
    tr.classList.toggle('unchecked', !checked);
    const cb = tr.querySelector('td.td-select input');
    if (cb) cb.checked = checked;
  }
  updateGroupCheckboxes();
  updateSummary();
}

function rerenderGroup(details, store) {
  const rows = currentResults.filter(r => r.store === store);
  const headerRow = details.querySelector('thead tr');
  const tbody = details.querySelector('tbody');
  headerRow.innerHTML = headerCellsHtml(store);
  tbody.innerHTML = rowsHtml(sortRows(rows, sortState[store]), store);
  for (const cb of tbody.querySelectorAll('input[type="checkbox"]')) {
    cb.addEventListener('change', onRowToggle);
  }
  for (const th of headerRow.querySelectorAll('th[data-col]')) {
    th.addEventListener('click', onHeaderClick);
  }
  const groupCb = headerRow.querySelector('.group-select');
  if (groupCb) groupCb.addEventListener('change', onGroupSelect);
  updateGroupCheckboxes();
}

function updateGroupCheckboxes() {
  for (const details of resultsList.querySelectorAll('details[data-store]')) {
    const store = details.dataset.store;
    const rows = currentResults.filter(r => r.store === store);
    const selected = rows.filter(r => r._selected).length;
    const cb = details.querySelector('.group-select');
    if (!cb) continue;
    if (selected === 0) { cb.checked = false; cb.indeterminate = false; }
    else if (selected === rows.length) { cb.checked = true; cb.indeterminate = false; }
    else { cb.checked = false; cb.indeterminate = true; }
  }
}

function onRowToggle(e) {
  const id = Number(e.target.dataset.id);
  const item = currentResults.find(r => r._id === id);
  if (!item) return;
  item._selected = e.target.checked;
  const tr = resultsList.querySelector(`tr[data-id="${id}"]`);
  if (tr) tr.classList.toggle('unchecked', !item._selected);
  updateGroupCheckboxes();
  updateSummary();
}

function simulatedPruneBytes(selected) {
  const byStore = {
    [ANALYTICS_DAY_KEY]: [], [ANALYTICS_HOUR_KEY]: [],
    [SUBPAGES_DAY_KEY]: [], [SUBPAGES_HOUR_KEY]: [],
  };
  for (const id of selected) byStore[id.store]?.push(id);
  let saved = 0;
  for (const key of Object.keys(byStore)) {
    if (byStore[key].length === 0) continue;
    const original = scannedStores[key];
    if (!original) continue;
    const before = JSON.stringify(original).length;
    const clone = structuredClone(original);
    const apply = (key === SUBPAGES_DAY_KEY || key === SUBPAGES_HOUR_KEY)
      ? applySubpageDeletions
      : applySiteDeletions;
    apply(clone, byStore[key]);
    const after = JSON.stringify(clone).length;
    saved += before - after;
  }
  return saved;
}

function updateSummary() {
  const selected = currentResults.filter(r => r._selected);
  const records = selected.reduce((sum, r) => sum + r.recordCount, 0);
  const bytes = selected.length === 0 ? 0 : simulatedPruneBytes(selected);
  resultsSummary.textContent = `${selected.length} of ${currentResults.length} selected (${records} record${records === 1 ? '' : 's'}, approx ${formatBytes(bytes)})`;
  deleteBtn.disabled = selected.length === 0;
}

async function runDelete() {
  const identities = currentResults.filter(r => r._selected);
  if (identities.length === 0) return;
  deleteBtn.disabled = true;
  const byStore = {
    [ANALYTICS_DAY_KEY]: [], [ANALYTICS_HOUR_KEY]: [],
    [SUBPAGES_DAY_KEY]: [], [SUBPAGES_HOUR_KEY]: [],
  };
  let totalRecords = 0;
  for (const id of identities) {
    byStore[id.store]?.push(id);
    totalRecords += id.recordCount;
  }
  const touched = Object.keys(byStore).filter(k => byStore[k].length > 0);
  const bytesBefore = await chrome.storage.local.getBytesInUse(touched);
  const stores = await chrome.storage.local.get(touched);
  const writeback = {};
  if (byStore[ANALYTICS_DAY_KEY].length) writeback[ANALYTICS_DAY_KEY] = applySiteDeletions(stores[ANALYTICS_DAY_KEY] ?? {}, byStore[ANALYTICS_DAY_KEY]);
  if (byStore[ANALYTICS_HOUR_KEY].length) writeback[ANALYTICS_HOUR_KEY] = applySiteDeletions(stores[ANALYTICS_HOUR_KEY] ?? {}, byStore[ANALYTICS_HOUR_KEY]);
  if (byStore[SUBPAGES_DAY_KEY].length) writeback[SUBPAGES_DAY_KEY] = applySubpageDeletions(stores[SUBPAGES_DAY_KEY] ?? {}, byStore[SUBPAGES_DAY_KEY]);
  if (byStore[SUBPAGES_HOUR_KEY].length) writeback[SUBPAGES_HOUR_KEY] = applySubpageDeletions(stores[SUBPAGES_HOUR_KEY] ?? {}, byStore[SUBPAGES_HOUR_KEY]);
  await chrome.storage.local.set(writeback);
  const bytesAfter = await chrome.storage.local.getBytesInUse(touched);
  await chrome.runtime.sendMessage({ type: 'invalidateAnalyticsCache' });
  showNotification(`Deleted ${totalRecords} record${totalRecords === 1 ? '' : 's'} — freed ${formatBytes(bytesBefore - bytesAfter)}.`);
  await runScan();
  await renderStorageBar();
}

const pruningTourSteps = [
  {
    selector: '#intro',
    title: 'Storage pruning',
    body: 'This tool finds low-value tracking entries — short visits and accidental clicks — so you can remove them and keep BiteGuard\'s storage tidy.',
  },
  {
    selector: '#controls',
    title: 'Configure the scan',
    body: 'Set a threshold (in seconds) and choose which stores to scan. Domains and subpages are tracked separately, daily and hourly.',
  },
  {
    selector: '#scan-btn',
    title: 'Run the scan',
    body: 'Click Scan to find entries below your threshold. They appear below for review.',
    advanceOn: 'click',
  },
  {
    selector: '#results-section',
    title: 'Review and delete',
    body: 'Insignificant entries appear here. Select the ones you want to remove and click Delete selected.',
  },
  {
    selector: '#back-btn',
    title: "That's the end",
    body: 'You\'ve seen every surface of BiteGuard. You can replay this tour any time from the dashboard.',
  },
];

autoStartIfMatches('storage-pruning', pruningTourSteps, {
  onClose: ({ skipped }) => {
    if (!skipped) location.href = '../dashboard/dashboard.html';
  },
});

