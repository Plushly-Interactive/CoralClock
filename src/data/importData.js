import { SITES_DAY_KEY, SITES_HOUR_KEY } from '../background/siteTracking.js';
import { SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY } from '../background/subpageTracking.js';
import { showNotification } from '../shared/utils.js';
import { MSG_INVALIDATE_SITES_CACHE } from '../shared/msgTypes.js';
import { EXPORT_PREF_KEYS, downloadBiteGuardExport } from './exportPayload.js';
import { IMPORT_COMPLETE, TT_VERSION, parseTtStats, applyTtImport, downloadTt } from './ttImport.js';
import { downloadDailyCsv, downloadHourlyCsv } from './csvExport.js';

export { IMPORT_COMPLETE };

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
const ioError = document.querySelector('#io-error');
const conflictView = document.querySelector('#io-conflict-view');
const conflictList = document.querySelector('#io-conflict-list');
const conflictCancel = document.querySelector('#io-conflict-cancel');
const conflictKeep = document.querySelector('#io-conflict-keep');
const conflictReplace = document.querySelector('#io-conflict-replace');

function showImportError(msg) {
  ioError.textContent = msg;
  ioError.removeAttribute('hidden');
  ioError.style.display = '';
}

function clearImportError() {
  ioError.style.display = 'none';
}

export function openModal() {
  clearImportError();
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
  await downloadBiteGuardExport();
}

bgExportBtn.addEventListener('click', exportBiteGuardData);

csvDailyBtn.addEventListener('click', async () => {
  const {
    [SITES_DAY_KEY]: sitesByDay = {},
    [SUBPAGES_DAY_KEY]: subpagesByDay = {},
  } = await chrome.storage.local.get([SITES_DAY_KEY, SUBPAGES_DAY_KEY]);
  downloadDailyCsv(sitesByDay, subpagesByDay);
});

csvHourlyBtn.addEventListener('click', async () => {
  const {
    [SITES_HOUR_KEY]: sitesByHour = {},
    [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
  } = await chrome.storage.local.get([SITES_HOUR_KEY, SUBPAGES_HOUR_KEY]);
  downloadHourlyCsv(sitesByHour, subpagesByHour);
});

ttExportBtn.addEventListener('click', async () => {
  const { [SITES_DAY_KEY]: sitesByDay = {} } = await chrome.storage.local.get(SITES_DAY_KEY);
  downloadTt(sitesByDay);
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
  clearImportError();

  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    importInput.value = '';
    showImportError("This file isn't valid JSON. It may be truncated or corrupted.");
    return;
  }
  importInput.value = '';

  if (json.format === 'biteguard') {
    await handleBgImport(json);
  } else if (Array.isArray(json.__stat__)) {
    await handleTtImport(json);
  } else {
    showImportError('Unrecognized file format. Expected a BiteGuard export (.json) or a Time Tracker export.');
  }
});

async function handleTtImport(json) {
  const data = parseTtStats(json);
  const { [SITES_DAY_KEY]: sitesByDay = {} } = await chrome.storage.local.get(SITES_DAY_KEY);
  const conflicts = Object.keys(data).filter((d) => sitesByDay[d]).sort();

  if (conflicts.length === 0) {
    await applyTtImport(data, sitesByDay, new Set());
    return;
  }

  pendingImport = { importData: data, currentByDay: sitesByDay, conflicts, isTt: true };
  showConflictView(conflicts);
}

let pendingImport = null;

function validateBgFile(json) {
  if (typeof json.version === 'number' && json.version > 3) {
    return `This file was exported by a newer version of BiteGuard (version ${json.version}). Update the extension to import it.`;
  }
  if (json.version !== 1 && json.version !== 2 && json.version !== 3) {
    return 'Unrecognized BiteGuard file version.';
  }
  if (!json.data || typeof json.data !== 'object' || Array.isArray(json.data)) {
    return "The file's tracking data section is missing or has an unexpected shape.";
  }
  for (const key of [SITES_DAY_KEY, SITES_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY]) {
    const v = json.data[key];
    if (v !== undefined && (typeof v !== 'object' || Array.isArray(v))) {
      return `The file's "${key}" section is not a valid object.`;
    }
  }
  if (json.rules !== undefined && !Array.isArray(json.rules)) {
    return "The file's rules section is not a valid array.";
  }
  return null;
}

async function handleBgImport(json) {
  const err = validateBgFile(json);
  if (err) { showImportError(err); return; }
  // Accept both the current key and the legacy analyticsBy* key from older export files.
  const importByDay = json.data[SITES_DAY_KEY] || json.data.analyticsByDay || {};
  const importByHour = json.data[SITES_HOUR_KEY] || json.data.analyticsByHour || {};
  const importSubpagesByDay = json.data[SUBPAGES_DAY_KEY] || {};
  const importSubpagesByHour = json.data[SUBPAGES_HOUR_KEY] || {};
  try {
    normalizeSiteBuckets(importByDay);
    normalizeSiteBuckets(importByHour);
    normalizeSubpageBuckets(importSubpagesByDay);
    normalizeSubpageBuckets(importSubpagesByHour);
  } catch {
    showImportError("The file's tracking data is corrupted and could not be read.");
    return;
  }

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
