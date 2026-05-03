const importBtn = document.querySelector('#import-btn');
const importInput = document.querySelector('#import-input');

importBtn.addEventListener('click', () => importInput.click());

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  if (!file) return;

  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    setImportStatus('Invalid file');
    return;
  }

  if (!Array.isArray(json.__stat__)) {
    setImportStatus('Unrecognized format');
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
  setImportStatus('Imported!');
  window.dispatchEvent(new CustomEvent('importcomplete'));
});

function setImportStatus(text) {
  importBtn.textContent = text;
  setTimeout(() => { importBtn.textContent = 'Import'; }, 2000);
}
