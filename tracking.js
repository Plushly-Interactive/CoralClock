import { resolveSite } from './siteResolution.js';
import { localDayKey, localHourKey } from './utils.js';

const siteStates = new Map();
const windowToSite = new Map();
const audibleTabToSite = new Map();
const pendingActive = new Map();
const pendingAudio = new Map();
const pendingOverlap = new Map();
const pendingVisits = new Map();

export function siteIdFromUrl(url) {
  if (!url?.startsWith('http')) return null;
  return resolveSite(new URL(url).hostname).siteId;
}

function addWindowSite(windowId, siteId) {
  let s = siteStates.get(siteId);
  if (!s) {
    s = { activeWindowIds: new Set(), audibleTabIds: new Set(), startedAt: 0, wasActive: false, wasAudible: false };
    siteStates.set(siteId, s);
  }
  s.activeWindowIds.add(windowId);
  windowToSite.set(windowId, siteId);
  if (!s.wasActive) {
    if (s.wasAudible) recordElapsed(siteId); // flush audible-only period, reset startedAt
    else s.startedAt = Date.now();
    s.wasActive = true;
  }
}

export function removeWindowSite(windowId) {
  const siteId = windowToSite.get(windowId);
  if (!siteId) return;
  windowToSite.delete(windowId);
  const s = siteStates.get(siteId);
  if (!s) return;
  s.activeWindowIds.delete(windowId);
  if (s.activeWindowIds.size === 0 && s.wasActive) {
    recordElapsed(siteId);
    s.wasActive = false;
  }
}

export function addAudibleTab(tabId, siteId, countVisit = true) {
  if (!siteId) return;
  const oldSiteId = audibleTabToSite.get(tabId);
  if (oldSiteId === siteId) return;
  if (oldSiteId) removeAudibleTab(tabId);
  audibleTabToSite.set(tabId, siteId);
  let s = siteStates.get(siteId);
  if (!s) {
    s = { activeWindowIds: new Set(), audibleTabIds: new Set(), startedAt: 0, wasActive: false, wasAudible: false };
    siteStates.set(siteId, s);
  }
  const wasTracked = s.wasActive || s.wasAudible;
  recordElapsed(siteId); // flush active-only period if any, reset startedAt
  s.audibleTabIds.add(tabId);
  s.wasAudible = true;
  if (!wasTracked) {
    s.startedAt = Date.now();
    if (countVisit) pendingVisits.set(siteId, (pendingVisits.get(siteId) ?? 0) + 1);
  }
}

export function removeAudibleTab(tabId) {
  const siteId = audibleTabToSite.get(tabId);
  if (!siteId) return;
  audibleTabToSite.delete(tabId);
  const s = siteStates.get(siteId);
  if (!s) return;
  s.audibleTabIds.delete(tabId);
  if (s.audibleTabIds.size === 0 && s.wasAudible) {
    recordElapsed(siteId);
    s.wasAudible = false;
  }
}

function recordElapsed(siteId) {
  const s = siteStates.get(siteId);
  if (!s || (!s.wasActive && !s.wasAudible)) return;
  const now = Date.now();
  if (now > s.startedAt) {
    const range = [s.startedAt, now];
    if (s.wasActive) {
      const ranges = pendingActive.get(siteId) ?? [];
      ranges.push(range);
      pendingActive.set(siteId, ranges);
    }
    if (s.wasAudible) {
      const ranges = pendingAudio.get(siteId) ?? [];
      ranges.push(range);
      pendingAudio.set(siteId, ranges);
    }
    if (s.wasActive && s.wasAudible) {
      const ranges = pendingOverlap.get(siteId) ?? [];
      ranges.push(range);
      pendingOverlap.set(siteId, ranges);
    }
  }
  s.startedAt = Date.now();
}

function splitByHour(from, to) {
  const segs = [];
  let t = from;
  while (t < to) {
    const nextHour = new Date(t);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const end = Math.min(nextHour.getTime(), to);
    segs.push({ hourKey: localHourKey(t), dayKey: localDayKey(t), ms: end - t });
    t = end;
  }
  return segs;
}

