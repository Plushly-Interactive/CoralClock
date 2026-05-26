import { localDayKey, localHourKey, splitByHour } from '../shared/timeUtils.js';

const SNAPSHOT_MAX_GAP_MS = 5 * 60 * 1000;

export function createTrackingModule({
  urlToKey,
  dayStorageKey,
  hourStorageKey,
  snapshotStorageKey,
  getCell,
  recoverLegacy,
}) {
  const tracker = createRangeTracker();
  let _recovered = false;
  const parseSnapshot = recoverLegacy ?? (snap => ({
    activeKeys: snap.activeKeys ?? [],
    audioKeys: snap.audioKeys ?? [],
  }));

  async function init() {
    const windows = await chrome.windows.getAll({ populate: true });
    console.log('[BG-DBG] init: windows count=', windows.length);
    for (const w of windows) {
      if (w.state === 'minimized') { console.log('[BG-DBG] init: window', w.id, 'minimized, skip'); tracker.markMinimized(w.id); continue; }
      const tab = w.tabs?.find(t => t.active);
      const key = urlToKey(tab?.url);
      console.log('[BG-DBG] init: window', w.id, 'activeTab url=', tab?.url, '→ key=', key);
      if (key) tracker.addWindow(w.id, key);
    }
    const tabs = await chrome.tabs.query({ audible: true });
    for (const tab of tabs) {
      if (tab.mutedInfo?.muted) continue;
      const key = urlToKey(tab.url);
      if (key) tracker.addAudibleTab(tab.id, key, false);
    }
  }

  async function reconcile() {
    const windows = await chrome.windows.getAll();
    const liveById = new Map(windows.map(w => [w.id, w]));
    for (const id of tracker.getTrackedWindowIds()) {
      const w = liveById.get(id);
      if (!w || w.state === 'minimized') tracker.removeWindow(id, w?.state === 'minimized');
    }
    for (const w of windows) {
      if (w.state === 'minimized') continue;
      if (tracker.isWindowTracked(w.id)) continue;
      const [tab] = await chrome.tabs.query({ windowId: w.id, active: true });
      const key = urlToKey(tab?.url);
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
      const key = urlToKey(tab.url);
      if (key) tracker.addAudibleTab(tab.id, key, false);
    }
  }

  async function saveSnapshot(now = Date.now()) {
    const activeKeys = tracker.getActiveKeys();
    const audioKeys = tracker.getAudibleKeys();
    if (activeKeys.length > 0 || audioKeys.length > 0) {
      await chrome.storage.local.set({ [snapshotStorageKey]: { activeKeys, audioKeys, at: now } });
    } else {
      await chrome.storage.local.remove(snapshotStorageKey);
    }
  }

  async function recoverFromSnapshot(clipAt) {
    if (_recovered) return;
    _recovered = true;
    const stored = await chrome.storage.local.get(snapshotStorageKey);
    const snap = stored[snapshotStorageKey];
    if (!snap) return;
    const now = Date.now();
    if (now - snap.at > SNAPSHOT_MAX_GAP_MS) {
      await chrome.storage.local.remove(snapshotStorageKey);
      return;
    }
    const endAt = Math.min(clipAt ?? now, now);
    const { activeKeys, audioKeys } = parseSnapshot(snap);
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

  async function flushToStorage(now = Date.now()) {
    tracker.flushAllElapsed(now);
    const { active, audio, overlap, visits } = tracker.pending;
    if (active.size === 0 && audio.size === 0 && overlap.size === 0 && visits.size === 0) return;
    const stored = await chrome.storage.local.get([dayStorageKey, hourStorageKey]);
    const byDay = stored[dayStorageKey] ?? {};
    const byHour = stored[hourStorageKey] ?? {};

    function addRanges(map, field) {
      for (const [key, ranges] of map) {
        for (const [from, to] of ranges) {
          for (const { hourKey, dayKey, ms } of splitByHour(from, to)) {
            byHour[hourKey] ??= {};
            const hourEntry = getCell(byHour[hourKey], key);
            const before = hourEntry[field];
            hourEntry[field] = Math.min(before + ms, 3600000);
            const added = hourEntry[field] - before;
            byDay[dayKey] ??= {};
            getCell(byDay[dayKey], key)[field] += added;
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
      byDay[day] ??= {};
      getCell(byDay[day], key).visits += count;
      byHour[hour] ??= {};
      getCell(byHour[hour], key).visits += count;
    }

    tracker.clearPending();
    await chrome.storage.local.set({ [dayStorageKey]: byDay, [hourStorageKey]: byHour });
  }

  return {
    setWindow: tracker.setWindow,
    removeWindow: tracker.removeWindow,
    markMinimized: tracker.markMinimized,
    addAudibleTab: tracker.addAudibleTab,
    removeAudibleTab: tracker.removeAudibleTab,
    init, reconcile,
    saveSnapshot, recoverFromSnapshot, flushToStorage,
  };
}

export function createRangeTracker() {
  const states = new Map();
  const windowToKey = new Map();
  const minimizedWindowIds = new Set();
  const audibleTabToKey = new Map();
  const pendingActive = new Map();
  const pendingAudio = new Map();
  const pendingOverlap = new Map();
  const pendingVisits = new Map();

  function newState() {
    return { activeWindowIds: new Set(), audibleTabIds: new Set(), startedAt: 0, wasActive: false, wasAudible: false };
  }

  function recordElapsed(key, now = Date.now()) {
    const s = states.get(key);
    if (!s || (!s.wasActive && !s.wasAudible)) return;
    if (now > s.startedAt) {
      const range = [s.startedAt, now];
      if (s.wasActive) {
        const ranges = pendingActive.get(key) ?? [];
        ranges.push(range);
        pendingActive.set(key, ranges);
      }
      if (s.wasAudible) {
        const ranges = pendingAudio.get(key) ?? [];
        ranges.push(range);
        pendingAudio.set(key, ranges);
      }
      if (s.wasActive && s.wasAudible) {
        const ranges = pendingOverlap.get(key) ?? [];
        ranges.push(range);
        pendingOverlap.set(key, ranges);
      }
    }
    s.startedAt = now;
  }

  function addWindow(windowId, key) {
    let s = states.get(key);
    if (!s) {
      s = newState();
      states.set(key, s);
    }
    s.activeWindowIds.add(windowId);
    windowToKey.set(windowId, key);
    if (!s.wasActive) {
      if (s.wasAudible) recordElapsed(key);
      else s.startedAt = Date.now();
      s.wasActive = true;
    }
  }

  function removeWindow(windowId, minimized = false) {
    const key = windowToKey.get(windowId);
    if (minimized) minimizedWindowIds.add(windowId);
    else minimizedWindowIds.delete(windowId);
    if (!key) return;
    windowToKey.delete(windowId);
    const s = states.get(key);
    if (!s) return;
    s.activeWindowIds.delete(windowId);
    if (s.activeWindowIds.size === 0 && s.wasActive) {
      recordElapsed(key);
      s.wasActive = false;
    }
  }

  function setWindow(windowId, key) {
    const oldKey = windowToKey.get(windowId);
    console.log('[BG-DBG] setWindow: windowId=', windowId, 'oldKey=', oldKey, 'newKey=', key);
    if (oldKey === key) { console.log('[BG-DBG] setWindow: same key, return'); return; }
    if (!oldKey && !key) { console.log('[BG-DBG] setWindow: both null, return'); return; }
    if (oldKey) removeWindow(windowId);
    if (key) {
      const wasMinimized = minimizedWindowIds.delete(windowId);
      const existing = states.get(key);
      const wasTracked = wasMinimized || (!!existing && (existing.wasActive || existing.wasAudible));
      console.log('[BG-DBG] setWindow: existing state for', key, '?', !!existing, 'wasTracked=', wasTracked, 'wasMinimized=', wasMinimized);
      addWindow(windowId, key);
      if (!wasTracked) {
        pendingVisits.set(key, (pendingVisits.get(key) ?? 0) + 1);
        console.log('[BG-DBG] setWindow: VISIT counted for', key, 'total pending=', pendingVisits.get(key));
      } else {
        console.log('[BG-DBG] setWindow: visit NOT counted (already tracked)');
      }
    } else {
      console.log('[BG-DBG] setWindow: key is null/falsy, only removed old');
    }
  }

  function addAudibleTab(tabId, key, countVisit = true) {
    if (!key) return;
    const oldKey = audibleTabToKey.get(tabId);
    if (oldKey === key) return;
    if (oldKey) removeAudibleTab(tabId);
    audibleTabToKey.set(tabId, key);
    let s = states.get(key);
    if (!s) {
      s = newState();
      states.set(key, s);
    }
    const wasTracked = s.wasActive || s.wasAudible;
    recordElapsed(key);
    s.audibleTabIds.add(tabId);
    s.wasAudible = true;
    if (!wasTracked) {
      s.startedAt = Date.now();
      if (countVisit) pendingVisits.set(key, (pendingVisits.get(key) ?? 0) + 1);
    }
  }

  function removeAudibleTab(tabId) {
    const key = audibleTabToKey.get(tabId);
    if (!key) return;
    audibleTabToKey.delete(tabId);
    const s = states.get(key);
    if (!s) return;
    s.audibleTabIds.delete(tabId);
    if (s.audibleTabIds.size === 0 && s.wasAudible) {
      recordElapsed(key);
      s.wasAudible = false;
    }
  }

  function flushAllElapsed(now) {
    for (const key of states.keys()) recordElapsed(key, now);
  }

  function getActiveKeys() {
    return [...new Set(windowToKey.values())].filter(Boolean);
  }

  function getAudibleKeys() {
    return [...new Set(audibleTabToKey.values())].filter(Boolean);
  }

  function getTrackedWindowIds() {
    return [...windowToKey.keys()];
  }

  function getTrackedAudibleTabIds() {
    return [...audibleTabToKey.keys()];
  }

  function isWindowTracked(windowId) {
    return windowToKey.has(windowId);
  }

  function pushRange(field, key, range) {
    const map = field === 'active' ? pendingActive
      : field === 'audio' ? pendingAudio
      : pendingOverlap;
    const ranges = map.get(key) ?? [];
    ranges.push(range);
    map.set(key, ranges);
  }

  function clearPending() {
    pendingActive.clear();
    pendingAudio.clear();
    pendingOverlap.clear();
    pendingVisits.clear();
  }

  return {
    setWindow, addWindow, removeWindow, markMinimized: (id) => minimizedWindowIds.add(id), addAudibleTab, removeAudibleTab,
    flushAllElapsed, getActiveKeys, getAudibleKeys,
    getTrackedWindowIds, getTrackedAudibleTabIds, isWindowTracked,
    pushRange, clearPending,
    pending: { active: pendingActive, audio: pendingAudio, overlap: pendingOverlap, visits: pendingVisits },
  };
}
