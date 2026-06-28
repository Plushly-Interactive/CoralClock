import { formatBytes, showNotification, attachInputClear, escapeHtml, navButton } from '../../shared/utils.js';
import { localDayKey, formatSpan, formatMs, formatHourLabel, DEFAULT_CLOCK_FORMAT } from '../../shared/timeUtils.js';
import { intervalStats, appendIntervals, allIntervals, deleteByIds, deleteByDomain, deleteRange, dropPathsBefore } from '../../data/intervalLog.js';
import { invalidate, getSitesByDay, getSubpagesByDay, getSitesByHour, getSubpagesByHour } from '../../data/intervalAggregates.js';
import { confirmDialog } from '../../shared/confirmDialog.js';
import { downloadBiteGuardExport } from '../../data/exportPayload.js';
import { parseTtStats, applyTtImport, downloadTt, TT_VERSION } from '../../data/ttImport.js';
import { downloadDailyCsv, downloadHourlyCsv, downloadIntervalsCsv } from '../../data/csvExport.js';
import { SITES_DAY_KEY } from '../../background/siteTracking.js';
import { PREF_LAST_EXPORT_AT, PREF_CLOCK_FORMAT } from '../../shared/prefKeys.js';
import { autoStartIfMatches } from '../../shared/tour.js';

const spanChip = document.querySelector('#span-chip');
const spanTooltip = document.querySelector('#span-tooltip');
spanChip.addEventListener('mouseenter', () => { spanTooltip.style.display = 'block'; });
spanChip.addEventListener('mousemove', e => {
  spanTooltip.style.left = `${e.clientX + 12}px`;
  spanTooltip.style.top = `${e.clientY - 30}px`;
});
spanChip.addEventListener('mouseleave', () => { spanTooltip.style.display = 'none'; });

async function exportAll() {
  await downloadBiteGuardExport();
  await loadStats();
}
document.querySelector('#export-btn').addEventListener('click', exportAll);
// Frozen legacy buckets have their own management page; surface it only when such
// data exists (renderQuota reveals the button). New interval-only profiles never
// see it.
navButton(document.querySelector('#legacy-storage-btn'), '../legacy-storage-management/legacy-storage-management.html');

// Import/Export modal (BiteGuard format). Export writes a complete backup. Import
// merges the file's interval rows; a conflict is a TEMPORAL overlap between an
// imported row and an existing one (measured between the two sources — active/audio
// rows overlap within a source by design). On overlap the user resolves keep/replace.
// Buckets/rules restore via the bucket storage page, not here.
const ioOverlay = document.querySelector('#io-modal-overlay');
const ioColumns = document.querySelector('#io-columns');
const ioError = document.querySelector('#io-error');
const ioInput = document.querySelector('#io-import-input');
const conflictView = document.querySelector('#io-conflict-view');
const conflictList = document.querySelector('#io-conflict-list');
const conflictLabel = document.querySelector('#io-conflict-label');
const conflictDesc = document.querySelector('#io-conflict-desc');
const conflictCount = document.querySelector('#io-conflict-count');
let pendingImport = null;  // interval: {kind,imported,currentRows,currentUnion,importUnion} | tt: {kind,data,sitesByDay,conflicts}

function showIoError(msg) { ioError.textContent = msg; ioError.removeAttribute('hidden'); ioError.style.display = ''; }
function hideConflicts() { conflictView.style.display = 'none'; ioColumns.style.display = ''; pendingImport = null; }
function openIo() { ioError.style.display = 'none'; hideConflicts(); ioOverlay.removeAttribute('hidden'); ioOverlay.style.display = ''; }
function closeIo() { ioOverlay.style.display = 'none'; }

document.querySelector('#io-open-btn').addEventListener('click', openIo);
document.querySelector('#io-modal-close').addEventListener('click', closeIo);
ioOverlay.addEventListener('click', (e) => { if (e.target === ioOverlay) closeIo(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ioOverlay.style.display !== 'none') closeIo(); });

document.querySelector('#io-bg-export-btn').addEventListener('click', exportAll);
document.querySelector('#io-bg-import-btn').addEventListener('click', () => ioInput.click());
document.querySelector('#io-tt-version').textContent = TT_VERSION;
document.querySelector('#io-tt-export-btn').addEventListener('click', async () => downloadTt(await getSitesByDay()));
document.querySelector('#io-tt-import-btn').addEventListener('click', () => ioInput.click());
document.querySelector('#io-csv-daily-btn').addEventListener('click', async () => downloadDailyCsv(await getSitesByDay(), await getSubpagesByDay()));
document.querySelector('#io-csv-hourly-btn').addEventListener('click', async () => downloadHourlyCsv(await getSitesByHour(), await getSubpagesByHour()));
document.querySelector('#io-csv-rows-btn').addEventListener('click', async () => downloadIntervalsCsv(await allIntervals()));

