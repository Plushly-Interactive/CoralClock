import { SITES_DAY_KEY, SITES_HOUR_KEY } from '../background/siteTracking.js';
import { SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY } from '../background/subpageTracking.js';
import { showNotification } from '../shared/utils.js';
import { MSG_INVALIDATE_SITES_CACHE } from '../shared/msgTypes.js';
import { PREF_LAST_EXPORT_AT, PREF_CLOCK_FORMAT, PREF_IDLE_THRESHOLD_SEC, PREF_WEEK_START } from '../shared/prefKeys.js';

const EXPORT_PREF_KEYS = [PREF_CLOCK_FORMAT, PREF_IDLE_THRESHOLD_SEC, PREF_WEEK_START];

export const IMPORT_COMPLETE = 'importcomplete';

function normalizeHost(host) {
  return host.startsWith('www.') ? host.slice(4) : host;
}

function sumCell(a, b) {
  return {
    activeMs: (a.activeMs ?? 0) + (b.activeMs ?? 0),
    audioMs: (a.audioMs ?? 0) + (b.audioMs ?? 0),
    overlapMs: (a.overlapMs ?? 0) + (b.overlapMs ?? 0),
    visits: (a.visits ?? 0) + (b.visits ?? 0),
  };
}

function normalizeSiteBuckets(buckets) {
  for (const [bucketKey, sites] of Object.entries(buckets)) {
    const next = {};
    for (const [siteId, cell] of Object.entries(sites)) {
      const host = normalizeHost(siteId);
      next[host] = next[host] ? sumCell(next[host], cell) : cell;
    }
    buckets[bucketKey] = next;
  }
}

function normalizeSubpageBuckets(buckets) {
  for (const [bucketKey, sites] of Object.entries(buckets)) {
    const next = {};
    for (const [siteId, paths] of Object.entries(sites)) {
      const host = normalizeHost(siteId);
      if (!next[host]) { next[host] = paths; continue; }
      const merged = next[host];
      for (const [p, cell] of Object.entries(paths))
        merged[p] = merged[p] ? sumCell(merged[p], cell) : cell;
    }
    buckets[bucketKey] = next;
  }
}

const TT_VERSION = '4.2.1';

const importBtn = document.querySelector('#import-btn');
const importInput = document.querySelector('#import-input');
const modalOverlay = document.querySelector('#io-modal-overlay');
const modalClose = document.querySelector('#io-modal-close');
const ttImportBtn = document.querySelector('#tt-import-btn');
const ttExportBtn = document.querySelector('#tt-export-btn');

document.querySelector('#tt-version').textContent = TT_VERSION;
const bgExportBtn = document.querySelector('#bg-export-btn');
const bgImportBtn = document.querySelector('#bg-import-btn');
const csvDailyBtn = document.querySelector('#csv-daily-btn');
const csvHourlyBtn = document.querySelector('#csv-hourly-btn');
const ioColumns = document.querySelector('#io-columns');
const conflictView = document.querySelector('#io-conflict-view');
const conflictList = document.querySelector('#io-conflict-list');
const conflictCancel = document.querySelector('#io-conflict-cancel');
const conflictKeep = document.querySelector('#io-conflict-keep');
const conflictReplace = document.querySelector('#io-conflict-replace');

export function openModal() {
  modalOverlay.removeAttribute('hidden');
  modalOverlay.style.display = '';
}

export function closeModal() {
  modalOverlay.style.display = 'none';
}

function inTourModalStep() {
  return document.body.classList.contains('tour-modal-step');
}

document.addEventListener('tour:modal-step-leave', closeModal);

importBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', () => {
  if (inTourModalStep()) return;
  closeModal();
});
modalOverlay.addEventListener('click', (e) => {
  if (inTourModalStep()) return;
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (inTourModalStep()) return;
  if (e.key === 'Escape' && modalOverlay.style.display !== 'none') closeModal();
});

