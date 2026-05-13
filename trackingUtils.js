export function createRangeTracker() {
  const states = new Map();
  const windowToKey = new Map();
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

  function removeWindow(windowId) {
    const key = windowToKey.get(windowId);
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
    if (oldKey === key) return;
    if (!oldKey && !key) return;
    if (oldKey) removeWindow(windowId);
    if (key) {
      const existing = states.get(key);
      const wasTracked = !!existing && (existing.wasActive || existing.wasAudible);
      addWindow(windowId, key);
      if (!wasTracked) pendingVisits.set(key, (pendingVisits.get(key) ?? 0) + 1);
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
    setWindow, addWindow, removeWindow, addAudibleTab, removeAudibleTab,
    flushAllElapsed, getActiveKeys, getAudibleKeys,
    getTrackedWindowIds, getTrackedAudibleTabIds, isWindowTracked,
    pushRange, clearPending,
    pending: { active: pendingActive, audio: pendingAudio, overlap: pendingOverlap, visits: pendingVisits },
  };
}