// Merge rows' [from,to) into sorted, disjoint coverage intervals.
function mergeRanges(rows) {
  const sorted = rows.map(r => [r.from, r.to]).sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [f, t] of sorted) {
    const last = out[out.length - 1];
    if (last && f <= last[1]) last[1] = Math.max(last[1], t);
    else out.push([f, t]);
  }
  return out;
}

// Partition rows by whether each overlaps `union` (sorted disjoint coverage).
function splitByOverlap(rows, union) {
  const sorted = [...rows].sort((a, b) => a.from - b.from);
  const overlapping = [], free = [];
  let j = 0;
  for (const row of sorted) {
    while (j < union.length && union[j][1] <= row.from) j++;
    const u = union[j];
    if (u && u[0] < row.to && row.from < u[1]) overlapping.push(row);
    else free.push(row);
  }
  return { overlapping, free };
}

function clock(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function rowLabel(r) {
  const where = r.domain + (r.path && r.path !== '/' ? r.path : '');
  return `${localDayKey(r.from)}  ${clock(r.from)}–${clock(r.to)}  ${where}  (${r.kind})`;
}

async function finishImport(rowsToInsert, idsToDelete) {
  if (idsToDelete?.length) await deleteByIds(idsToDelete);
  const rows = rowsToInsert.map(({ id: _id, ...r }) => r);  // strip ids; ++id reassigns
  if (rows.length) await appendIntervals(rows);
  invalidate();
  closeIo();
  await loadStats();
  showNotification(`Imported ${rows.length.toLocaleString()} rows`);
}

const CONFLICT_LIST_CAP = 500;

// Generic conflict view: a list of string labels with a title/description/unit.
function showConflicts({ labels, unit, title, desc }) {
  conflictLabel.textContent = title;
  conflictDesc.textContent = desc;
  conflictCount.textContent = ` (${labels.length.toLocaleString()} ${unit}${labels.length === 1 ? '' : 's'})`;
  conflictList.replaceChildren();
  for (const label of labels.slice(0, CONFLICT_LIST_CAP)) {
    const li = document.createElement('li');
    li.textContent = label;
    li.title = label;
    li.style.cssText = 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    conflictList.appendChild(li);
  }
  if (labels.length > CONFLICT_LIST_CAP) {
    const li = document.createElement('li');
    li.textContent = `…and ${(labels.length - CONFLICT_LIST_CAP).toLocaleString()} more`;
    conflictList.appendChild(li);
  }
  ioColumns.style.display = 'none';
  conflictView.removeAttribute('hidden');
  conflictView.style.display = '';
  conflictView.style.marginTop = '0';  // columns above are hidden here, so no separator needed
}

// BiteGuard backup -> interval log, by temporal overlap (between sources).
async function importBiteGuard(json) {
  const imported = json.intervals.filter(r => typeof r.from === 'number' && typeof r.to === 'number');
  if (imported.length === 0) { showIoError('The file has no browsing data to import.'); return; }

  const currentRows = await allIntervals();
  if (currentRows.length === 0) { await finishImport(imported, null); return; }

  const currentUnion = mergeRanges(currentRows);
  const importUnion = mergeRanges(imported);
  const overlapping = splitByOverlap(currentRows, importUnion).overlapping;
  if (overlapping.length === 0) { await finishImport(imported, null); return; }  // disjoint in time

  pendingImport = { kind: 'interval', imported, currentRows, currentUnion, importUnion };
  const labels = [...overlapping].sort((a, b) => a.from - b.from).map(rowLabel);
  showConflicts({
    labels, unit: 'row', title: 'Overlapping data',
    desc: "These current rows overlap the file's rows in time. Keep current discards the overlapping rows from the file; Replace drops the rows listed below and takes the file's. Rows that don't overlap are always kept.",
  });
}

// Time Tracker export -> scalar bucket tier (separate from the interval log).
async function importTt(json) {
  const data = parseTtStats(json);
  const days = Object.keys(data);
  if (days.length === 0) { showIoError('The file has no Time Tracker data to import.'); return; }

  const stored = await chrome.storage.local.get(SITES_DAY_KEY);
  const sitesByDay = stored[SITES_DAY_KEY] ?? {};
  const conflicts = days.filter(d => sitesByDay[d]).sort();
  if (conflicts.length === 0) {
    await applyTtImport(data, sitesByDay, new Set());
    closeIo();
    await loadStats();
    return;
  }
  pendingImport = { kind: 'tt', data, sitesByDay, conflicts };
  showConflicts({
    labels: conflicts, unit: 'day', title: 'Conflicting days',
    desc: 'These days already have data and also appear in the Time Tracker file. Keep current ignores those days from the file; Replace overwrites them. Days only in the file are always added.',
  });
}

ioInput.addEventListener('change', async () => {
  const file = ioInput.files[0];
  ioInput.value = '';
  if (!file) return;
  let json;
  try { json = JSON.parse(await file.text()); }
  catch { showIoError("This file isn't valid JSON. It may be truncated or corrupted."); return; }
  if (json.format === 'biteguard' && Array.isArray(json.intervals)) { await importBiteGuard(json); return; }
  if (Array.isArray(json.__stat__)) { await importTt(json); return; }
  showIoError('Unrecognized file. Expected a BiteGuard export or a Time Tracker export.');
});

document.querySelector('#io-conflict-cancel').addEventListener('click', () => {
  hideConflicts();
  showNotification('Import cancelled');
});
document.querySelector('#io-conflict-keep').addEventListener('click', async () => {
  const p = pendingImport;
  hideConflicts();
  if (p.kind === 'tt') {
    await applyTtImport(p.data, p.sitesByDay, new Set());  // take only non-conflicting days
    closeIo();
    await loadStats();
    return;
  }
  const { free } = splitByOverlap(p.imported, p.currentUnion);  // add only imported rows clear of current
  await finishImport(free, null);
});
document.querySelector('#io-conflict-replace').addEventListener('click', async () => {
  const p = pendingImport;
  hideConflicts();
  if (p.kind === 'tt') {
    await applyTtImport(p.data, p.sitesByDay, new Set(p.conflicts));  // overwrite conflicting days
    closeIo();
    await loadStats();
    return;
  }
  const { overlapping } = splitByOverlap(p.currentRows, p.importUnion);  // drop current rows that overlap
  await finishImport(p.imported, overlapping.map(r => r.id));
});

// --- Targeted deletion (UI cloned from the bucket storage page; deletes interval rows) ---
function delHourLabel(h, clockFormat) {
  if (h === 24) return clockFormat === '12h' ? '12 AM +1' : '00:00 +1';
  return formatHourLabel(h, clockFormat);
}

function buildHourDropdown(id, initHour, clockFormat, onChange) {
  const wrap = document.querySelector(`#${id}`);
  wrap.dataset.direction = 'up';
  const btn = document.createElement('button');
  btn.className = 'dropdown-btn';
  btn.dataset.value = initHour;
  btn.innerHTML = `${delHourLabel(initHour, clockFormat)}<span class="dropdown-arrow">▼</span>`;
  const menu = document.createElement('div');
  menu.className = 'dropdown-menu';
  for (let h = 0; h <= 24; h++) {
    const opt = document.createElement('button');
    opt.value = h;
    opt.textContent = delHourLabel(h, clockFormat);
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

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
});

const contiguousForm = document.querySelector('#range-form-row');
const repeatForm = document.querySelector('#repeat-form');
const modeRepeatBtn = document.querySelector('#mode-repeat-btn');
const rangeFromDate = document.querySelector('#range-from-date');
const rangeToDate = document.querySelector('#range-to-date');
const repeatFromDate = document.querySelector('#repeat-from-date');
const repeatToDate = document.querySelector('#repeat-to-date');
const siteInput = document.querySelector('#site-filter-input');
const deleteAllBtn = document.querySelector('#delete-all-site-btn');

document.querySelector('#mode-contiguous-btn').addEventListener('click', () => {
  contiguousForm.style.display = '';
  repeatForm.style.display = 'none';
  document.querySelector('#mode-contiguous-btn').classList.add('active');
  modeRepeatBtn.classList.remove('active');
  syncDeleteRangeBtn();
});
modeRepeatBtn.addEventListener('click', () => {
  contiguousForm.style.display = 'none';
  repeatForm.style.display = '';
  modeRepeatBtn.classList.add('active');
  document.querySelector('#mode-contiguous-btn').classList.remove('active');
  syncDeleteRangeBtn();
});

function syncDeleteAllBtn() { deleteAllBtn.disabled = !siteInput.value.trim(); }
attachInputClear(siteInput, document.querySelector('#site-filter-clear'), syncDeleteAllBtn);
const delSiteParam = new URLSearchParams(location.search).get('site');
if (delSiteParam) siteInput.value = delSiteParam;
syncDeleteAllBtn();

function getHourValue(id) {
  return parseInt(document.querySelector(`#${id} .dropdown-btn`).dataset.value, 10);
}

function syncDeleteRangeBtn() {
  const btn = document.querySelector('#delete-range-btn');
  const isRepeat = modeRepeatBtn.classList.contains('active');
  if (isRepeat) {
    const fromDate = repeatFromDate.value, toDate = repeatToDate.value;
    btn.disabled = !fromDate || !toDate || fromDate > toDate || getHourValue('repeat-from-hour') >= getHourValue('repeat-to-hour');
  } else {
    const fromDate = rangeFromDate.value, toDate = rangeToDate.value;
    const fromKey = fromDate ? `${fromDate}T${String(getHourValue('range-from-hour')).padStart(2, '0')}` : '';
    const toKey = toDate ? `${toDate}T${String(getHourValue('range-to-hour')).padStart(2, '0')}` : '';
    btn.disabled = !fromDate || !toDate || fromKey >= toKey;
  }
}
rangeFromDate.addEventListener('input', syncDeleteRangeBtn);
rangeToDate.addEventListener('input', syncDeleteRangeBtn);
repeatFromDate.addEventListener('input', syncDeleteRangeBtn);
repeatToDate.addEventListener('input', syncDeleteRangeBtn);

function buildRepeatPairs(fromDate, toDate, fromHour, toHour) {
  const pairs = [];
  const cur = new Date(fromDate + 'T12:00:00');
  const end = new Date(toDate + 'T12:00:00');
  while (cur <= end) {
    const d = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    pairs.push([`${d}T${String(fromHour).padStart(2, '0')}`, `${d}T${String(toHour).padStart(2, '0')}`]);
    cur.setDate(cur.getDate() + 1);
  }
  return pairs;
}

// "YYYY-MM-DDTHH" -> ms; hour 24 rolls to next-day 00:00.
function keyToTs(key) {
  const [date, hh] = key.split('T');
  const d = new Date(date + 'T00:00:00');
  d.setHours(parseInt(hh, 10));
  return d.getTime();
}

deleteAllBtn.addEventListener('click', async () => {
  const siteId = siteInput.value.trim();
  const ok = await confirmDialog({
    message: `Delete all rows for ${siteId}? This permanently removes every interval row for ${siteId} across all dates. This cannot be undone.`,
    confirmLabel: 'Delete',
  });
  if (!ok) return;
  const n = await deleteByDomain(siteId);
  invalidate();
  await loadStats();
  showNotification(`Deleted ${n.toLocaleString()} row${n === 1 ? '' : 's'} for ${siteId}`);
});

document.querySelector('#delete-range-btn').addEventListener('click', async () => {
  const isRepeat = modeRepeatBtn.classList.contains('active');
  const siteId = siteInput.value.trim() || null;
  const scope = siteId ? ` for ${siteId}` : '';
  let confirmMsg, pairs;
  if (isRepeat) {
    const fromDate = repeatFromDate.value, toDate = repeatToDate.value;
    const fromHour = getHourValue('repeat-from-hour'), toHour = getHourValue('repeat-to-hour');
    pairs = buildRepeatPairs(fromDate, toDate, fromHour, toHour);
    confirmMsg = `Delete rows${scope} for hours ${String(fromHour).padStart(2, '0')}:00–${String(toHour).padStart(2, '0')}:00 daily from ${fromDate} to ${toDate}? This cannot be undone.`;
  } else {
    const fromDate = rangeFromDate.value, toDate = rangeToDate.value;
    const fromHour = getHourValue('range-from-hour'), toHour = getHourValue('range-to-hour');
    pairs = [[`${fromDate}T${String(fromHour).padStart(2, '0')}`, `${toDate}T${String(toHour).padStart(2, '0')}`]];
    confirmMsg = `Delete all rows${scope} from ${fromDate} ${String(fromHour).padStart(2, '0')}:00 to ${toDate} ${String(toHour).padStart(2, '0')}:00? This cannot be undone.`;
  }
  const ok = await confirmDialog({ message: confirmMsg, confirmLabel: 'Delete' });
  if (!ok) return;
  let n = 0;
  for (const [fromKey, toKey] of pairs) n += await deleteRange(keyToTs(fromKey), keyToTs(toKey), siteId);
  invalidate();
  await loadStats();
  showNotification(`Cleared the range across ${n.toLocaleString()} row${n === 1 ? '' : 's'}`);
});

async function initHourDropdowns() {
  const stored = await chrome.storage.local.get(PREF_CLOCK_FORMAT);
  const clockFormat = stored[PREF_CLOCK_FORMAT] ?? DEFAULT_CLOCK_FORMAT;
  buildHourDropdown('range-from-hour', 0, clockFormat, syncDeleteRangeBtn);
  buildHourDropdown('range-to-hour', 24, clockFormat, syncDeleteRangeBtn);
  buildHourDropdown('repeat-from-hour', 9, clockFormat, syncDeleteRangeBtn);
  buildHourDropdown('repeat-to-hour', 17, clockFormat, syncDeleteRangeBtn);
  syncDeleteRangeBtn();
}
initHourDropdowns();

// --- Remove insignificant rows (scan overlay; aggregates raw rows per site/page) ---
let _cbId = 0;
let scanState = null;
const scanOverlay = document.querySelector('#scan-overlay');
const thresholdInput = document.querySelector('#threshold-input');

function syncScanBtn() {
  const num = Number(thresholdInput.value);
  const valid = thresholdInput.value !== '' && !isNaN(num) && num > 0;
  const scopeOk = document.querySelector('#insig-scope-sites').checked || document.querySelector('#insig-scope-subpages').checked;
  document.querySelector('#scan-btn').disabled = !valid || !scopeOk;
}
thresholdInput.addEventListener('input', () => {
  thresholdInput.value = thresholdInput.value.replace(/[^0-9]/g, '');  // digits only
  syncScanBtn();
  const num = Number(thresholdInput.value);
  if (num > 0) chrome.storage.local.set({ pruneThresholdSeconds: num });
});
document.querySelector('#insig-scope-sites').addEventListener('change', syncScanBtn);
document.querySelector('#insig-scope-subpages').addEventListener('change', syncScanBtn);
document.querySelector('#scan-btn').addEventListener('click', runScan);
document.querySelector('#overlay-close').addEventListener('click', () => { scanOverlay.style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && scanOverlay.style.display !== 'none') scanOverlay.style.display = 'none'; });
document.querySelector('#overlay-delete-btn').addEventListener('click', deleteSelectedInsignificant);

