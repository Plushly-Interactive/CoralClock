import { ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY } from '../background/siteTracking.js';
import { SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY } from '../background/subpageTracking.js';
import { showNotification } from '../shared/utils.js';
import { MSG_INVALIDATE_ANALYTICS_CACHE } from '../shared/msgTypes.js';

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

function normalizeAnalyticsBuckets(buckets) {
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

bgExportBtn.addEventListener('click', async () => {
  const {
    [ANALYTICS_DAY_KEY]: analyticsByDay = {},
    [ANALYTICS_HOUR_KEY]: analyticsByHour = {},
    [SUBPAGES_DAY_KEY]: subpagesByDay = {},
    [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
  } = await chrome.storage.local.get([ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY]);

  const payload = {
    format: 'biteguard',
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      [ANALYTICS_DAY_KEY]: analyticsByDay,
      [ANALYTICS_HOUR_KEY]: analyticsByHour,
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

  showNotification(`Exported to "${filename}"`);
});

ttExportBtn.addEventListener('click', async () => {
  const { [ANALYTICS_DAY_KEY]: analyticsByDay = {} } = await chrome.storage.local.get(ANALYTICS_DAY_KEY);

  const __stat__ = [];
  for (const [day, sites] of Object.entries(analyticsByDay)) {
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

  const { [ANALYTICS_DAY_KEY]: analyticsByDay = {} } = await chrome.storage.local.get(ANALYTICS_DAY_KEY);

  const conflicts = Object.keys(data).filter((d) => analyticsByDay[d]).sort();

  if (conflicts.length === 0) {
    await applyTtImport(data, analyticsByDay, new Set());
    return;
  }

  pendingImport = { importData: data, currentByDay: analyticsByDay, conflicts, isTt: true };
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

  await chrome.storage.local.set({ [ANALYTICS_DAY_KEY]: currentByDay });
  await chrome.runtime.sendMessage({ type: MSG_INVALIDATE_ANALYTICS_CACHE });
  showNotification(`Imported ${daysToTake.size} day(s)`);
  window.dispatchEvent(new CustomEvent(IMPORT_COMPLETE));
}

let pendingImport = null;

async function handleBgImport(json) {
  if ((json.version !== 1 && json.version !== 2) || !json.data || typeof json.data !== 'object') {
    showNotification('Unrecognized BiteGuard format');
    return;
  }
  const importByDay = json.data[ANALYTICS_DAY_KEY] || {};
  const importByHour = json.data[ANALYTICS_HOUR_KEY] || {};
  const importSubpagesByDay = json.data[SUBPAGES_DAY_KEY] || {};
  const importSubpagesByHour = json.data[SUBPAGES_HOUR_KEY] || {};
  normalizeAnalyticsBuckets(importByDay);
  normalizeAnalyticsBuckets(importByHour);
  normalizeSubpageBuckets(importSubpagesByDay);
  normalizeSubpageBuckets(importSubpagesByHour);

  const {
    [ANALYTICS_DAY_KEY]: analyticsByDay = {},
    [ANALYTICS_HOUR_KEY]: analyticsByHour = {},
    [SUBPAGES_DAY_KEY]: subpagesByDay = {},
    [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
  } = await chrome.storage.local.get([ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY]);

  const conflicts = Object.keys(importByDay).filter((d) => analyticsByDay[d]).sort();

  if (conflicts.length === 0) {
    await applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, analyticsByDay, analyticsByHour, subpagesByDay, subpagesByHour, new Set());
    return;
  }

  pendingImport = { importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay: analyticsByDay, currentByHour: analyticsByHour, currentSubpagesByDay: subpagesByDay, currentSubpagesByHour: subpagesByHour, conflicts };
  showConflictView(conflicts);
}

async function applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, daysToReplace) {
  const daysToTake = new Set();
  for (const d of Object.keys(importByDay)) {
    if (!currentByDay[d] || daysToReplace.has(d)) daysToTake.add(d);
  }

  for (const d of daysToTake) {
    currentByDay[d] = importByDay[d];
  }

  for (const d of daysToTake) {
    const prefix = `${d}T`;
    for (const hk of Object.keys(currentByHour)) {
      if (hk.startsWith(prefix)) delete currentByHour[hk];
    }
    for (const [hk, sites] of Object.entries(importByHour)) {
      if (hk.startsWith(prefix)) currentByHour[hk] = sites;
    }
  }

  for (const d of daysToTake) {
    if (importSubpagesByDay[d]) currentSubpagesByDay[d] = importSubpagesByDay[d];
  }

  for (const d of daysToTake) {
    const prefix = `${d}T`;
    for (const hk of Object.keys(currentSubpagesByHour)) {
      if (hk.startsWith(prefix)) delete currentSubpagesByHour[hk];
    }
    for (const [hk, sites] of Object.entries(importSubpagesByHour)) {
      if (hk.startsWith(prefix)) currentSubpagesByHour[hk] = sites;
    }
  }

  await chrome.storage.local.set({
    [ANALYTICS_DAY_KEY]: currentByDay,
    [ANALYTICS_HOUR_KEY]: currentByHour,
    [SUBPAGES_DAY_KEY]: currentSubpagesByDay,
    [SUBPAGES_HOUR_KEY]: currentSubpagesByHour,
  });
  await chrome.runtime.sendMessage({ type: MSG_INVALIDATE_ANALYTICS_CACHE });
  showNotification(`Imported ${daysToTake.size} day(s)`);
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
    const { importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour } = pendingImport;
    hideConflictView();
    await applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, new Set());
  }
});

conflictReplace.addEventListener('click', async () => {
  if (pendingImport.isTt) {
    const { importData, currentByDay, conflicts } = pendingImport;
    hideConflictView();
    await applyTtImport(importData, currentByDay, new Set(conflicts));
  } else {
    const { importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, conflicts } = pendingImport;
    hideConflictView();
    await applyBgImport(importByDay, importByHour, importSubpagesByDay, importSubpagesByHour, currentByDay, currentByHour, currentSubpagesByDay, currentSubpagesByHour, new Set(conflicts));
  }
});
