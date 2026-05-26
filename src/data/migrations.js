import { ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY } from '../background/siteTracking.js';
import { SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY } from '../background/subpageTracking.js';

function normalizeHost(key) {
  return key.startsWith('www.') ? key.slice(4) : key;
}

function sumCell(a, b) {
  return {
    activeMs: (a.activeMs ?? 0) + (b.activeMs ?? 0),
    audioMs: (a.audioMs ?? 0) + (b.audioMs ?? 0),
    overlapMs: (a.overlapMs ?? 0) + (b.overlapMs ?? 0),
    visits: (a.visits ?? 0) + (b.visits ?? 0),
  };
}

function rewriteAnalytics(buckets) {
  for (const [bucketKey, sites] of Object.entries(buckets)) {
    const next = {};
    for (const [siteId, cell] of Object.entries(sites)) {
      const host = normalizeHost(siteId);
      next[host] = next[host] ? sumCell(next[host], cell) : cell;
    }
    buckets[bucketKey] = next;
  }
}

function rewriteSubpages(buckets) {
  for (const [bucketKey, sites] of Object.entries(buckets)) {
    const next = {};
    for (const [siteId, paths] of Object.entries(sites)) {
      const host = normalizeHost(siteId);
      if (!next[host]) {
        next[host] = paths;
        continue;
      }
      const merged = next[host];
      for (const [p, cell] of Object.entries(paths))
        merged[p] = merged[p] ? sumCell(merged[p], cell) : cell;
    }
    buckets[bucketKey] = next;
  }
}

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

  // v2 → v3: rewrite analytics keys from eTLD+1 to hostname (www. stripped)
  async () => {
    const {
      [ANALYTICS_DAY_KEY]: analyticsByDay = {},
      [ANALYTICS_HOUR_KEY]: analyticsByHour = {},
      [SUBPAGES_DAY_KEY]: subpagesByDay = {},
      [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
    } = await chrome.storage.local.get([ANALYTICS_DAY_KEY, ANALYTICS_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY]);
    rewriteAnalytics(analyticsByDay);
    rewriteAnalytics(analyticsByHour);
    rewriteSubpages(subpagesByDay);
    rewriteSubpages(subpagesByHour);
    await chrome.storage.local.set({
      [ANALYTICS_DAY_KEY]: analyticsByDay,
      [ANALYTICS_HOUR_KEY]: analyticsByHour,
      [SUBPAGES_DAY_KEY]: subpagesByDay,
      [SUBPAGES_HOUR_KEY]: subpagesByHour,
    });
  },

  // v3 → v4: add matchType + mode to enforcement rules
  // rules[i] = { id, target, matchType, limit, limitUnit, period, enabled, mode }
  async () => {
    const { rules = [] } = await chrome.storage.local.get('rules');
    for (const r of rules) {
      r.matchType ??= 'host';
      r.mode ??= 'active';
    }
    await chrome.storage.local.set({ rules });
  },
];

export async function ensureStorageVersion() {
  const { storageVersion = 0 } = await chrome.storage.local.get('storageVersion');
  for (let i = storageVersion; i < migrations.length; i++) {
    await migrations[i]();
    await chrome.storage.local.set({ storageVersion: i + 1 });
  }
}