export async function exportBiteGuardData() {
  const stored = await chrome.storage.local.get([
    SITES_DAY_KEY, SITES_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY,
    'rules', ...EXPORT_PREF_KEYS,
  ]);
  const sitesByDay = stored[SITES_DAY_KEY] ?? {};
  const sitesByHour = stored[SITES_HOUR_KEY] ?? {};
  const subpagesByDay = stored[SUBPAGES_DAY_KEY] ?? {};
  const subpagesByHour = stored[SUBPAGES_HOUR_KEY] ?? {};
  const rules = stored.rules ?? [];
  const prefs = {};
  for (const k of EXPORT_PREF_KEYS) {
    if (stored[k] !== undefined) prefs[k] = stored[k];
  }

  const payload = {
    format: 'biteguard',
    version: 3,
    exportedAt: new Date().toISOString(),
    rules,
    prefs,
    data: {
      [SITES_DAY_KEY]: sitesByDay,
      [SITES_HOUR_KEY]: sitesByHour,
      [SUBPAGES_DAY_KEY]: subpagesByDay,
      [SUBPAGES_HOUR_KEY]: subpagesByHour,
    },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `biteguard-export-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  await chrome.storage.local.set({ [PREF_LAST_EXPORT_AT]: Date.now() });

  showNotification(`Exported to "${filename}"`);
}

bgExportBtn.addEventListener('click', exportBiteGuardData);

function csvField(value) {
  return /[,"\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadCsv(rows, filename) {
  if (rows.length === 1) {
    showNotification('No data to export');
    return;
  }
  const blob = new Blob([rows.join('\r\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showNotification(`Exported to "${filename}"`);
}

function siteRow(prefix, host, cell) {
  return `${prefix},${host},,${((cell.activeMs ?? 0) / 60000).toFixed(2)},${((cell.audioMs ?? 0) / 60000).toFixed(2)},${cell.visits ?? 0}`;
}

function subpageRow(prefix, host, path, cell) {
  return `${prefix},${host},${csvField(path)},${((cell.activeMs ?? 0) / 60000).toFixed(2)},${((cell.audioMs ?? 0) / 60000).toFixed(2)},${cell.visits ?? 0}`;
}

csvDailyBtn.addEventListener('click', async () => {
  const {
    [SITES_DAY_KEY]: sitesByDay = {},
    [SUBPAGES_DAY_KEY]: subpagesByDay = {},
  } = await chrome.storage.local.get([SITES_DAY_KEY, SUBPAGES_DAY_KEY]);
  const rows = ['date,host,path,active_min,audio_min,visits'];
  for (const [day, sites] of Object.entries(sitesByDay).sort()) {
    for (const [host, cell] of Object.entries(sites).sort()) {
      const paths = subpagesByDay[day]?.[host];
      if (paths && Object.keys(paths).length > 0) {
        for (const [path, pathCell] of Object.entries(paths).sort()) {
          rows.push(subpageRow(day, host, path, pathCell));
        }
      } else {
        rows.push(siteRow(day, host, cell));
      }
    }
  }
  downloadCsv(rows, `biteguard-daily-${new Date().toISOString().slice(0, 10)}.csv`);
});

csvHourlyBtn.addEventListener('click', async () => {
  const {
    [SITES_HOUR_KEY]: sitesByHour = {},
    [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
  } = await chrome.storage.local.get([SITES_HOUR_KEY, SUBPAGES_HOUR_KEY]);
  const rows = ['date,hour,host,path,active_min,audio_min,visits'];
  for (const [bucket, sites] of Object.entries(sitesByHour).sort()) {
    const [date, time] = bucket.split('T');
    const hour = parseInt(time, 10);
    const prefix = `${date},${hour}`;
    for (const [host, cell] of Object.entries(sites).sort()) {
      const paths = subpagesByHour[bucket]?.[host];
      if (paths && Object.keys(paths).length > 0) {
        for (const [path, pathCell] of Object.entries(paths).sort()) {
          rows.push(subpageRow(prefix, host, path, pathCell));
        }
      } else {
        rows.push(siteRow(prefix, host, cell));
      }
    }
  }
  downloadCsv(rows, `biteguard-hourly-${new Date().toISOString().slice(0, 10)}.csv`);
});

ttExportBtn.addEventListener('click', async () => {
  const { [SITES_DAY_KEY]: sitesByDay = {} } = await chrome.storage.local.get(SITES_DAY_KEY);

  const __stat__ = [];
  for (const [day, sites] of Object.entries(sitesByDay)) {
    const date = day.replaceAll('-', '');
    for (const [host, entry] of Object.entries(sites)) {
      __stat__.push({
        host,
        date,
        focus: entry.activeMs ?? 0,
        time: entry.visits ?? 0,
      });
    }
  }

  const payload = {
    __meta__: { version: TT_VERSION, ts: Date.now() },
    __stat__,
    __limit__: [],
    __merge__: [],
    __whitelist__: [],
  };

  const blob = new Blob([JSON.stringify(payload, null, 4)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const filename = `time-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);

  showNotification(`Exported to "${filename}"`);
});

