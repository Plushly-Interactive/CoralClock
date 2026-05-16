import { ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY } from '../background/siteTracking.js';

const migrations = [
  // v0 → v1: initial schema
  // analyticsByDay[day][siteId]   = { ms, visits }
  // analyticsByHour[hour][siteId] = { ms, visits }
  // timeRecords[siteId]           = number (active ms)
  async () => {},

  // v1 → v2: add audio tracking fields, rename ms → activeMs
  // analyticsByDay[day][siteId]   = { activeMs, visits, audioMs, overlapMs }
  // analyticsByHour[hour][siteId] = { activeMs, visits, audioMs, overlapMs }
  async () => {
    const {
      [ANALYTICS_DAY_KEY]: analyticsByDay = {},
      [ANALYTICS_HOUR_KEY]: analyticsByHour = {},
    } = await chrome.storage.local.get([ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY]);
    for (const sites of Object.values(analyticsByDay))
      for (const [id, d] of Object.entries(sites))
        sites[id] = { activeMs: d.ms ?? d.activeMs ?? 0, audioMs: d.audioMs ?? 0, overlapMs: d.overlapMs ?? 0, visits: d.visits ?? 0 };
    for (const sites of Object.values(analyticsByHour))
      for (const [id, d] of Object.entries(sites))
        sites[id] = { activeMs: d.ms ?? d.activeMs ?? 0, audioMs: d.audioMs ?? 0, overlapMs: d.overlapMs ?? 0, visits: d.visits ?? 0 };
    await chrome.storage.local.set({ [ANALYTICS_DAY_KEY]: analyticsByDay, [ANALYTICS_HOUR_KEY]: analyticsByHour });
  },
];

export async function ensureStorageVersion() {
  const { storageVersion = 0 } = await chrome.storage.local.get('storageVersion');
  for (let i = storageVersion; i < migrations.length; i++) {
    await migrations[i]();
    await chrome.storage.local.set({ storageVersion: i + 1 });
  }
}
