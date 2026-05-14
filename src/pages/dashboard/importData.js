import { resolveSite } from '../../background/siteResolution.js';

const TT_VERSION = '4.2.1';

const notification = document.querySelector('#notification');

function showNotification(message) {
  notification.textContent = message;
  notification.hidden = false;
  setTimeout(() => {
    notification.hidden = true;
  }, 3000);
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
const ioColumns = document.querySelector('#io-columns');
const conflictView = document.querySelector('#io-conflict-view');
const conflictList = document.querySelector('#io-conflict-list');
const conflictCancel = document.querySelector('#io-conflict-cancel');
const conflictKeep = document.querySelector('#io-conflict-keep');
const conflictReplace = document.querySelector('#io-conflict-replace');

function openModal() {
  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

importBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.hidden) closeModal();
});

bgExportBtn.addEventListener('click', async () => {
  const { analyticsByDay = {}, analyticsByHour = {} } =
    await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour']);

  const payload = {
    format: 'biteguard',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { analyticsByDay, analyticsByHour },
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
  const { analyticsByDay = {} } = await chrome.storage.local.get('analyticsByDay');

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
    const siteId = resolveSite(host).siteId;
    data[dayKey] ??= {};
    data[dayKey][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    data[dayKey][siteId].activeMs += focus;
    data[dayKey][siteId].visits += time ?? 0;
  }

  const { analyticsByDay = {} } = await chrome.storage.local.get('analyticsByDay');

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

  await chrome.storage.local.set({ analyticsByDay: currentByDay });
  await chrome.runtime.sendMessage({ type: 'invalidateAnalyticsCache' });
  showNotification(`Imported ${daysToTake.size} day(s)`);
  window.dispatchEvent(new CustomEvent('importcomplete'));
}

let pendingImport = null;

async function handleBgImport(json) {
  if (json.version !== 1 || !json.data || typeof json.data !== 'object') {
    showNotification('Unrecognized BiteGuard format');
    return;
  }
  const importByDay = json.data.analyticsByDay || {};
  const importByHour = json.data.analyticsByHour || {};

  const { analyticsByDay = {}, analyticsByHour = {} } =
    await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour']);

  const conflicts = Object.keys(importByDay).filter((d) => analyticsByDay[d]).sort();

  if (conflicts.length === 0) {
    await applyBgImport(importByDay, importByHour, analyticsByDay, analyticsByHour, new Set());
    return;
  }

  pendingImport = { importByDay, importByHour, currentByDay: analyticsByDay, currentByHour: analyticsByHour, conflicts };
  showConflictView(conflicts);
}

async function applyBgImport(importByDay, importByHour, currentByDay, currentByHour, daysToReplace) {
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

  await chrome.storage.local.set({ analyticsByDay: currentByDay, analyticsByHour: currentByHour });
  await chrome.runtime.sendMessage({ type: 'invalidateAnalyticsCache' });
  showNotification(`Imported ${daysToTake.size} day(s)`);
  window.dispatchEvent(new CustomEvent('importcomplete'));
}

function showConflictView(conflicts) {
  conflictList.replaceChildren();
  for (const day of conflicts) {
    const li = document.createElement('li');
    li.textContent = day;
    conflictList.appendChild(li);
  }
  ioColumns.hidden = true;
  conflictView.hidden = false;
}

function hideConflictView() {
  conflictView.hidden = true;
  ioColumns.hidden = false;
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
    const { importByDay, importByHour, currentByDay, currentByHour } = pendingImport;
    hideConflictView();
    await applyBgImport(importByDay, importByHour, currentByDay, currentByHour, new Set());
  }
});

conflictReplace.addEventListener('click', async () => {
  if (pendingImport.isTt) {
    const { importData, currentByDay, conflicts } = pendingImport;
    hideConflictView();
    await applyTtImport(importData, currentByDay, new Set(conflicts));
  } else {
    const { importByDay, importByHour, currentByDay, currentByHour, conflicts } = pendingImport;
    hideConflictView();
    await applyBgImport(importByDay, importByHour, currentByDay, currentByHour, new Set(conflicts));
  }
});
