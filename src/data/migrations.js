import { SITES_DAY_KEY, SITES_HOUR_KEY } from '../background/siteTracking.js';
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

function rewriteSites(buckets) {
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
  // analyticsByDay[day][siteId]   = { ms, visits }   (legacy key, later renamed sitesByDay)
  // analyticsByHour[hour][siteId] = { ms, visits }   (legacy key, later renamed sitesByHour)
  // timeRecords[siteId]           = number (active ms)
  async () => {},

  // v1 → v2: add audio tracking fields, rename ms → activeMs
  // analyticsByDay[day][siteId]   = { activeMs, visits, audioMs, overlapMs }
  // analyticsByHour[hour][siteId] = { activeMs, visits, audioMs, overlapMs }
  async () => {
    // Literal legacy keys: this migration predates the sitesBy* rename (v4 → v5).
    const {
      analyticsByDay = {},
      analyticsByHour = {},
    } = await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour']);
    for (const sites of Object.values(analyticsByDay))
      for (const [id, d] of Object.entries(sites))
        sites[id] = { activeMs: d.ms ?? d.activeMs ?? 0, audioMs: d.audioMs ?? 0, overlapMs: d.overlapMs ?? 0, visits: d.visits ?? 0 };
    for (const sites of Object.values(analyticsByHour))
      for (const [id, d] of Object.entries(sites))
        sites[id] = { activeMs: d.ms ?? d.activeMs ?? 0, audioMs: d.audioMs ?? 0, overlapMs: d.overlapMs ?? 0, visits: d.visits ?? 0 };
    await chrome.storage.local.set({ analyticsByDay, analyticsByHour });
  },

  // v2 → v3: rewrite analytics keys from eTLD+1 to hostname (www. stripped)
  async () => {
    // Literal legacy keys: this migration predates the sitesBy* rename (v4 → v5).
    const {
      analyticsByDay = {},
      analyticsByHour = {},
      [SUBPAGES_DAY_KEY]: subpagesByDay = {},
      [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
    } = await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour', SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY]);
    rewriteSites(analyticsByDay);
    rewriteSites(analyticsByHour);
    rewriteSubpages(subpagesByDay);
    rewriteSubpages(subpagesByHour);
    await chrome.storage.local.set({
      analyticsByDay,
      analyticsByHour,
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

  // v4 → v5: rename storage keys analyticsByDay/analyticsByHour → sitesByDay/sitesByHour
  async () => {
    const { analyticsByDay, analyticsByHour } = await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour']);
    const set = {};
    if (analyticsByDay !== undefined) set[SITES_DAY_KEY] = analyticsByDay;
    if (analyticsByHour !== undefined) set[SITES_HOUR_KEY] = analyticsByHour;
    if (Object.keys(set).length) await chrome.storage.local.set(set);
    await chrome.storage.local.remove(['analyticsByDay', 'analyticsByHour']);
  },
];

export async function ensureStorageVersion() {
  const { storageVersion = 0 } = await chrome.storage.local.get('storageVersion');
  for (let i = storageVersion; i < migrations.length; i++) {
    await migrations[i]();
    await chrome.storage.local.set({ storageVersion: i + 1 });
  }
}
