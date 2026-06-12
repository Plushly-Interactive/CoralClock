import { localDayKey, localHourKey, splitByHour } from '../shared/timeUtils.js';
import { PREF_FIRST_BROWSE_BY_DAY } from '../shared/prefKeys.js';

const SNAPSHOT_MAX_GAP_MS = 5 * 60 * 1000;

// Debug logging is off by default and gated on a `_debug` flag in
// chrome.storage.local. To enable in the field without a rebuild:
//   chrome.storage.local.set({ _debug: true })  // then reload the extension
// Logs include full tab URLs, so keep it off unless actively debugging.
let _debug = false;

// Read the flag once at startup. Called from bootstrap before listeners run.
export async function initDebug() {
  const { _debug: flag = false } = await chrome.storage.local.get('_debug');
  _debug = flag;
}

// Whether debug logging is on. Use at call sites to skip building expensive
// log arguments (e.g. JSON.stringify) when logging is off.
export function isDebug() {
  return _debug;
}

// Debug logger with a local YYYY-MM-DD HH:MM:SS.mmm timestamp prefix, so the
// [BG-DBG] trace can be correlated against the day/hour buckets in stored data.
export function dbg(...args) {
  if (!_debug) return;
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  console.log(`[BG-DBG ${date} ${time}]`, ...args);
}

// Total length covered by a set of [from, to] ranges after merging overlaps.
// Sorts by start, walks left→right extending the current span, and sums spans.
// Used for true wall-clock active time: parallel windows on different sites
// overlap in real time, so summing per-site activeMs double-counts; the union
// counts each overlapping instant once.
function unionLength(ranges) {
  if (ranges.length === 0) return 0;
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = ranges[0];
  for (let i = 1; i < ranges.length; i++) {
    const [s, e] = ranges[i];
    if (s > curEnd) { total += curEnd - curStart; curStart = s; curEnd = e; }
    else if (e > curEnd) curEnd = e;
  }
  return total + (curEnd - curStart);
}