ttImportBtn.addEventListener('click', () => {
  importInput.click();
});

bgImportBtn.addEventListener('click', () => {
  importInput.click();
});

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;

  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    importInput.value = '';
    showNotification('Invalid file');
    return;
  }
  importInput.value = '';

  if (json.format === 'biteguard') {
    await handleBgImport(json);
  } else if (Array.isArray(json.__stat__)) {
    await handleTtImport(json);
  } else {
    showNotification('Unrecognized format');
  }
});

async function handleTtImport(json) {
  const data = {};
  for (const { host, date, focus, time } of json.__stat__) {
    if (!host || !date || focus == null) continue;
    const dayKey = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    const siteId = normalizeHost(host);
    data[dayKey] ??= {};
    data[dayKey][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    data[dayKey][siteId].activeMs += focus;
    data[dayKey][siteId].visits += time ?? 0;
  }

  const { [SITES_DAY_KEY]: sitesByDay = {} } = await chrome.storage.local.get(SITES_DAY_KEY);

  const conflicts = Object.keys(data).filter((d) => sitesByDay[d]).sort();

  if (conflicts.length === 0) {
    await applyTtImport(data, sitesByDay, new Set());
    return;
  }

  pendingImport = { importData: data, currentByDay: sitesByDay, conflicts, isTt: true };
  showConflictView(conflicts);
}

async function applyTtImport(importData, currentByDay, daysToReplace) {
  const daysToTake = new Set();
  for (const d of Object.keys(importData)) {
    if (!currentByDay[d] || daysToReplace.has(d)) daysToTake.add(d);
  }

  for (const d of daysToTake) {
    currentByDay[d] = importData[d];
  }

  await chrome.storage.local.set({ [SITES_DAY_KEY]: currentByDay });
  await chrome.runtime.sendMessage({ type: MSG_INVALIDATE_SITES_CACHE });
  showNotification(`Imported ${daysToTake.size} day(s)`);
  window.dispatchEvent(new CustomEvent(IMPORT_COMPLETE));
}

let pendingImport = null;

async function handleBgImport(json) {
  if ((json.version !== 1 && json.version !== 2 && json.version !== 3) || !json.data || typeof json.data !== 'object') {
    showNotification('Unrecognized BiteGuard format');
    return;
  }
  // Accept both the current key and the legacy analyticsBy* key from older export files.
  const importByDay = json.data[SITES_DAY_KEY] || json.data.analyticsByDay || {};
  const importByHour = json.data[SITES_HOUR_KEY] || json.data.analyticsByHour || {};
  const importSubpagesByDay = json.data[SUBPAGES_DAY_KEY] || {};
  const importSubpagesByHour = json.data[SUBPAGES_HOUR_KEY] || {};
  normalizeSiteBuckets(importByDay);
  normalizeSiteBuckets(importByHour);
  normalizeSubpageBuckets(importSubpagesByDay);
  normalizeSubpageBuckets(importSubpagesByHour);

  const importRules = Array.isArray(json.rules) ? json.rules : null;
  const importPrefs = json.prefs && typeof json.prefs === 'object' ? json.prefs : null;

  const {
    [SITES_DAY_KEY]: sitesByDay = {},
    [SITES_HOUR_KEY]: sitesByHour = {},
    [SUBPAGES_DAY_KEY]: subpagesByDay = {},
    [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
  } = await chrome.storage.local.get([SITES_DAY_KEY, SITES_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY]);

  const conflicts = Object.keys(importByDay).filter((d) => sitesByDay[d]).sort();

  if (conflicts.length === 0) {
    await applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, sitesByDay, sitesByHour, subpagesByDay, subpagesByHour, new Set(), importRules, importPrefs);
    return;
  }

  pendingImport = { importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay: sitesByDay, currentByHour: sitesByHour, currentSubpagesByDay: subpagesByDay, currentSubpagesByHour: subpagesByHour, conflicts, importRules, importPrefs };
  showConflictView(conflicts);
}

async function applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, daysToReplace, importRules = null, importPrefs = null) {
  const daysToTake = new Set();
  for (const d of Object.keys(importByDay)) {
    if (!currentByDay[d] || daysToReplace.has(d)) daysToTake.add(d);
  }

  for (const d of daysToTake) {
    currentByDay[d] = importByDay[d];
  }

  for (const d of daysToTake) {
    const prefix = `${d}T`;
    for (const [hk, sites] of Object.entries(importByHour)) {
      if (hk.startsWith(prefix)) currentByHour[hk] = sites;
    }
  }

  for (const d of daysToTake) {
    if (importSubpagesByDay[d]) currentSubpagesByDay[d] = importSubpagesByDay[d];
  }

  for (const d of daysToTake) {
    const prefix = `${d}T`;
    for (const [hk, sites] of Object.entries(importSubpagesByHour)) {
      if (hk.startsWith(prefix)) currentSubpagesByHour[hk] = sites;
    }
  }

  const update = {
    [SITES_DAY_KEY]: currentByDay,
    [SITES_HOUR_KEY]: currentByHour,
    [SUBPAGES_DAY_KEY]: currentSubpagesByDay,
    [SUBPAGES_HOUR_KEY]: currentSubpagesByHour,
  };

  if (importRules !== null) update.rules = importRules;

  if (importPrefs !== null) {
    for (const k of EXPORT_PREF_KEYS) {
      if (importPrefs[k] !== undefined) update[k] = importPrefs[k];
    }
  }

  await chrome.storage.local.set(update);
  await chrome.runtime.sendMessage({ type: MSG_INVALIDATE_SITES_CACHE });

  const parts = [`${daysToTake.size} day(s)`];
  if (importRules !== null) parts.push(`${importRules.length} rule(s)`);
  if (importPrefs !== null) parts.push('settings');
  showNotification(`Imported ${parts.join(', ')}`);
  window.dispatchEvent(new CustomEvent(IMPORT_COMPLETE));
}

