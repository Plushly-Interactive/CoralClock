import { siteIdFromUrl } from './siteResolution.js';
import { localDayKey, localHourKey, splitByHour } from './utils.js';
import { createRangeTracker } from './trackingUtils.js';

const tracker = createRangeTracker();

export function removeWindowSite(windowId) {
  tracker.removeWindow(windowId);
}

export function addAudibleTab(tabId, siteId, countVisit = true) {
  tracker.addAudibleTab(tabId, siteId, countVisit);
}

export function removeAudibleTab(tabId) {
  tracker.removeAudibleTab(tabId);
}

export function setWindowSite(windowId, newSiteId) {
  tracker.setWindow(windowId, newSiteId);
}

export async function initTracking() {
  const windows = await chrome.windows.getAll({ populate: true });
  for (const w of windows) {
    if (w.state === 'minimized') continue;
    const tab = w.tabs?.find(t => t.active);
    const siteId = siteIdFromUrl(tab?.url);
    if (siteId) tracker.addWindow(w.id, siteId);
  }
  const tabs = await chrome.tabs.query({ audible: true });
  for (const tab of tabs) {
    if (tab.mutedInfo?.muted) continue;
    const siteId = siteIdFromUrl(tab.url);
    if (siteId) tracker.addAudibleTab(tab.id, siteId, false);
  }
}

export async function reconcileWindows() {
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
    const siteId = siteIdFromUrl(tab?.url);
    if (siteId) tracker.addWindow(w.id, siteId);
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
    const siteId = siteIdFromUrl(tab.url);
    if (siteId) tracker.addAudibleTab(tab.id, siteId, false);
  }
}

export async function saveSnapshot(now = Date.now()) {
  const activeSites = tracker.getActiveKeys();
  const audioSites = tracker.getAudibleKeys();
  if (activeSites.length > 0 || audioSites.length > 0) {
    await chrome.storage.local.set({ _trackingSnapshot: { activeSites, audioSites, at: now } });
  } else {
    await chrome.storage.local.remove('_trackingSnapshot');
  }
}

const SNAPSHOT_MAX_GAP_MS = 5 * 60 * 1000;

let _recovered = false;
export async function recoverFromSnapshot(clipAt) {
  if (_recovered) return;
  _recovered = true;
  const { _trackingSnapshot: snap } = await chrome.storage.local.get('_trackingSnapshot');
  if (!snap) return;
  const now = Date.now();
  if (now - snap.at > SNAPSHOT_MAX_GAP_MS) {
    await chrome.storage.local.remove('_trackingSnapshot');
    return;
  }
  const endAt = Math.min(clipAt ?? now, now);
  // backward compat: old snapshots used `sites` for active windows only
  const activeSites = snap.activeSites ?? snap.sites ?? [];
  const audioSites = snap.audioSites ?? [];
  const activeSiteSet = new Set(activeSites);
  for (const siteId of activeSites) {
    tracker.pushRange('active', siteId, [snap.at, endAt]);
  }
  for (const siteId of audioSites) {
    tracker.pushRange('audio', siteId, [snap.at, endAt]);
    if (activeSiteSet.has(siteId)) {
      tracker.pushRange('overlap', siteId, [snap.at, endAt]);
    }
  }
}

export async function flushToStorage(now = Date.now()) {
  tracker.flushAllElapsed(now);
  const { active, audio, overlap, visits } = tracker.pending;
  if (active.size === 0 && audio.size === 0 && overlap.size === 0 && visits.size === 0) return;
  const { analyticsByDay = {}, analyticsByHour = {} } =
    await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour']);

  function addRanges(map, field) {
    for (const [siteId, ranges] of map) {
      for (const [from, to] of ranges) {
        for (const { hourKey, dayKey, ms } of splitByHour(from, to)) {
          analyticsByHour[hourKey] ??= {};
          analyticsByHour[hourKey][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
          const hourSite = analyticsByHour[hourKey][siteId];
          const before = hourSite[field];
          hourSite[field] = Math.min(before + ms, 3600000);
          const added = hourSite[field] - before;
          analyticsByDay[dayKey] ??= {};
          analyticsByDay[dayKey][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
          analyticsByDay[dayKey][siteId][field] += added;
        }
      }
    }
  }

  addRanges(active, 'activeMs');
  addRanges(audio, 'audioMs');
  addRanges(overlap, 'overlapMs');

  const day = localDayKey(now);
  const hour = localHourKey(now);
  for (const [siteId, count] of visits) {
    analyticsByDay[day] ??= {};
    analyticsByDay[day][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    analyticsByDay[day][siteId].visits += count;
    analyticsByHour[hour] ??= {};
    analyticsByHour[hour][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    analyticsByHour[hour][siteId].visits += count;
  }

  tracker.clearPending();
  await chrome.storage.local.set({ analyticsByDay, analyticsByHour });
}
