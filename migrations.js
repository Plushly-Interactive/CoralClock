const migrations = [
  // v0 → v1: initial schema
  // analyticsByDay[day][siteId]   = { ms, visits }
  // analyticsByHour[hour][siteId] = { ms, visits }
  // timeRecords[siteId]           = number (active ms)
  async () => {},

  // v1 → v2: add audio tracking fields
  // analyticsByDay[day][siteId]   = { ms, visits, audioMs, overlapMs }
  // analyticsByHour[hour][siteId] = { ms, visits, audioMs, overlapMs }
  // timeRecords[siteId]           = { ms, audioMs, overlapMs }
  // async () => {
  //   const { analyticsByDay = {}, analyticsByHour = {}, timeRecords = {} } =
  //     await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour', 'timeRecords']);
  //   for (const sites of Object.values(analyticsByDay))
  //     for (const [id, d] of Object.entries(sites))
  //       if (!('audioMs' in d)) sites[id] = { ...d, audioMs: 0, overlapMs: 0 };
  //   for (const sites of Object.values(analyticsByHour))
  //     for (const [id, d] of Object.entries(sites))
  //       if (!('audioMs' in d)) sites[id] = { ...d, audioMs: 0, overlapMs: 0 };
  //   for (const [id, val] of Object.entries(timeRecords))
  //     if (typeof val === 'number') timeRecords[id] = { ms: val, audioMs: 0, overlapMs: 0 };
  //   await chrome.storage.local.set({ analyticsByDay, analyticsByHour, timeRecords });
  // },
];

export async function ensureStorageVersion() {
  const { storageVersion = 0 } = await chrome.storage.local.get('storageVersion');
  for (let i = storageVersion; i < migrations.length; i++) {
    await migrations[i]();
    await chrome.storage.local.set({ storageVersion: i + 1 });
  }
}
