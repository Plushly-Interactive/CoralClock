const importBtn = document.querySelector('#import-btn');
const importInput = document.querySelector('#import-input');
const modalOverlay = document.querySelector('#io-modal-overlay');
const modalClose = document.querySelector('#io-modal-close');
const ttImportBtn = document.querySelector('#tt-import-btn');
const ttStatus = document.querySelector('#tt-status');
const bgExportBtn = document.querySelector('#bg-export-btn');
const bgStatus = document.querySelector('#bg-status');

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

let activeStatusEl = null;
function setStatus(el, text) {
  activeStatusEl = el;
  el.textContent = text;
}

bgExportBtn.addEventListener('click', async () => {
  bgStatus.textContent = '';
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

  bgStatus.textContent = `Exported to "${filename}"`;
});

ttImportBtn.addEventListener('click', () => {
  activeStatusEl = ttStatus;
  ttStatus.textContent = '';
  importInput.click();
});

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;

  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    setStatus(activeStatusEl, 'Invalid file');
    return;
  }

  if (!Array.isArray(json.__stat__)) {
    setStatus(activeStatusEl, 'Unrecognized format');
    return;
  }

  const data = {};
  for (const { host, date, focus, time } of json.__stat__) {
    if (!host || !date || focus == null) continue;
    const dayKey = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    data[dayKey] ??= {};
    data[dayKey][host] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    data[dayKey][host].activeMs += focus;
    data[dayKey][host].visits += time ?? 0;
  }

  const { analyticsByDay = {} } = await chrome.storage.local.get('analyticsByDay');
  for (const [day, sites] of Object.entries(data)) {
    analyticsByDay[day] ??= {};
    for (const [siteId, entry] of Object.entries(sites)) {
      if (analyticsByDay[day][siteId]) {
        analyticsByDay[day][siteId].activeMs += entry.activeMs;
        analyticsByDay[day][siteId].visits += entry.visits;
      } else {
        analyticsByDay[day][siteId] = entry;
      }
    }
  }
  await chrome.storage.local.set({ analyticsByDay });
  await chrome.runtime.sendMessage({ type: 'invalidateAnalyticsCache' });
  importInput.value = '';
  setStatus(activeStatusEl, 'Imported!');
  window.dispatchEvent(new CustomEvent('importcomplete'));
});
