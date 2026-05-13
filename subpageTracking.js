import { createRangeTracker } from './trackingUtils.js';
import { siteIdFromUrl, pathFromUrl } from './siteResolution.js';
import { localDayKey, localHourKey, splitByHour } from './utils.js';

const tracker = createRangeTracker();

function makeKey(siteId, path) {
  return `${siteId}\n${path}`;
}

function keyFromUrl(url) {
  const siteId = siteIdFromUrl(url);
  const path = pathFromUrl(url);
  return siteId && path ? makeKey(siteId, path) : null;
}

export function setWindowPath(windowId, siteId, path) {
  tracker.setWindow(windowId, siteId && path ? makeKey(siteId, path) : null);
}

export function removeWindowPath(windowId) {
  tracker.removeWindow(windowId);
}

export function addAudibleTabPath(tabId, siteId, path, countVisit = true) {
  if (!siteId || !path) return;
  tracker.addAudibleTab(tabId, makeKey(siteId, path), countVisit);
}

export function removeAudibleTabPath(tabId) {
  tracker.removeAudibleTab(tabId);
}

export async function initSubpageTracking() {
  const windows = await chrome.windows.getAll({ populate: true });
  for (const w of windows) {
    if (w.state === 'minimized') continue;
    const tab = w.tabs?.find(t => t.active);
    const key = keyFromUrl(tab?.url);
    if (key) tracker.addWindow(w.id, key);
  }
  const tabs = await chrome.tabs.query({ audible: true });
  for (const tab of tabs) {
    if (tab.mutedInfo?.muted) continue;
    const key = keyFromUrl(tab.url);
    if (key) tracker.addAudibleTab(tab.id, key, false);
  }
}

export async function reconcileSubpagePaths() {
  const windows = await chrome.windows.getAll();
  const liveById = new Map(windows.map(w => [w.id, w]));
  for (const id of tracker.getTrackedWindowIds()) {
    const w = liveById.get(id);
    if (!w || w.state === 'minimized') tracker.removeWindow(id);
  }
  for (const w of windows) {
    if (w.state === 'minimized') continue;
    if (tracker.isWindowTracked(w.id)) continue;
    const [tab] = await chrome.tabs.query({ windowId: w.id, active: true });
    const key = keyFromUrl(tab?.url);
    if (key) tracker.addWindow(w.id, key);
  }

  const audibleTabs = await chrome.tabs.query({ audible: true });
  const liveAudibleIds = new Set(
    audibleTabs.filter(t => !t.mutedInfo?.muted).map(t => t.id)
  );
  for (const tabId of tracker.getTrackedAudibleTabIds()) {
    if (!liveAudibleIds.has(tabId)) tracker.removeAudibleTab(tabId);
  }
  for (const tab of audibleTabs) {
    if (tab.mutedInfo?.muted) continue;
    const key = keyFromUrl(tab.url);
    if (key) tracker.addAudibleTab(tab.id, key, false);
  }
}

export async function saveSubpageSnapshot(now = Date.now()) {
  const activeKeys = tracker.getActiveKeys();
  const audioKeys = tracker.getAudibleKeys();
  if (activeKeys.length > 0 || audioKeys.length > 0) {
    await chrome.storage.local.set({ _subpageSnapshot: { activeKeys, audioKeys, at: now } });
  } else {
    await chrome.storage.local.remove('_subpageSnapshot');
  }
}

const SNAPSHOT_MAX_GAP_MS = 5 * 60 * 1000;

let _recovered = false;
export async function recoverSubpagesFromSnapshot(clipAt) {
  if (_recovered) return;
  _recovered = true;
  const { _subpageSnapshot: snap } = await chrome.storage.local.get('_subpageSnapshot');
  if (!snap) return;
  const now = Date.now();
  if (now - snap.at > SNAPSHOT_MAX_GAP_MS) {
    await chrome.storage.local.remove('_subpageSnapshot');
    return;
  }
  const endAt = Math.min(clipAt ?? now, now);
  const activeKeys = snap.activeKeys ?? [];
  const audioKeys = snap.audioKeys ?? [];
  const activeKeySet = new Set(activeKeys);
  for (const key of activeKeys) {
    tracker.pushRange('active', key, [snap.at, endAt]);
  }
  for (const key of audioKeys) {
    tracker.pushRange('audio', key, [snap.at, endAt]);
    if (activeKeySet.has(key)) {
      tracker.pushRange('overlap', key, [snap.at, endAt]);
    }
  }
}

export async function flushSubpagesToStorage(now = Date.now()) {
  tracker.flushAllElapsed(now);
  const { active, audio, overlap, visits } = tracker.pending;
  if (active.size === 0 && audio.size === 0 && overlap.size === 0 && visits.size === 0) return;
  const { subpagesByDay = {}, subpagesByHour = {} } =
    await chrome.storage.local.get(['subpagesByDay', 'subpagesByHour']);

  function ensureEntry(bucket, siteId, path) {
    bucket[siteId] ??= {};
    bucket[siteId][path] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    return bucket[siteId][path];
  }

  function addRanges(map, field) {
    for (const [key, ranges] of map) {
      const [siteId, path] = key.split('\n');
      for (const [from, to] of ranges) {
        for (const { hourKey, dayKey, ms } of splitByHour(from, to)) {
          subpagesByHour[hourKey] ??= {};
          const hourEntry = ensureEntry(subpagesByHour[hourKey], siteId, path);
          const before = hourEntry[field];
          hourEntry[field] = Math.min(before + ms, 3600000);
          const added = hourEntry[field] - before;
          subpagesByDay[dayKey] ??= {};
          ensureEntry(subpagesByDay[dayKey], siteId, path)[field] += added;
        }
      }
    }
  }

  addRanges(active, 'activeMs');
  addRanges(audio, 'audioMs');
  addRanges(overlap, 'overlapMs');

  const day = localDayKey(now);
  const hour = localHourKey(now);
  for (const [key, count] of visits) {
    const [siteId, path] = key.split('\n');
    subpagesByDay[day] ??= {};
    ensureEntry(subpagesByDay[day], siteId, path).visits += count;
    subpagesByHour[hour] ??= {};
    ensureEntry(subpagesByHour[hour], siteId, path).visits += count;
  }

  tracker.clearPending();
  await chrome.storage.local.set({ subpagesByDay, subpagesByHour });
}
