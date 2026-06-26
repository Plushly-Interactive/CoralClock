import { formatBytes, showNotification } from '../../shared/utils.js';
import { localDayKey, formatSpan } from '../../shared/timeUtils.js';
import { intervalStats, appendIntervals, allIntervals, deleteByIds } from '../../data/intervalLog.js';
import { invalidate, getSitesByDay, getSubpagesByDay, getSitesByHour, getSubpagesByHour } from '../../data/intervalAggregates.js';
import { downloadBiteGuardExport } from '../../data/exportPayload.js';
import { parseTtStats, applyTtImport, downloadTt, TT_VERSION } from '../../data/ttImport.js';
import { downloadDailyCsv, downloadHourlyCsv, downloadIntervalsCsv } from '../../data/csvExport.js';
import { SITES_DAY_KEY } from '../../background/siteTracking.js';
import { PREF_LAST_EXPORT_AT } from '../../shared/prefKeys.js';

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
