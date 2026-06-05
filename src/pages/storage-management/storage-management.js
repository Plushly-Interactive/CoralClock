import { scanSiteBucket, scanSubpageBucket, applySiteDeletions, applySubpageDeletions } from '../../data/prune.js';
import { applySiteHourlyRangeDeletion, applySiteDailyReductions, applySubpageHourlyRangeDeletion, applySubpageDailyReductions, applyDirectDailyRangeDeletion, applyDirectSubpageDailyRangeDeletion, deleteSiteAllTime, deleteSubpageSiteAllTime } from '../../data/targetedDelete.js';
import { formatMs } from '../../shared/timeUtils.js';
import { showNotification, formatBytes, escapeHtml, attachInputClear } from '../../shared/utils.js';
import { confirmDialog } from '../../shared/confirmDialog.js';
import { MSG_INVALIDATE_SITES_CACHE } from '../../shared/msgTypes.js';
import { PREF_LAST_EXPORT_AT } from '../../shared/prefKeys.js';
import { exportBiteGuardData } from '../../data/importData.js';

// ── Hour dropdowns (targeted deletion) ───────────────────────────────────────

function buildHourDropdown(id, initHour, onChange) {
  const wrap = document.querySelector(`#${id}`);
  wrap.dataset.direction = 'up';
  const btn = document.createElement('button');
  btn.className = 'dropdown-btn';
  btn.dataset.value = initHour;
  btn.innerHTML = `${String(initHour).padStart(2, '0')}:00<span class="dropdown-arrow">▼</span>`;
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  for (let h = 0; h <= 24; h++) {
    const opt = document.createElement('button');
    opt.value = h;
    opt.textContent = h === 24 ? '24:00' : String(h).padStart(2, '0') + ':00';
    menu.appendChild(opt);
  }
  wrap.append(btn, menu);
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = menu.classList.contains('open');
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
    if (!isOpen) menu.classList.add('open');
  });
  menu.querySelectorAll('button').forEach(opt => {
    opt.addEventListener('click', e => {
      e.stopPropagation();
      btn.firstChild.textContent = opt.textContent;
      btn.dataset.value = opt.value;
      menu.classList.remove('open');
      if (onChange) onChange();
    });
  });
}

buildHourDropdown('range-from-hour', 0, () => syncDeleteRangeBtn());
buildHourDropdown('range-to-hour', 24, () => syncDeleteRangeBtn());
buildHourDropdown('repeat-from-hour', 9, () => syncDeleteRangeBtn());
buildHourDropdown('repeat-to-hour', 17, () => syncDeleteRangeBtn());

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

// ── Span tooltip ──────────────────────────────────────────────────────────────

const spanChip = document.querySelector('#span-chip');
const spanTooltip = document.querySelector('#span-tooltip');
spanChip.addEventListener('mouseenter', () => { spanTooltip.style.display = 'block'; });
spanChip.addEventListener('mousemove', e => {
  spanTooltip.style.left = `${e.clientX + 12}px`;
  spanTooltip.style.top = `${e.clientY - 30}px`;
});
spanChip.addEventListener('mouseleave', () => { spanTooltip.style.display = 'none'; });

// ── Targeted deletion ─────────────────────────────────────────────────────────

const contiguousForm = document.querySelector('#range-form-row');
const repeatForm = document.querySelector('#repeat-form');
document.querySelector('#mode-contiguous-btn').addEventListener('click', () => {
  contiguousForm.style.display = '';
  repeatForm.style.display = 'none';
  document.querySelector('#mode-contiguous-btn').classList.add('active');
  document.querySelector('#mode-repeat-btn').classList.remove('active');
  syncDeleteRangeBtn();
});
document.querySelector('#mode-repeat-btn').addEventListener('click', () => {
  contiguousForm.style.display = 'none';
  repeatForm.style.display = '';
  document.querySelector('#mode-repeat-btn').classList.add('active');
  document.querySelector('#mode-contiguous-btn').classList.remove('active');
  syncDeleteRangeBtn();
});

const siteInput = document.querySelector('#site-filter-input');
const deleteAllBtn = document.querySelector('#delete-all-site-btn');

