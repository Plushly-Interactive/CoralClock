import { resolveSite } from './siteResolution.js';
import { localDayKey, localHourKey } from './utils.js';

const siteStates = new Map();
const windowToSite = new Map();
const pending = new Map();
const pendingVisits = new Map();

export function siteIdFromUrl(url) {
  if (!url?.startsWith('http')) return null;
  return resolveSite(new URL(url).hostname).siteId;
}

function addWindowSite(windowId, siteId) {
  let s = siteStates.get(siteId);
  if (!s) {
    s = { activeWindowIds: new Set(), startedAt: 0, wasActive: false };
    siteStates.set(siteId, s);
  }
  s.activeWindowIds.add(windowId);
  windowToSite.set(windowId, siteId);
  if (!s.wasActive) {
    s.startedAt = Date.now();
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

function recordElapsed(siteId) {
  const s = siteStates.get(siteId);
  if (!s || !s.wasActive) return;
  const now = Date.now();
  if (now > s.startedAt) {
    const ranges = pending.get(siteId) ?? [];
    ranges.push([s.startedAt, now]);
    pending.set(siteId, ranges);
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
    addWindowSite(windowId, newSiteId);
    pendingVisits.set(newSiteId, (pendingVisits.get(newSiteId) ?? 0) + 1);
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
}

export async function saveSnapshot() {
  const sites = [...new Set(windowToSite.values())].filter(Boolean);
  if (sites.length > 0) {
    await chrome.storage.local.set({ _trackingSnapshot: { sites, at: Date.now() } });
  } else {
    await chrome.storage.local.remove('_trackingSnapshot');
  }
}

let _recovered = false;
export async function recoverFromSnapshot() {
  if (_recovered) return;
  _recovered = true;
  const { _trackingSnapshot: snap } = await chrome.storage.local.get('_trackingSnapshot');
  if (!snap) return;
  const now = Date.now();
  for (const siteId of snap.sites) {
    const ranges = pending.get(siteId) ?? [];
    ranges.push([snap.at, now]);
    pending.set(siteId, ranges);
  }
}

export async function flushToStorage() {
  for (const siteId of siteStates.keys()) recordElapsed(siteId);
  if (pending.size === 0 && pendingVisits.size === 0) return;
  const { analyticsByDay = {}, analyticsByHour = {} } =
    await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour']);
  for (const [siteId, ranges] of pending) {
    for (const [from, to] of ranges) {
      for (const { hourKey, dayKey, ms } of splitByHour(from, to)) {
        analyticsByDay[dayKey] ??= {};
        analyticsByDay[dayKey][siteId] ??= { ms: 0, visits: 0 };
        analyticsByDay[dayKey][siteId].ms += ms;
        analyticsByHour[hourKey] ??= {};
        analyticsByHour[hourKey][siteId] ??= { ms: 0, visits: 0 };
        analyticsByHour[hourKey][siteId].ms += ms;
      }
    }
  }
  const now = Date.now();
  const day = localDayKey(now);
  const hour = localHourKey(now);
  for (const [siteId, count] of pendingVisits) {
    analyticsByDay[day] ??= {};
    analyticsByDay[day][siteId] ??= { ms: 0, visits: 0 };
    analyticsByDay[day][siteId].visits += count;
    analyticsByHour[hour] ??= {};
    analyticsByHour[hour][siteId] ??= { ms: 0, visits: 0 };
    analyticsByHour[hour][siteId].visits += count;
  }
  pending.clear();
  pendingVisits.clear();
  await chrome.storage.local.set({ analyticsByDay, analyticsByHour });
}
