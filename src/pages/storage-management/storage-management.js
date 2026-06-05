import { scanSiteBucket, scanSubpageBucket, applySiteDeletions, applySubpageDeletions } from '../../data/prune.js';
import { formatMs } from '../../shared/timeUtils.js';
import { showNotification, formatBytes, escapeHtml } from '../../shared/utils.js';
import { confirmDialog } from '../../shared/confirmDialog.js';
import { MSG_INVALIDATE_SITES_CACHE } from '../../shared/msgTypes.js';
import '../../data/importData.js';

// ── Hour dropdowns (targeted deletion) ───────────────────────────────────────

function buildHourDropdown(id, initHour) {
  const wrap = document.querySelector(`#${id}`);
  wrap.dataset.direction = 'up';
  const btn = document.createElement('button');
  btn.className = 'dropdown-btn';
  btn.dataset.value = initHour;
  btn.innerHTML = `${String(initHour).padStart(2, '0')}h<span class="dropdown-arrow">▼</span>`;
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  for (let h = 0; h <= 24; h++) {
    const opt = document.createElement('button');
    opt.value = h;
    opt.textContent = String(h).padStart(2, '0') + 'h';
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
    });
  });
}

buildHourDropdown('range-from-hour', 0);
buildHourDropdown('range-to-hour', 23);
buildHourDropdown('repeat-from-hour', 9);
buildHourDropdown('repeat-to-hour', 17);

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

// ── Targeted deletion (visual stubs) ─────────────────────────────────────────

const contiguousForm = document.querySelector('#range-form-row');
const repeatForm = document.querySelector('#repeat-form');
document.querySelector('#mode-contiguous-btn').addEventListener('click', () => {
  contiguousForm.style.display = '';
  repeatForm.style.display = 'none';
  document.querySelector('#mode-contiguous-btn').classList.add('active');
  document.querySelector('#mode-repeat-btn').classList.remove('active');
});
document.querySelector('#mode-repeat-btn').addEventListener('click', () => {
  contiguousForm.style.display = 'none';
  repeatForm.style.display = '';
  document.querySelector('#mode-repeat-btn').classList.add('active');
  document.querySelector('#mode-contiguous-btn').classList.remove('active');
});

const siteInput = document.querySelector('#site-filter-input');
const deleteAllBtn = document.querySelector('#delete-all-site-btn');
function syncDeleteAllBtn() { deleteAllBtn.disabled = !siteInput.value.trim(); }
siteInput.addEventListener('input', syncDeleteAllBtn);
document.querySelector('#site-filter-clear').addEventListener('click', () => { siteInput.value = ''; syncDeleteAllBtn(); });
deleteAllBtn.addEventListener('click', async () => {
  const s = siteInput.value.trim();
  const ok = await confirmDialog({ message: `Delete all data for ${s}? This permanently removes all tracking records for ${s} across all dates. This cannot be undone.`, confirmLabel: 'Delete' });
  if (ok) showNotification(`All data for ${s} deleted.`);
});

document.querySelector('#delete-range-btn').addEventListener('click', async () => {
  const ok = await confirmDialog({ message: 'Delete records in the selected range? This cannot be undone.', confirmLabel: 'Delete' });
  if (ok) showNotification('Range deleted.');
});

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

document.querySelector('#export-btn').addEventListener('click', () => showNotification('Export downloaded.'));

// ── Remove insignificant records ──────────────────────────────────────────────

const DEFAULT_THRESHOLD_S = 30;
let pruneState = null; // { groups, stores, thresholdMs }

async function loadPruneSettings() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  document.querySelector('#threshold-input').value = settings.pruneThresholdSeconds ?? DEFAULT_THRESHOLD_S;
  syncScanBtn();
}

async function savePruneThreshold(val) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  settings.pruneThresholdSeconds = val;
  await chrome.storage.local.set({ settings });
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

// ── Init ──────────────────────────────────────────────────────────────────────

loadPruneSettings();