function syncDeleteAllBtn() { deleteAllBtn.disabled = !siteInput.value.trim(); }
attachInputClear(siteInput, document.querySelector('#site-filter-clear'), syncDeleteAllBtn);

function getHourValue(id) {
  return parseInt(document.querySelector(`#${id} .dropdown-btn`).dataset.value, 10);
}

function syncDeleteRangeBtn() {
  const btn = document.querySelector('#delete-range-btn');
  const isRepeat = document.querySelector('#mode-repeat-btn').classList.contains('active');
  if (isRepeat) {
    const fromDate = document.querySelector('#repeat-from-date').value;
    const toDate   = document.querySelector('#repeat-to-date').value;
    btn.disabled = !fromDate || !toDate || fromDate > toDate || getHourValue('repeat-from-hour') >= getHourValue('repeat-to-hour');
  } else {
    const fromDate = document.querySelector('#range-from-date').value;
    const toDate   = document.querySelector('#range-to-date').value;
    const fromKey  = fromDate ? `${fromDate}T${String(getHourValue('range-from-hour')).padStart(2, '0')}` : '';
    const toKey    = toDate   ? `${toDate}T${String(getHourValue('range-to-hour')).padStart(2, '0')}`     : '';
    btn.disabled = !fromDate || !toDate || fromKey >= toKey;
  }
}

document.querySelector('#range-from-date').addEventListener('input', syncDeleteRangeBtn);
document.querySelector('#range-to-date').addEventListener('input', syncDeleteRangeBtn);
document.querySelector('#repeat-from-date').addEventListener('input', syncDeleteRangeBtn);
document.querySelector('#repeat-to-date').addEventListener('input', syncDeleteRangeBtn);