function rowKey(r) { return `${r.isSub ? 'p' : 's'}\n${r.siteId}\n${r.path ?? ''}`; }

async function runScan() {
  const thresholdMs = Number(thresholdInput.value) * 1000;
  const scanSites = document.querySelector('#insig-scope-sites').checked;
  const scanSubpages = document.querySelector('#insig-scope-subpages').checked;

  const rows = await allIntervals();
  const siteAgg = new Map();
  const pathAgg = new Map();
  for (const r of rows) {
    const dur = Math.max(0, r.to - r.from);
    let s = siteAgg.get(r.domain);
    if (!s) { s = { siteId: r.domain, totalActive: 0, totalAudio: 0, recordCount: 0, lastTo: 0 }; siteAgg.set(r.domain, s); }
    s.recordCount++; if (r.to > s.lastTo) s.lastTo = r.to;
    if (r.kind === 'active') s.totalActive += dur; else if (r.kind === 'audio') s.totalAudio += dur;
    const pk = `${r.domain}\n${r.path}`;
    let p = pathAgg.get(pk);
    if (!p) { p = { siteId: r.domain, path: r.path, totalActive: 0, totalAudio: 0, recordCount: 0, lastTo: 0 }; pathAgg.set(pk, p); }
    p.recordCount++; if (r.to > p.lastTo) p.lastTo = r.to;
    if (r.kind === 'active') p.totalActive += dur; else if (r.kind === 'audio') p.totalAudio += dur;
  }

  const below = a => a.totalActive < thresholdMs && a.totalAudio < thresholdMs;
  const groups = [];
  if (scanSites) {
    const results = [...siteAgg.values()].filter(below).map(a => ({ ...a, isSub: false, lastVisit: localDayKey(a.lastTo) }));
    groups.push({ label: 'Sites', isSub: false, results, sortCol: 'lastVisit', sortDir: 'desc', selectedKeys: new Set(results.map(rowKey)) });
  }
  if (scanSubpages) {
    const results = [...pathAgg.values()].filter(below).map(a => ({ ...a, isSub: true, lastVisit: localDayKey(a.lastTo) }));
    groups.push({ label: 'Subpages', isSub: true, results, sortCol: 'lastVisit', sortDir: 'desc', selectedKeys: new Set(results.map(rowKey)) });
  }
  scanState = { groups, thresholdMs };
  renderScanResults();
  scanOverlay.style.display = '';
}