// Returns newSiteId if the site changed, undefined if nothing changed.
export function setWindowSite(windowId, newSiteId) {
  const oldSiteId = windowToSite.get(windowId);
  if (oldSiteId === newSiteId) return undefined;
  if (!oldSiteId && !newSiteId) return undefined;
  if (oldSiteId) removeWindowSite(windowId);
  if (newSiteId) {
    const existing = siteStates.get(newSiteId);
    const wasTracked = !!existing && (existing.wasActive || existing.wasAudible);
    addWindowSite(windowId, newSiteId);
    if (!wasTracked) pendingVisits.set(newSiteId, (pendingVisits.get(newSiteId) ?? 0) + 1);
  }
  return newSiteId;
}

export async function initTracking() {
  const windows = await chrome.windows.getAll({ populate: true });
  for (const w of windows) {
    if (w.state === 'minimized') continue;
    const tab = w.tabs?.find(t => t.active);
    const siteId = siteIdFromUrl(tab?.url);
    if (siteId) addWindowSite(w.id, siteId);
  }
  const tabs = await chrome.tabs.query({ audible: true });
  for (const tab of tabs) {
    if (tab.mutedInfo?.muted) continue;
    const siteId = siteIdFromUrl(tab.url);
    if (siteId) addAudibleTab(tab.id, siteId, false);
  }
}

export async function reconcileWindows() {
  const windows = await chrome.windows.getAll();
  const liveById = new Map(windows.map(w => [w.id, w]));
  for (const id of [...windowToSite.keys()]) {
    const w = liveById.get(id);
    if (!w || w.state === 'minimized') removeWindowSite(id);
  }
  for (const w of windows) {
    if (w.state === 'minimized') continue;
    if (windowToSite.has(w.id)) continue;
    const [tab] = await chrome.tabs.query({ windowId: w.id, active: true });
    const siteId = siteIdFromUrl(tab?.url);
    if (siteId) addWindowSite(w.id, siteId);
  }

  const audibleTabs = await chrome.tabs.query({ audible: true });
  const liveAudibleIds = new Set(
    audibleTabs.filter(t => !t.mutedInfo?.muted).map(t => t.id)
  );
  for (const tabId of [...audibleTabToSite.keys()]) {
    if (!liveAudibleIds.has(tabId)) removeAudibleTab(tabId);
  }
  for (const tab of audibleTabs) {
    if (tab.mutedInfo?.muted) continue;
    const siteId = siteIdFromUrl(tab.url);
    if (siteId) addAudibleTab(tab.id, siteId, false);
  }
}

export async function saveSnapshot() {
  const activeSites = [...new Set(windowToSite.values())].filter(Boolean);
  const audioSites = [...new Set(audibleTabToSite.values())].filter(Boolean);
  if (activeSites.length > 0 || audioSites.length > 0) {
    await chrome.storage.local.set({ _trackingSnapshot: { activeSites, audioSites, at: Date.now() } });
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
    const ranges = pendingActive.get(siteId) ?? [];
    ranges.push([snap.at, endAt]);
    pendingActive.set(siteId, ranges);
  }
  for (const siteId of audioSites) {
    const ranges = pendingAudio.get(siteId) ?? [];
    ranges.push([snap.at, endAt]);
    pendingAudio.set(siteId, ranges);
    if (activeSiteSet.has(siteId)) {
      const overlapRanges = pendingOverlap.get(siteId) ?? [];
      overlapRanges.push([snap.at, endAt]);
      pendingOverlap.set(siteId, overlapRanges);
    }
  }
}

export async function flushToStorage() {
  for (const siteId of siteStates.keys()) recordElapsed(siteId);
  if (pendingActive.size === 0 && pendingAudio.size === 0 && pendingOverlap.size === 0 && pendingVisits.size === 0) return;
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

  addRanges(pendingActive, 'activeMs');
  addRanges(pendingAudio, 'audioMs');
  addRanges(pendingOverlap, 'overlapMs');

  const now = Date.now();
  const day = localDayKey(now);
  const hour = localHourKey(now);
  for (const [siteId, count] of pendingVisits) {
    analyticsByDay[day] ??= {};
    analyticsByDay[day][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    analyticsByDay[day][siteId].visits += count;
    analyticsByHour[hour] ??= {};
    analyticsByHour[hour][siteId] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    analyticsByHour[hour][siteId].visits += count;
  }

  pendingActive.clear();
  pendingAudio.clear();
  pendingOverlap.clear();
  pendingVisits.clear();
  await chrome.storage.local.set({ analyticsByDay, analyticsByHour });
}