function showConflictView(conflicts) {
  conflictList.replaceChildren();
  for (const day of conflicts) {
    const li = document.createElement('li');
    li.textContent = day;
    conflictList.appendChild(li);
  }
  ioColumns.style.display = 'none';
  conflictView.removeAttribute('hidden');
  conflictView.style.display = '';
}

function hideConflictView() {
  conflictView.style.display = 'none';
  ioColumns.style.display = '';
  pendingImport = null;
}

conflictCancel.addEventListener('click', () => {
  hideConflictView();
  showNotification('Import cancelled');
});

conflictKeep.addEventListener('click', async () => {
  if (pendingImport.isTt) {
    const { importData, currentByDay } = pendingImport;
    hideConflictView();
    await applyTtImport(importData, currentByDay, new Set());
  } else {
    const { importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, importRules, importPrefs } = pendingImport;
    hideConflictView();
    await applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, new Set(), importRules, importPrefs);
  }
});

conflictReplace.addEventListener('click', async () => {
  if (pendingImport.isTt) {
    const { importData, currentByDay, conflicts } = pendingImport;
    hideConflictView();
    await applyTtImport(importData, currentByDay, new Set(conflicts));
  } else {
    const { importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, conflicts, importRules, importPrefs } = pendingImport;
    hideConflictView();
    await applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, new Set(conflicts), importRules, importPrefs);
  }
});