deleteAllBtn.addEventListener('click', async () => {
  const siteId = siteInput.value.trim();
  const ok = await confirmDialog({
    message: `Delete all data for ${siteId}? This permanently removes all tracking records for ${siteId} across all dates. This cannot be undone.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;

  const beforeBytes = await chrome.storage.local.getBytesInUse(null);
  const data = await chrome.storage.local.get(['sitesByDay', 'sitesByHour', 'subpagesByDay', 'subpagesByHour']);
  const sitesByDay     = data.sitesByDay     ?? {};
  const sitesByHour    = data.sitesByHour    ?? {};
  const subpagesByDay  = data.subpagesByDay  ?? {};
  const subpagesByHour = data.subpagesByHour ?? {};

  deleteSiteAllTime(sitesByDay, siteId);
  deleteSiteAllTime(sitesByHour, siteId);
  deleteSubpageSiteAllTime(subpagesByDay, siteId);
  deleteSubpageSiteAllTime(subpagesByHour, siteId);

  await chrome.storage.local.set({ sitesByDay, sitesByHour, subpagesByDay, subpagesByHour });
  try { chrome.runtime.sendMessage({ type: MSG_INVALIDATE_SITES_CACHE }); } catch (_) {}

  const afterBytes = await chrome.storage.local.getBytesInUse(null);
  showNotification(`All data for ${siteId} deleted — freed ${formatBytes(Math.max(0, beforeBytes - afterBytes))}.`);
  loadStats();
});

document.querySelector('#delete-range-btn').addEventListener('click', async () => {
  const isRepeat = document.querySelector('#mode-repeat-btn').classList.contains('active');
  const siteId   = siteInput.value.trim() || null;
  const scope    = siteId ? ` for ${siteId}` : '';

  let confirmMsg, rangePairs;

  if (isRepeat) {
    const fromDate = document.querySelector('#repeat-from-date').value;
    const toDate   = document.querySelector('#repeat-to-date').value;
    const fromHour = getHourValue('repeat-from-hour');
    const toHour   = getHourValue('repeat-to-hour');
    rangePairs = buildRepeatPairs(fromDate, toDate, fromHour, toHour);
    confirmMsg = `Delete records${scope} for hours ${String(fromHour).padStart(2, '0')}:00–${String(toHour).padStart(2, '0')}:00 daily from ${fromDate} to ${toDate}? This cannot be undone.`;
  } else {
    const fromDate = document.querySelector('#range-from-date').value;
    const toDate   = document.querySelector('#range-to-date').value;
    const fromHour = getHourValue('range-from-hour');
    const toHour   = getHourValue('range-to-hour');
    const fromKey  = `${fromDate}T${String(fromHour).padStart(2, '0')}`;
    const toKey    = `${toDate}T${String(toHour).padStart(2, '0')}`;
    rangePairs = [[fromKey, toKey]];
    confirmMsg = `Delete all records${scope} from ${fromDate} ${String(fromHour).padStart(2, '0')}:00 to ${toDate} ${String(toHour).padStart(2, '0')}:00? This cannot be undone.`;
  }

  const ok = await confirmDialog({ message: confirmMsg, confirmLabel: 'Delete' });
  if (!ok) return;

  const beforeBytes = await chrome.storage.local.getBytesInUse(null);
  const data = await chrome.storage.local.get(['sitesByDay', 'sitesByHour', 'subpagesByDay', 'subpagesByHour']);
  const sitesByDay     = data.sitesByDay     ?? {};
  const sitesByHour    = data.sitesByHour    ?? {};
  const subpagesByDay  = data.subpagesByDay  ?? {};
  const subpagesByHour = data.subpagesByHour ?? {};

  const siteRed    = {};
  const subpageRed = {};
  for (const [from, to] of rangePairs) {
    mergeSiteReductions(siteRed,    applySiteHourlyRangeDeletion(sitesByHour, from, to, siteId));
    mergeSubpageReductions(subpageRed, applySubpageHourlyRangeDeletion(subpagesByHour, from, to, siteId));
    applyDirectDailyRangeDeletion(sitesByDay, from, to, siteId);
    applyDirectSubpageDailyRangeDeletion(subpagesByDay, from, to, siteId);
  }
  applySiteDailyReductions(sitesByDay, siteRed);
  applySubpageDailyReductions(subpagesByDay, subpageRed);

  await chrome.storage.local.set({ sitesByDay, sitesByHour, subpagesByDay, subpagesByHour });
  try { chrome.runtime.sendMessage({ type: MSG_INVALIDATE_SITES_CACHE }); } catch (_) {}

  const afterBytes = await chrome.storage.local.getBytesInUse(null);
  showNotification(`Range deleted — freed ${formatBytes(Math.max(0, beforeBytes - afterBytes))}.`);
  loadStats();
});

function buildRepeatPairs(fromDate, toDate, fromHour, toHour) {
  const pairs = [];
  const cur = new Date(fromDate + 'T12:00:00');
  const end = new Date(toDate + 'T12:00:00');
  while (cur <= end) {
    const d = cur.toISOString().slice(0, 10);
    pairs.push([`${d}T${String(fromHour).padStart(2, '0')}`, `${d}T${String(toHour).padStart(2, '0')}`]);
    cur.setDate(cur.getDate() + 1);
  }
  return pairs;
}

function mergeSiteReductions(target, source) {
  for (const [day, sites] of Object.entries(source)) {
    target[day] ??= {};
    for (const [sid, amounts] of Object.entries(sites)) {
      target[day][sid] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, idleMs: 0 };
      for (const f of ['activeMs', 'audioMs', 'overlapMs', 'idleMs']) target[day][sid][f] += amounts[f];
    }
  }
}

function mergeSubpageReductions(target, source) {
  for (const [day, sites] of Object.entries(source)) {
    target[day] ??= {};
    for (const [sid, paths] of Object.entries(sites)) {
      target[day][sid] ??= {};
      for (const [path, amounts] of Object.entries(paths)) {
        target[day][sid][path] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, idleMs: 0 };
        for (const f of ['activeMs', 'audioMs', 'overlapMs', 'idleMs']) target[day][sid][path][f] += amounts[f];
      }
    }
  }
}

// ── Hourly data (visual stub) ─────────────────────────────────────────────────

document.querySelector('#drop-hourly-btn').addEventListener('click', async () => {
  const days = document.querySelector('#drop-days-input').value;
  const ok = await confirmDialog({ message: `Drop all hourly data older than ${days} days? Daily aggregates are preserved. This cannot be undone.`, confirmLabel: 'Drop hourly' });
  if (ok) showNotification(`Hourly data older than ${days} days dropped — freed ~280 KB.`);
});

// ── Data health (visual stub) ─────────────────────────────────────────────────

const repairOverlay = document.querySelector('#repair-overlay');
document.querySelector('#repair-btn').addEventListener('click', () => { repairOverlay.style.display = ''; });
document.querySelector('#repair-overlay-close').addEventListener('click', () => { repairOverlay.style.display = 'none'; });
document.querySelector('#repair-overlay-cancel-btn').addEventListener('click', () => { repairOverlay.style.display = 'none'; });
document.querySelector('#repair-all-btn').addEventListener('click', () => {
  repairOverlay.style.display = 'none';
  const healthCard = document.querySelector('#health-card');
  healthCard.querySelector('.health-dot').classList.add('ok');
  healthCard.querySelector('.health-status span:last-child').innerHTML = '<strong>All checks passed</strong>';
  healthCard.querySelector('.issue-list').style.display = 'none';
  document.querySelector('#repair-btn').style.display = 'none';
  showNotification('14 issues reconciled — tracking data is now consistent.');
});

// ── Export (visual stub) ──────────────────────────────────────────────────────

document.querySelector('#export-btn').addEventListener('click', async () => {
  await exportBiteGuardData();
  await loadStats();
});

// ── Remove insignificant records ──────────────────────────────────────────────

const DEFAULT_THRESHOLD_S = 30;
let pruneState = null; // { groups, stores, thresholdMs }

async function loadPruneSettings() {
  const { pruneThresholdSeconds } = await chrome.storage.local.get('pruneThresholdSeconds');
  document.querySelector('#threshold-input').value = pruneThresholdSeconds ?? DEFAULT_THRESHOLD_S;
  syncScanBtn();
}

async function savePruneThreshold(val) {
  await chrome.storage.local.set({ pruneThresholdSeconds: val });
}

function syncScanBtn() {
  const val = document.querySelector('#threshold-input').value;
  const num = Number(val);
  const validThreshold = val !== '' && !isNaN(num) && num > 0;
  const scopeOk = document.querySelector('#insig-scope-sites').checked || document.querySelector('#insig-scope-subpages').checked;
  document.querySelector('#scan-btn').disabled = !validThreshold || !scopeOk;
}

document.querySelector('#threshold-input').addEventListener('input', async () => {
  syncScanBtn();
  const num = Number(document.querySelector('#threshold-input').value);
  if (num > 0) savePruneThreshold(num);
});
document.querySelector('#insig-scope-sites').addEventListener('change', syncScanBtn);
document.querySelector('#insig-scope-subpages').addEventListener('change', syncScanBtn);

const scanOverlay = document.querySelector('#scan-overlay');
document.querySelector('#scan-btn').addEventListener('click', runScan);
document.querySelector('#overlay-close').addEventListener('click', () => { scanOverlay.style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && scanOverlay.style.display !== 'none') scanOverlay.style.display = 'none'; });
document.querySelector('#overlay-delete-btn').addEventListener('click', deleteSelected);

async function runScan() {
  const thresholdMs = Number(document.querySelector('#threshold-input').value) * 1000;
  const scanSites = document.querySelector('#insig-scope-sites').checked;
  const scanSubpages = document.querySelector('#insig-scope-subpages').checked;

  const keys = [];
  if (scanSites) keys.push('sitesByDay', 'sitesByHour');
  if (scanSubpages) keys.push('subpagesByDay', 'subpagesByHour');

  const data = await chrome.storage.local.get(keys);
  const sitesByDay = data.sitesByDay ?? {};
  const sitesByHour = data.sitesByHour ?? {};
  const subpagesByDay = data.subpagesByDay ?? {};
  const subpagesByHour = data.subpagesByHour ?? {};

  const groups = [];

  if (scanSites) {
    const results = [
      ...scanSiteBucket(sitesByDay, thresholdMs, 'sitesByDay'),
      ...scanSiteBucket(sitesByHour, thresholdMs, 'sitesByHour'),
    ];
    groups.push({ label: 'Sites', isSubpage: false, results, sortCol: 'lastVisit', sortDir: 'desc', selectedKeys: new Set(results.map(rowKey)) });
  }

  if (scanSubpages) {
    const results = [
      ...scanSubpageBucket(subpagesByDay, thresholdMs, 'subpagesByDay'),
      ...scanSubpageBucket(subpagesByHour, thresholdMs, 'subpagesByHour'),
    ];
    groups.push({ label: 'Subpages', isSubpage: true, results, sortCol: 'lastVisit', sortDir: 'desc', selectedKeys: new Set(results.map(rowKey)) });
  }

  pruneState = { groups, stores: { sitesByDay, sitesByHour, subpagesByDay, subpagesByHour }, thresholdMs };
  renderScanResults();
  scanOverlay.style.display = '';
}

function rowKey(r) {
  return `${r.store}\n${r.siteId}\n${r.path ?? ''}`;
}

function formatLastVisit(dateKey) {
  const tIdx = dateKey.indexOf('T');
  return tIdx !== -1 ? `${dateKey.slice(0, tIdx)} ${dateKey.slice(tIdx + 1)}h` : dateKey;
}

function renderScanResults() {
  const { groups, thresholdMs } = pruneState;
  const scanSites = document.querySelector('#insig-scope-sites').checked;
  const scanSubpages = document.querySelector('#insig-scope-subpages').checked;

  const types = [];
  if (scanSites) types.push('Sites');
  if (scanSubpages) types.push('Subpages');
  document.querySelector('#overlay-params').textContent = `${thresholdMs / 1000}s · ${types.join(' + ')}`;

  const resultsEl = document.querySelector('#overlay-results');
  resultsEl.innerHTML = '';

  const hasAny = groups.some(g => g.results.length > 0);

  if (!hasAny) {
    const msg = document.createElement('p');
    msg.className = 'text-meta';
    msg.style.cssText = 'padding: 20px; text-align: center;';
    msg.textContent = 'No records below the threshold in the selected stores.';
    resultsEl.appendChild(msg);
    document.querySelector('#overlay-delete-btn').style.display = 'none';
    document.querySelector('#overlay-summary').textContent = '';
    return;
  }

  document.querySelector('#overlay-delete-btn').style.display = '';

  for (const group of groups) {
    if (group.results.length > 0) resultsEl.appendChild(buildGroupEl(group));
  }

  updateScanSummary();
}

function buildGroupEl(group) {
  const details = document.createElement('details');
  details.className = 'result-group';
  details.open = true;

  const colHeader = group.isSubpage ? 'Page' : 'Site';
  details.innerHTML = `
    <summary class="result-group-title">${group.label} (${group.results.length})</summary>
    <table class="data-table">
      <thead><tr>
        <th class="td-site" data-col="siteId" data-label="${colHeader}">${colHeader}</th>
        <th class="td-narrow" data-col="lastVisit" data-label="Last visit">Last visit</th>
        <th class="td-narrow" data-col="totalActive" data-label="Active">Active</th>
        <th class="td-narrow" data-col="totalAudio" data-label="Audio">Audio</th>
        <th class="td-narrow" data-col="recordCount" data-label="Records">Records</th>
        <th class="td-check"><label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="group-all-check"> All</label></th>
      </tr></thead>
      <tbody></tbody>
    </table>`;

  rerenderGroupBody(group, details);

  details.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.col;
      group.sortDir = group.sortCol === col && group.sortDir === 'asc' ? 'desc' : 'asc';
      group.sortCol = col;
      rerenderGroupBody(group, details);
    });
  });

  details.querySelector('.group-all-check').addEventListener('change', e => {
    if (e.target.checked) group.results.forEach(r => group.selectedKeys.add(rowKey(r)));
    else group.selectedKeys.clear();
    rerenderGroupBody(group, details);
    updateScanSummary();
  });

  return details;
}

function rerenderGroupBody(group, details) {
  const sorted = [...group.results].sort((a, b) => {
    let av = a[group.sortCol], bv = b[group.sortCol];
    if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase(); }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return group.sortDir === 'asc' ? cmp : -cmp;
  });

  details.querySelectorAll('th[data-col]').forEach(th => {
    const isSorted = th.dataset.col === group.sortCol;
    th.textContent = th.dataset.label + (isSorted ? (group.sortDir === 'desc' ? ' ↓' : ' ↑') : '');
    th.classList.toggle('sorted', isSorted);
  });

  const tbody = details.querySelector('tbody');
  tbody.innerHTML = '';
  for (const r of sorted) tbody.appendChild(buildRowEl(r, group, details));

  syncGroupAllCheck(group, details);
}

function buildRowEl(r, group, details) {
  const key = rowKey(r);
  const checked = group.selectedKeys.has(key);
  const tr = document.createElement('tr');
  if (!checked) tr.classList.add('unchecked');

  const siteCell = group.isSubpage
    ? `<td class="td-site"><span class="site-label truncate" title="${escapeHtml(r.siteId)}">${escapeHtml(r.siteId)}</span><span class="text-meta truncate" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</span></td>`
    : `<td class="td-site"><span class="truncate" title="${escapeHtml(r.siteId)}">${escapeHtml(r.siteId)}</span></td>`;

  tr.innerHTML = `${siteCell}<td>${formatLastVisit(r.lastVisit)}</td><td>${formatMs(r.totalActive)}</td><td>${formatMs(r.totalAudio)}</td><td>${r.recordCount}</td><td class="td-check"><input type="checkbox" ${checked ? 'checked' : ''}></td>`;

  tr.querySelector('input[type="checkbox"]').addEventListener('change', e => {
    if (e.target.checked) { group.selectedKeys.add(key); tr.classList.remove('unchecked'); }
    else { group.selectedKeys.delete(key); tr.classList.add('unchecked'); }
    syncGroupAllCheck(group, details);
    updateScanSummary();
  });

  return tr;
}

function syncGroupAllCheck(group, details) {
  const total = group.results.length;
  const selected = group.results.filter(r => group.selectedKeys.has(rowKey(r))).length;
  const check = details.querySelector('.group-all-check');
  check.checked = selected === total && total > 0;
  check.indeterminate = selected > 0 && selected < total;
}

function groupByStore(results) {
  const out = {};
  for (const r of results) (out[r.store] ??= []).push(r);
  return out;
}

function updateScanSummary() {
  let totalIdentities = 0;
  let totalRecords = 0;
  const totalResults = pruneState.groups.reduce((s, g) => s + g.results.length, 0);

  for (const group of pruneState.groups) {
    for (const r of group.results) {
      if (group.selectedKeys.has(rowKey(r))) {
        totalIdentities++;
        totalRecords += r.recordCount;
      }
    }
  }

  const deleteBtn = document.querySelector('#overlay-delete-btn');
  const summaryEl = document.querySelector('#overlay-summary');

  if (totalIdentities === 0) {
    summaryEl.textContent = 'Nothing selected';
    deleteBtn.disabled = true;
    return;
  }

  deleteBtn.disabled = false;
  const estimated = estimateSavedBytes();
  const bytesStr = estimated > 0 ? `, approx ${formatBytes(estimated)}` : '';
  summaryEl.textContent = `${totalIdentities} of ${totalResults} selected (${totalRecords} records${bytesStr})`;
}

function estimateSavedBytes() {
  const { groups, stores } = pruneState;
  const clones = {};
  for (const [key, store] of Object.entries(stores)) clones[key] = JSON.parse(JSON.stringify(store));

  const before = JSON.stringify(clones).length;

  for (const group of groups) {
    const selected = group.results.filter(r => group.selectedKeys.has(rowKey(r)));
    for (const [store, identities] of Object.entries(groupByStore(selected))) {
      if (group.isSubpage) applySubpageDeletions(clones[store], identities);
      else applySiteDeletions(clones[store], identities);
    }
  }

  return Math.max(0, before - JSON.stringify(clones).length);
}

async function deleteSelected() {
  const ok = await confirmDialog({
    message: 'Delete all selected insignificant records? This cannot be undone.',
    confirmLabel: 'Delete',
  });
  if (!ok) return;

  const { groups, stores } = pruneState;

  const beforeBytes = await chrome.storage.local.getBytesInUse(null);

  const updated = {};
  for (const [key, store] of Object.entries(stores)) updated[key] = JSON.parse(JSON.stringify(store));

  for (const group of groups) {
    const selected = group.results.filter(r => group.selectedKeys.has(rowKey(r)));
    for (const [store, identities] of Object.entries(groupByStore(selected))) {
      if (group.isSubpage) applySubpageDeletions(updated[store], identities);
      else applySiteDeletions(updated[store], identities);
    }
  }

  await chrome.storage.local.set(updated);
  try { chrome.runtime.sendMessage({ type: MSG_INVALIDATE_SITES_CACHE }); } catch (_) {}

  const afterBytes = await chrome.storage.local.getBytesInUse(null);

  scanOverlay.style.display = 'none';
  showNotification(`Insignificant records deleted — freed ${formatBytes(Math.max(0, beforeBytes - afterBytes))}.`);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

async function loadStats() {
  const keys = ['sitesByDay', 'sitesByHour', 'subpagesByDay', 'subpagesByHour', PREF_LAST_EXPORT_AT];
  const [data, siteDayBytes, siteHourBytes, subDayBytes, subHourBytes, totalBytes] = await Promise.all([
    chrome.storage.local.get(keys),
    chrome.storage.local.getBytesInUse('sitesByDay'),
    chrome.storage.local.getBytesInUse('sitesByHour'),
    chrome.storage.local.getBytesInUse('subpagesByDay'),
    chrome.storage.local.getBytesInUse('subpagesByHour'),
    chrome.storage.local.getBytesInUse(null),
  ]);

  const sitesByDay = data.sitesByDay ?? {};
  const sitesByHour = data.sitesByHour ?? {};
  const subpagesByDay = data.subpagesByDay ?? {};
  const subpagesByHour = data.subpagesByHour ?? {};

  const domains = new Set();
  for (const b of Object.values(sitesByDay)) for (const id of Object.keys(b)) domains.add(id);
  for (const b of Object.values(sitesByHour)) for (const id of Object.keys(b)) domains.add(id);

  const subpages = new Set();
  for (const b of Object.values(subpagesByDay))
    for (const [sid, paths] of Object.entries(b)) for (const p of Object.keys(paths)) subpages.add(`${sid}\n${p}`);
  for (const b of Object.values(subpagesByHour))
    for (const [sid, paths] of Object.entries(b)) for (const p of Object.keys(paths)) subpages.add(`${sid}\n${p}`);

  let records = 0;
  for (const b of Object.values(sitesByDay)) records += Object.keys(b).length;
  for (const b of Object.values(sitesByHour)) records += Object.keys(b).length;
  for (const b of Object.values(subpagesByDay)) for (const paths of Object.values(b)) records += Object.keys(paths).length;
  for (const b of Object.values(subpagesByHour)) for (const paths of Object.values(b)) records += Object.keys(paths).length;

  const allDays = [
    ...Object.keys(sitesByDay),
    ...Object.keys(sitesByHour).map(k => k.slice(0, 10)),
    ...Object.keys(subpagesByDay),
    ...Object.keys(subpagesByHour).map(k => k.slice(0, 10)),
  ];
  const earliest = allDays.length ? allDays.reduce((a, b) => a < b ? a : b) : null;
  const latest   = allDays.length ? allDays.reduce((a, b) => a > b ? a : b) : null;

  document.querySelector('#count-domains').textContent  = domains.size.toLocaleString();
  document.querySelector('#count-subpages').textContent = subpages.size.toLocaleString();
  document.querySelector('#count-records').textContent  = records.toLocaleString();

  if (earliest && latest) {
    document.querySelector('#span-value').textContent   = formatSpan(earliest, latest);
    document.querySelector('#span-tooltip').textContent = `${earliest} → ${latest}`;
  } else {
    document.querySelector('#span-value').textContent = '—';
    document.querySelector('#span-info').style.display = 'none';
    document.querySelector('#span-chip').style.cursor  = 'default';
  }

  const storeTotal = siteDayBytes + siteHourBytes + subDayBytes + subHourBytes;
  const pct = s => totalBytes > 0 ? `${(s / totalBytes * 100).toFixed(1)}%` : '0%';
  document.querySelector('#bar-site-day').style.width  = pct(siteDayBytes);
  document.querySelector('#bar-site-hour').style.width = pct(siteHourBytes);
  document.querySelector('#bar-sub-day').style.width   = pct(subDayBytes);
  document.querySelector('#bar-sub-hour').style.width  = pct(subHourBytes);
  document.querySelector('#store-total-text').textContent = `${formatBytes(storeTotal)} / ${formatBytes(totalBytes)}`;
  document.querySelector('#legend-site-day').textContent  = `Sites daily — ${formatBytes(siteDayBytes)}`;
  document.querySelector('#legend-site-hour').textContent = `Sites hourly — ${formatBytes(siteHourBytes)}`;
  document.querySelector('#legend-sub-day').textContent   = `Subpages daily — ${formatBytes(subDayBytes)}`;
  document.querySelector('#legend-sub-hour').textContent  = `Subpages hourly — ${formatBytes(subHourBytes)}`;
  const otherBytes = totalBytes - storeTotal;
  if (otherBytes > 0) {
    document.querySelector('#bar-other').style.width = pct(otherBytes);
    document.querySelector('#legend-other').removeAttribute('hidden');
    document.querySelector('#legend-other-text').textContent = `Cache, Rules & Other — ${formatBytes(otherBytes)}`;
  }

  const quota = chrome.storage.local.QUOTA_BYTES ?? 10485760;
  document.querySelector('#quota-bar-fill').style.width = `${Math.min(100, totalBytes / quota * 100).toFixed(1)}%`;
  document.querySelector('#quota-text').textContent = `${formatBytes(totalBytes)} / ${formatBytes(quota)}`;

  const quotaWarn = document.querySelector('#quota-warn');
  if (totalBytes > 0 && earliest && latest) {
    const daySpan = Math.max(1, Math.round((new Date(latest) - new Date(earliest)) / 86400000));
    const daysLeft = Math.round((quota - totalBytes) / (totalBytes / daySpan));
    if (daysLeft > 0) {
      quotaWarn.textContent = `At current rate: ~${daysLeft} day${daysLeft !== 1 ? 's' : ''} to cap`;
      quotaWarn.removeAttribute('hidden');
    }
  }

  const lastExportAt = data[PREF_LAST_EXPORT_AT];
  if (lastExportAt) {
    const diffDays = Math.floor((Date.now() - lastExportAt) / 86400000);
    document.querySelector('#export-age').textContent   = diffDays === 0 ? 'Today' : diffDays;
    document.querySelector('#export-label').textContent = diffDays === 0 ? '' : `day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    document.querySelector('#export-age').textContent   = 'Never';
    document.querySelector('#export-label').textContent = 'exported';
  }
}

function formatSpan(earliest, latest) {
  const days = Math.round((new Date(latest) - new Date(earliest)) / 86400000);
  if (days < 1)   return '1 day';
  if (days < 14)  return `${days} day${days !== 1 ? 's' : ''}`;
  if (days < 60)  { const w = Math.round(days / 7);  return `${w} week${w !== 1 ? 's' : ''}`; }
  if (days < 730) { const m = Math.round(days / 30.44); return `${m} month${m !== 1 ? 's' : ''}`; }
  const y = (days / 365.25).toFixed(1);
  return `${y} year${y !== '1.0' ? 's' : ''}`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

const urlParams = new URLSearchParams(location.search);
const paramSite = urlParams.get('site');
if (paramSite) {
  siteInput.value = paramSite;
  document.querySelector('#range-delete').scrollIntoView({ behavior: 'smooth' });
}
syncDeleteAllBtn();
syncDeleteRangeBtn();
loadStats();
loadPruneSettings();