export function createTrackingModule({
  urlToKey,
  dayStorageKey,
  hourStorageKey,
  snapshotStorageKey,
  getCell,
  recoverLegacy,
  wallClockHourKey,
}) {
  const tracker = createRangeTracker();
  let _recovered = false;
  const parseSnapshot = recoverLegacy ?? (snap => ({
    activeKeys: snap.activeKeys ?? [],
    audioKeys: snap.audioKeys ?? [],
  }));

  async function init() {
    const windows = await chrome.windows.getAll({ populate: true });
    dbg('init: windows count=', windows.length);
    for (const w of windows) {
      if (w.state === 'minimized') { dbg('init: window', w.id, 'minimized, skip'); tracker.markMinimized(w.id); continue; }
      const tab = w.tabs?.find(t => t.active);
      const key = urlToKey(tab?.url);
      dbg('init: window', w.id, 'activeTab url=', tab?.url, '→ key=', key);
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
    dbg(`reconcile[${hourStorageKey}]: start (tracked windows=`, tracker.getTrackedWindowIds().length, 'audible tabs=', tracker.getTrackedAudibleTabIds().length, ')');
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

  async function recoverFromSnapshot(clipAt, idleSince = null) {
    if (_recovered) return;
    _recovered = true;
    const stored = await chrome.storage.local.get(snapshotStorageKey);
    const snap = stored[snapshotStorageKey];
    if (!snap) { dbg(`recover[${snapshotStorageKey}]: no snapshot`); return; }
    const now = Date.now();
    if (now - snap.at > SNAPSHOT_MAX_GAP_MS) {
      dbg(`recover[${snapshotStorageKey}]: snapshot too stale (${now - snap.at}ms), discarded`);
      await chrome.storage.local.remove(snapshotStorageKey);
      return;
    }
    const endAt = Math.min(clipAt ?? now, now);
    // If the user is idle, split the recovery window at idleSince: the portion
    // before counts as active, the portion after counts as idle. Audio is not
    // clipped — same policy as applyIdleClip. This is the critical path for AFK
    // sessions: the SW restarts on every alarm, so recovery is how elapsed time
    // enters the tracker, and without this split it would all land in activeMs.
    const activeEndAt = idleSince !== null ? Math.min(endAt, idleSince) : endAt;
    const idleStartAt = idleSince !== null ? Math.max(snap.at, idleSince) : null;
    const { activeKeys, audioKeys } = parseSnapshot(snap);
    dbg(`recover[${snapshotStorageKey}]: crediting ${endAt - snap.at}ms to`, activeKeys.length, 'active /', audioKeys.length, 'audio keys', idleSince !== null ? `(idle clip at ${idleSince})` : '');
    const activeKeySet = new Set(activeKeys);
    const audioKeySet = new Set(audioKeys);
    for (const key of activeKeys) {
      // An audible key keeps full active time even past idleSince (matches applyIdleClip).
      const keyActiveEnd = audioKeySet.has(key) ? endAt : activeEndAt;
      if (keyActiveEnd > snap.at) tracker.pushRange('active', key, [snap.at, keyActiveEnd]);
      if (!audioKeySet.has(key) && idleStartAt !== null && endAt > idleStartAt) tracker.pushRange('idle', key, [idleStartAt, endAt]);
    }
    for (const key of audioKeys) {
      tracker.pushRange('audio', key, [snap.at, endAt]);
      if (activeKeySet.has(key) && endAt > snap.at) {
        tracker.pushRange('overlap', key, [snap.at, endAt]);
      }
    }
  }

  async function flushToStorage(now = Date.now()) {
    tracker.flushAllElapsed(now);
    const { active, audio, overlap, idle, visits } = tracker.pending;
    if (active.size === 0 && audio.size === 0 && overlap.size === 0 && idle.size === 0 && visits.size === 0) return;
    const getKeys = [dayStorageKey, hourStorageKey, PREF_FIRST_BROWSE_BY_DAY];
    if (wallClockHourKey) getKeys.push(wallClockHourKey);
    const stored = await chrome.storage.local.get(getKeys);
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
    addRanges(idle, 'idleMs');

    const day = localDayKey(now);
    const hour = localHourKey(now);
    for (const [key, count] of visits) {
      byDay[day] ??= {};
      getCell(byDay[day], key).visits += count;
      byHour[hour] ??= {};
      getCell(byHour[hour], key).visits += count;
      // Per-key visit ledger: shows exactly how many visits each flush commits
      // to storage. A large delta here for a single key in one tick is the
      // direct fingerprint of a visit-overcount bug.
      dbg(`flush[${hourStorageKey}]: +${count} visits → ${key} (hour total now ${getCell(byHour[hour], key).visits})`);
    }

    const firstBrowseByDay = stored[PREF_FIRST_BROWSE_BY_DAY] ?? {};
    const toWrite = { [dayStorageKey]: byDay, [hourStorageKey]: byHour };

    // Wall-clock active time: union of all keys' active+audio ranges per hour, so
    // overlapping parallel-window time counts once. Only the site tracker passes
    // wallClockHourKey; the subpage tracker skips this (same browsing, no second
    // tally). Overlap ranges aren't added — the union already merges active∩audio.
    if (wallClockHourKey) {
      const wallByHour = stored[wallClockHourKey] ?? {};
      const rangesByHour = {};
      for (const map of [active, audio]) {
        for (const ranges of map.values()) {
          for (const [from, to] of ranges) {
            let t = from;
            while (t < to) {
              const nextHour = new Date(t);
              nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
              const end = Math.min(nextHour.getTime(), to);
              (rangesByHour[localHourKey(t)] ??= []).push([t, end]);
              t = end;
            }
          }
        }
      }
      for (const [hourKey, ranges] of Object.entries(rangesByHour)) {
        const added = unionLength(ranges);
        wallByHour[hourKey] = Math.min((wallByHour[hourKey] ?? 0) + added, 3600000);
        dbg(`flush[${wallClockHourKey}]: +${added}ms union → ${hourKey} (total ${wallByHour[hourKey]})`);
      }
      toWrite[wallClockHourKey] = wallByHour;
    }
    if (visits.size > 0 && !firstBrowseByDay[day]) {
      firstBrowseByDay[day] = now;
      toWrite[PREF_FIRST_BROWSE_BY_DAY] = firstBrowseByDay;
    }
    tracker.clearPending();
    await chrome.storage.local.set(toWrite);
  }

  function applyIdleClip(idleSince, now) {
    tracker.applyIdleClip(idleSince, now);
  }

  return {
    setWindow: tracker.setWindow,
    removeWindow: tracker.removeWindow,
    markMinimized: tracker.markMinimized,
    addAudibleTab: tracker.addAudibleTab,
    removeAudibleTab: tracker.removeAudibleTab,
    init, reconcile,
    saveSnapshot, recoverFromSnapshot, flushToStorage,
    applyIdleClip,
  };
}

export function createRangeTracker() {
  const states = new Map();
  const windowToKey = new Map();
  const minimizedWindowIds = new Set();
  const audibleTabToKey = new Map();
  // Last key each tab was counted as an audio visit for. Unlike audibleTabToKey
  // (cleared when a tab goes silent), this survives audible→silent→audible flaps
  // and the countVisit=false restore path on service-worker restart, so a tab
  // that keeps playing the same site is counted once, not on every resume.
  const audibleTabLastVisitKey = new Map();
  const pendingActive = new Map();
  const pendingAudio = new Map();
  const pendingOverlap = new Map();
  const pendingIdle = new Map();
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
    dbg('setWindow: windowId=', windowId, 'oldKey=', oldKey, 'newKey=', key);
    if (oldKey === key) { dbg('setWindow: same key, return'); return; }
    if (!oldKey && !key) { dbg('setWindow: both null, return'); return; }
    if (oldKey) removeWindow(windowId);
    if (key) {
      const wasMinimized = minimizedWindowIds.delete(windowId);
      const existing = states.get(key);
      const wasTracked = wasMinimized || (!!existing && (existing.wasActive || existing.wasAudible));
      dbg('setWindow: existing state for', key, '?', !!existing, 'wasTracked=', wasTracked, 'wasMinimized=', wasMinimized);
      addWindow(windowId, key);
      if (!wasTracked) {
        pendingVisits.set(key, (pendingVisits.get(key) ?? 0) + 1);
        dbg('setWindow: VISIT counted for', key, 'total pending=', pendingVisits.get(key));
      } else {
        dbg('setWindow: visit NOT counted (already tracked)');
      }
    } else {
      dbg('setWindow: key is null/falsy, only removed old');
    }
  }

  function addAudibleTab(tabId, key, countVisit = true) {
    if (!key) return;
    const oldKey = audibleTabToKey.get(tabId);
    dbg('addAudibleTab: tabId=', tabId, 'oldKey=', oldKey, 'newKey=', key, 'countVisit=', countVisit);
    if (oldKey === key) { dbg('addAudibleTab: same key, return'); return; }
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
    if (!wasTracked) s.startedAt = Date.now();
    // A visit is "this tab started playing this site", counted once — not on
    // every audible resume. Gate on the tab's last-seen key (which survives
    // silent gaps and is restored on SW restart via countVisit=false), so flaps
    // and restarts don't re-count a tab still on the same site.
    const alreadyCounted = audibleTabLastVisitKey.get(tabId) === key;
    audibleTabLastVisitKey.set(tabId, key);
    if (countVisit && !alreadyCounted) {
      pendingVisits.set(key, (pendingVisits.get(key) ?? 0) + 1);
      dbg('addAudibleTab: VISIT counted for', key, 'total pending=', pendingVisits.get(key));
    } else {
      dbg('addAudibleTab: visit NOT counted; alreadyCounted=', alreadyCounted, 'countVisit=', countVisit);
    }
  }

  function removeAudibleTab(tabId) {
    const key = audibleTabToKey.get(tabId);
    dbg('removeAudibleTab: tabId=', tabId, 'key=', key);
    if (!key) return;
    audibleTabToKey.delete(tabId);
    const s = states.get(key);
    if (!s) return;
    s.audibleTabIds.delete(tabId);
    if (s.audibleTabIds.size === 0 && s.wasAudible) {
      recordElapsed(key);
      s.wasAudible = false;
      dbg('removeAudibleTab: cleared wasAudible for', key);
    }
  }

  function flushAllElapsed(now) {
    for (const key of states.keys()) recordElapsed(key, now);
  }

  // Splits in-flight ranges at `idleSince`: the portion before counts as active,
  // the portion after counts as idle. Audio is not clipped — a playing tab is
  // real usage even while the user is away. An audible key also keeps its active
  // time running full (clip = now): a tab the user is watching/listening to
  // counts as active even while idle. Called by the flush alarm when
  // chrome.idle reports the user idle/locked; idleSince is `now - threshold`.
  function applyIdleClip(idleSince, now) {
    for (const [key, s] of states) {
      if (!s.wasActive && !s.wasAudible) continue;
      const clip = s.wasAudible ? now : Math.max(s.startedAt, Math.min(idleSince, now));
      if (s.wasActive && clip > s.startedAt) {
        const ranges = pendingActive.get(key) ?? [];
        ranges.push([s.startedAt, clip]);
        pendingActive.set(key, ranges);
        if (s.wasAudible) {
          const oranges = pendingOverlap.get(key) ?? [];
          oranges.push([s.startedAt, clip]);
          pendingOverlap.set(key, oranges);
        }
      }
      if (s.wasActive && now > clip) {
        const ranges = pendingIdle.get(key) ?? [];
        ranges.push([clip, now]);
        pendingIdle.set(key, ranges);
      }
      if (s.wasAudible && now > s.startedAt) {
        const ranges = pendingAudio.get(key) ?? [];
        ranges.push([s.startedAt, now]);
        pendingAudio.set(key, ranges);
      }
      s.startedAt = now;
    }
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
      : field === 'idle' ? pendingIdle
      : pendingOverlap;
    const ranges = map.get(key) ?? [];
    ranges.push(range);
    map.set(key, ranges);
  }

  function clearPending() {
    pendingActive.clear();
    pendingAudio.clear();
    pendingOverlap.clear();
    pendingIdle.clear();
    pendingVisits.clear();
  }

  return {
    setWindow, addWindow, removeWindow, markMinimized: (id) => minimizedWindowIds.add(id), addAudibleTab, removeAudibleTab,
    flushAllElapsed, applyIdleClip, getActiveKeys, getAudibleKeys,
    getTrackedWindowIds, getTrackedAudibleTabIds, isWindowTracked,
    pushRange, clearPending,
    pending: { active: pendingActive, audio: pendingAudio, overlap: pendingOverlap, idle: pendingIdle, visits: pendingVisits },
  };
}