function renderScanResults() {
  const { groups, thresholdMs } = scanState;
  document.querySelector('#overlay-params').textContent = `${thresholdMs / 1000}s · ${groups.map(g => g.label).join(' + ')}`;
  const resultsEl = document.querySelector('#overlay-results');
  resultsEl.innerHTML = '';
  if (!groups.some(g => g.results.length > 0)) {
    const msg = document.createElement('p');
    msg.className = 'text-meta';
    msg.style.cssText = 'padding:20px;text-align:center';
    msg.textContent = 'No rows below the threshold.';
    resultsEl.appendChild(msg);
    document.querySelector('#overlay-delete-btn').style.display = 'none';
    document.querySelector('#overlay-summary').textContent = '';
    return;
  }
  document.querySelector('#overlay-delete-btn').style.display = '';
  for (const group of groups) if (group.results.length > 0) resultsEl.appendChild(buildGroupEl(group));
  updateScanSummary();
}

function buildGroupEl(group) {
  const details = document.createElement('details');
  details.className = 'result-group';
  details.open = true;
  group.el = details;
  const colHeader = group.isSub ? 'Page' : 'Site';
  details.innerHTML = `
    <summary class="result-group-title">${group.label} (${group.results.length})</summary>
    <table class="data-table">
      <thead><tr>
        <th class="td-site" data-col="siteId" data-label="${colHeader}">${colHeader}</th>
        <th class="td-narrow" data-col="lastVisit" data-label="Last visit">Last visit</th>
        <th class="td-narrow" data-col="totalActive" data-label="Active">Active</th>
        <th class="td-narrow" data-col="totalAudio" data-label="Audio">Audio</th>
        <th class="td-narrow" data-col="recordCount" data-label="Rows">Rows</th>
        <th class="td-check"><label style="display:inline-flex;align-items:center;gap:5px;cursor:pointer"><input type="checkbox" class="group-all-check"> All</label></th>
      </tr></thead>
      <tbody></tbody>
    </table>`;
  rerenderGroupBody(group, details);
  details.querySelectorAll('th[data-col]').forEach(th => {
    th.addEventListener('click', () => {
      group.sortDir = group.sortCol === th.dataset.col && group.sortDir === 'asc' ? 'desc' : 'asc';
      group.sortCol = th.dataset.col;
      rerenderGroupBody(group, details);
    });
  });
  details.querySelector('.group-all-check').addEventListener('change', e => {
    if (e.target.checked) group.results.forEach(r => group.selectedKeys.add(rowKey(r)));
    else group.selectedKeys.clear();
    // Deselecting all pages also deselects their sites, and vice versa (see per-row handler).
    if (group.isSub && !e.target.checked) {
      const sites = scanState.groups.find(g => !g.isSub);
      if (sites) {
        for (const r of group.results) sites.selectedKeys.delete(`s\n${r.siteId}\n`);
        if (sites.el) rerenderGroupBody(sites, sites.el);
      }
    } else if (!group.isSub && !e.target.checked) {
      const subs = scanState.groups.find(g => g.isSub);
      if (subs) {
        const domains = new Set(group.results.map(s => s.siteId));
        for (const pr of subs.results) if (domains.has(pr.siteId)) subs.selectedKeys.delete(rowKey(pr));
        if (subs.el) rerenderGroupBody(subs, subs.el);
      }
    }
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
  const siteCell = group.isSub
    ? `<td class="td-site"><span class="site-label truncate" title="${escapeHtml(r.siteId)}">${escapeHtml(r.siteId)}</span><span class="text-meta truncate" title="${escapeHtml(r.path)}">${escapeHtml(r.path)}</span></td>`
    : `<td class="td-site"><span class="truncate" title="${escapeHtml(r.siteId)}">${escapeHtml(r.siteId)}</span></td>`;
  tr.innerHTML = `${siteCell}<td>${r.lastVisit}</td><td>${formatMs(r.totalActive)}</td><td>${formatMs(r.totalAudio)}</td><td>${r.recordCount}</td><td class="td-check"><input type="checkbox" id="scan-row-${++_cbId}" ${checked ? 'checked' : ''}></td>`;
  tr.querySelector('input[type="checkbox"]').addEventListener('change', e => {
    if (e.target.checked) { group.selectedKeys.add(key); tr.classList.remove('unchecked'); }
    else { group.selectedKeys.delete(key); tr.classList.add('unchecked'); }
    // Keep site and its pages in sync: unchecking a page unchecks its site (a
    // selected site deletes the whole domain), and unchecking a site unchecks its
    // pages. Mutate keys + re-render (no change events fired, so no loop).
    if (group.isSub && !e.target.checked) {
      const sites = scanState.groups.find(g => !g.isSub);
      if (sites?.selectedKeys.delete(`s\n${r.siteId}\n`) && sites.el) rerenderGroupBody(sites, sites.el);
    } else if (!group.isSub && !e.target.checked) {
      const subs = scanState.groups.find(g => g.isSub);
      if (subs) {
        let changed = false;
        for (const pr of subs.results) if (pr.siteId === r.siteId) changed = subs.selectedKeys.delete(rowKey(pr)) || changed;
        if (changed && subs.el) rerenderGroupBody(subs, subs.el);
      }
    }
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

function updateScanSummary() {
  let identities = 0, records = 0;
  const totalResults = scanState.groups.reduce((s, g) => s + g.results.length, 0);
  for (const group of scanState.groups)
    for (const r of group.results)
      if (group.selectedKeys.has(rowKey(r))) { identities++; records += r.recordCount; }
  const deleteBtn = document.querySelector('#overlay-delete-btn');
  const summaryEl = document.querySelector('#overlay-summary');
  if (identities === 0) { summaryEl.textContent = 'Nothing selected'; deleteBtn.disabled = true; return; }
  deleteBtn.disabled = false;
  summaryEl.textContent = `${identities} of ${totalResults} selected (${records.toLocaleString()} rows)`;
}

async function deleteSelectedInsignificant() {
  const ok = await confirmDialog({ message: 'Delete all selected insignificant rows? This cannot be undone.', confirmLabel: 'Delete' });
  if (!ok) return;
  const domains = new Set();                  // selected whole sites
  const paths = new Set();                     // selected pages, keyed "domain\npath"
  for (const group of scanState.groups) {
    for (const r of group.results) {
      if (!group.selectedKeys.has(rowKey(r))) continue;
      if (group.isSub) paths.add(`${r.siteId}\n${r.path}`);
      else domains.add(r.siteId);
    }
  }
  // One pass, one bulk delete — avoids N full-store scans and partial failures.
  const rows = await allIntervals();
  const ids = rows.filter(r => domains.has(r.domain) || paths.has(`${r.domain}\n${r.path}`)).map(r => r.id);
  await deleteByIds(ids);
  scanOverlay.style.display = 'none';
  invalidate();
  await loadStats();
  showNotification(`Deleted ${ids.length.toLocaleString()} row${ids.length === 1 ? '' : 's'}`);
}

(async () => {
  const { pruneThresholdSeconds } = await chrome.storage.local.get('pruneThresholdSeconds');
  if (pruneThresholdSeconds != null) thresholdInput.value = pruneThresholdSeconds;
  syncScanBtn();
})();

// --- Drop subpage detail (collapse old rows to site level) ---
const dropDaysInput = document.querySelector('#drop-days-input');
dropDaysInput.addEventListener('input', () => {
  dropDaysInput.value = dropDaysInput.value.replace(/[^0-9]/g, '');  // digits only
});
document.querySelector('#drop-paths-btn').addEventListener('click', async () => {
  const days = parseInt(document.querySelector('#drop-days-input').value, 10);
  if (!Number.isFinite(days) || days < 0) { showNotification('Enter a valid number of days'); return; }
  // Day-aligned: keep the last `days` calendar days detailed, collapse everything
  // before. cutoff = tomorrow 00:00 - days. days=0 collapses all; never splits a day.
  const c = new Date();
  c.setHours(0, 0, 0, 0);
  c.setDate(c.getDate() + 1 - days);
  const ok = await confirmDialog({
    message: `Collapse rows older than ${days} day(s) to site level, dropping their page paths? Site totals stay; per-page detail is lost. This cannot be undone.`,
    confirmLabel: 'Drop',
  });
  if (!ok) return;
  const n = await dropPathsBefore(c.getTime());
  invalidate();
  await loadStats();
  showNotification(n > 0 ? `Removed ${n.toLocaleString()} row${n === 1 ? '' : 's'} by collapsing` : `No rows older than ${days} day(s)`);
});

// --- Favicon cache ---
const faviconStats = document.querySelector('#favicon-stats');
async function loadFaviconStats() {
  const [data, bytes] = await Promise.all([
    chrome.storage.local.get('faviconCache'),
    chrome.storage.local.getBytesInUse('faviconCache'),
  ]);
  const n = Object.keys(data.faviconCache ?? {}).length;
  faviconStats.textContent = `${n.toLocaleString()} icon${n === 1 ? '' : 's'} (${formatBytes(bytes)})`;
  document.querySelector('#favicon-clear-btn').disabled = n === 0;
}
document.querySelector('#favicon-clear-btn').addEventListener('click', async () => {
  const ok = await confirmDialog({ message: 'Clear all favicons? Icons reload from the browser as you visit sites.', confirmLabel: 'Clear' });
  if (!ok) return;
  await chrome.storage.local.remove('faviconCache');
  await loadFaviconStats();
  await loadStats();  // refresh the extension-storage quota
  showNotification('Favicon cache cleared');
});

const faviconDaysInput = document.querySelector('#favicon-days-input');
faviconDaysInput.addEventListener('input', () => {
  faviconDaysInput.value = faviconDaysInput.value.replace(/[^0-9]/g, '');  // digits only
});
document.querySelector('#favicon-stale-btn').addEventListener('click', async () => {
  const days = parseInt(faviconDaysInput.value, 10);
  if (!Number.isFinite(days) || days < 1) { showNotification('Enter a valid number of days'); return; }
  const cutoff = Date.now() - days * 86400000;
  // Last activity per domain (favicon keys are the same eTLD+1 domain).
  const lastTo = new Map();
  for (const r of await allIntervals()) {
    const cur = lastTo.get(r.domain) ?? 0;
    if (r.to > cur) lastTo.set(r.domain, r.to);
  }
  const { faviconCache = {} } = await chrome.storage.local.get('faviconCache');
  const stale = Object.keys(faviconCache).filter(h => (lastTo.get(h) ?? 0) < cutoff);
  if (stale.length === 0) { showNotification(`No icons unused for ${days}+ days`); return; }
  const ok = await confirmDialog({
    message: `Clear ${stale.length.toLocaleString()} icon(s) for sites not visited in the last ${days} day(s)? They reload from the browser when next visited.`,
    confirmLabel: 'Clear',
  });
  if (!ok) return;
  for (const h of stale) delete faviconCache[h];
  await chrome.storage.local.set({ faviconCache });
  await loadFaviconStats();
  await loadStats();
  showNotification(`Cleared ${stale.length.toLocaleString()} unused icon(s)`);
});

loadFaviconStats();

async function renderInterval() {
  const [stats, est] = await Promise.all([
    intervalStats(),
    navigator.storage?.estimate ? navigator.storage.estimate().catch(() => null) : null,
  ]);
  document.querySelector('#count-domains').textContent  = stats.domains.toLocaleString();
  document.querySelector('#count-subpages').textContent = stats.subpages.toLocaleString();
  document.querySelector('#count-records').textContent  = stats.rows.toLocaleString();

  if (stats.earliest && stats.latest) {
    const from = localDayKey(stats.earliest), to = localDayKey(stats.latest);
    document.querySelector('#span-value').textContent = formatSpan(from, to);
    spanTooltip.textContent = `${from} → ${to}`;
  } else {
    document.querySelector('#span-value').textContent = '—';
    document.querySelector('#span-info').style.display = 'none';
    spanChip.style.cursor = 'default';
  }

  // Row mix by kind. The bar's denominator is total rows (composition, not quota).
  // Per-kind size is the IndexedDB total apportioned by row share (rows are uniform
  // shape, so this is a fair ~estimate; the total itself includes index overhead).
  const { active, audio, idle } = stats.kinds;
  const intervalBytes = est?.usage ?? null;
  const pct = n => stats.rows > 0 ? `${(n / stats.rows * 100).toFixed(1)}%` : '0%';
  const sizeOf = n => intervalBytes != null && stats.rows > 0
    ? ` (~${formatBytes(intervalBytes * n / stats.rows)})` : '';
  document.querySelector('#bar-active').style.width = pct(active);
  document.querySelector('#bar-audio').style.width  = pct(audio);
  document.querySelector('#bar-idle').style.width   = pct(idle);
  document.querySelector('#legend-active').textContent = `Active: ${active.toLocaleString()} rows${sizeOf(active)}`;
  document.querySelector('#legend-audio').textContent  = `Audio: ${audio.toLocaleString()} rows${sizeOf(audio)}`;
  document.querySelector('#legend-idle').textContent   = `Idle: ${idle.toLocaleString()} rows${sizeOf(idle)}`;
  document.querySelector('#interval-total-text').textContent =
    intervalBytes != null ? formatBytes(intervalBytes) : 'size unavailable';
}

async function renderQuota() {
  // chrome.storage.local 10 MB (settings, cache, rules, legacy buckets).
  const totalBytes = await chrome.storage.local.getBytesInUse(null);
  const quota = chrome.storage.local.QUOTA_BYTES ?? 10485760;
  document.querySelector('#quota-bar-fill').style.width = `${Math.min(100, totalBytes / quota * 100).toFixed(1)}%`;
  document.querySelector('#quota-text').textContent = `${formatBytes(totalBytes)} / ${formatBytes(quota)}`;

  const { [SITES_DAY_KEY]: sitesByDay = {} } = await chrome.storage.local.get(SITES_DAY_KEY);
  const hasLegacy = Object.values(sitesByDay).some(day => day && Object.keys(day).length > 0);
  document.querySelector('#legacy-storage-btn').style.display = hasLegacy ? '' : 'none';
}

async function renderLastExport() {
  const prefs = await chrome.storage.local.get(PREF_LAST_EXPORT_AT);
  const lastExportAt = prefs[PREF_LAST_EXPORT_AT];
  if (lastExportAt) {
    const diffDays = Math.floor((Date.now() - lastExportAt) / 86400000);
    document.querySelector('#export-age').textContent   = diffDays === 0 ? 'Today' : diffDays;
    document.querySelector('#export-label').textContent = diffDays === 0 ? '' : `day${diffDays !== 1 ? 's' : ''} ago`;
  } else {
    document.querySelector('#export-age').textContent   = 'Never';
    document.querySelector('#export-label').textContent = 'exported';
  }
}

async function loadStats() {
  for (const [name, fn] of [
    ['interval', renderInterval],
    ['quota', renderQuota], ['last-export', renderLastExport],
  ]) {
    try { await fn(); } catch (e) { console.error(`interval-storage ${name}:`, e); }
  }
}

await loadStats();

const storageTourSteps = [
  {
    selector: '#overview',
    title: 'Storage overview',
    body: 'At a glance: how many domains, subpages and rows you have, the active/audio/idle mix of your browsing data, your 10 MB quota headroom, and when you last exported.',
    newInVersion: 3,
  },
  {
    selector: '#tools-grid',
    title: 'Manage your data',
    body: 'Tools to manage your data: remove insignificant rows, delete by site or date range, drop subpage detail, and clear the favicon cache.',
    newInVersion: 3,
  },
  {
    selector: '#back-btn',
    title: "That's the tour",
    body: "You've seen every surface of BiteGuard. Click the back arrow to return to the dashboard.",
    handoff: { nextSurface: 'dashboard', nextStepIndex: 7, mode: 'inPage' },
    newInVersion: 3,
  },
];

autoStartIfMatches('storage-management', storageTourSteps);
