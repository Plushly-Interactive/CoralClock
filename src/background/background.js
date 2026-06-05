import { localDayKey } from '../shared/timeUtils.js';
import { ensureStorageVersion } from '../data/migrations.js';
import { TOUR_VERSION } from '../shared/tour.js';
import { PREF_IDLE_THRESHOLD_SEC } from '../shared/prefKeys.js';
import { getIdleThresholdSec, DEFAULT_IDLE_THRESHOLD_SEC } from '../shared/idleConfig.js';
import { siteIdFromUrl, pathFromUrl } from './siteResolution.js';
import {
  setWindowSite, removeWindowSite,
  addAudibleTab, removeAudibleTab,
  flushToStorage, reconcileWindows, initTracking,
  saveSnapshot, recoverFromSnapshot,
  applyIdleClip,
  SITES_DAY_KEY, SITES_HOUR_KEY,
} from './siteTracking.js';
import {
  setWindowPath, removeWindowPath,
  addAudibleTabPath, removeAudibleTabPath,
  initSubpageTracking, reconcileSubpagePaths,
  flushSubpagesToStorage,
  saveSubpageSnapshot, recoverSubpagesFromSnapshot,
  applyIdleClipSubpages,
  SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY,
} from './subpageTracking.js';
import { computeOverage, publishOverage } from './enforcement.js';
import { dbg, isDebug, initDebug } from './trackingUtils.js';
import {
  MSG_GET_SITES_BY_DAY, MSG_GET_SITES_BY_HOUR_TODAY,
  MSG_GET_SITES_BY_HOUR_FOR_DAY, MSG_GET_SUBPAGES_BY_DAY,
  MSG_GET_SUBPAGES_BY_HOUR, MSG_GET_AVG_PER_CLOCK_HOUR,
  MSG_INVALIDATE_SITES_CACHE,
} from '../shared/msgTypes.js';

// Logged on every service-worker (re)start. A burst of these is the signal that
// the worker is churning (MV3 idle-suspend, crash-on-load, or dev reload), which
// can desync in-memory tracking state from live tabs. Unconditional (not gated
// on _debug): it runs at module load before initDebug() reads the flag, and it
// carries no URL/sensitive data — just a timestamp.
console.log(`[BG-DBG ${new Date().toISOString()}] SERVICE WORKER STARTED`);

let cachedByDay = null;
let cachedByHour = null;
let cachedSubpagesByDay = null;
let cachedSubpagesByHour = null;
let bootstrapAt;
let coldStart = false;
// Set by chrome.idle.onStateChanged when the user goes idle/locked; cleared
// when they become active. Used by the flush handler as the exact clip point.
// In-memory only: a service-worker restart loses the head of the idle stretch
// — the bootstrap query re-seeds this to `now - threshold` if the user is
// still idle, so at most one detection window of idle time is miscounted.
let idleStartedAt = null;
// Mirrors the value passed to chrome.idle.setDetectionInterval so the
// onStateChanged listener can compute the retroactive clip point synchronously.
let cachedIdleThresholdMs = DEFAULT_IDLE_THRESHOLD_SEC * 1000;

// Drop the in-memory site caches after storage is rewritten (flush), so
// the next query re-reads fresh data.
function invalidateSitesCache() {
  cachedByDay = null;
  cachedByHour = null;
  cachedSubpagesByDay = null;
  cachedSubpagesByHour = null;
}

chrome.alarms.get('flush').then(existing => {
  if (!existing) chrome.alarms.create('flush', { periodInMinutes: 1 });
});
const bootstrapDone = bootstrap();

chrome.runtime.onStartup.addListener(() => {
  coldStart = true;
  chrome.storage.local.remove(['_trackingSnapshot', '_subpageSnapshot']);
});

// First page to open for the update tour. The tour hands off between surfaces
// via nextUpdateSurface — only the entry point needs to be opened here.
const TOUR_UPDATE_ENTRY = 'src/pages/dashboard/dashboard.html';

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install' && details.reason !== 'update') return;
  if (details.reason === 'update') {
    const { tour = {} } = await chrome.storage.local.get('tour');
    if (tour.completed && (tour.completedVersion ?? 0) < TOUR_VERSION) {
      chrome.tabs.create({ url: chrome.runtime.getURL(TOUR_UPDATE_ENTRY) });
      return;
    }
  }
  chrome.tabs.create({
    url: chrome.runtime.getURL('src/pages/dashboard/dashboard.html?tour=1'),
  });
});

async function bootstrap() {
  await initDebug();
  dbg('bootstrap: start');
  try {
    await ensureStorageVersion();
    bootstrapAt = Date.now();
    await initTracking();
    await initSubpageTracking();
    await seedIdleState();
    dbg('bootstrap: done, bootstrapAt=', bootstrapAt);
    return;
  } catch (e) {
    // A throw here means init never restored live tabs into the tracker, so
    // subsequent events run against empty state (the root of phantom visits we
    // chased). Surface it loudly instead of failing silently.
    dbg('bootstrap: FAILED', e?.message ?? e, e?.stack);
    throw e;
  }
}

// --- Messages ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === MSG_GET_SITES_BY_DAY) {
    getByDay().then(sendResponse);
    return true;
  }
  if (msg.type === MSG_GET_SITES_BY_HOUR_TODAY) {
    getByHourToday().then(sendResponse);
    return true;
  }
  if (msg.type === MSG_GET_AVG_PER_CLOCK_HOUR) {
    getAvgPerClockHour(msg.siteIds, msg.range, msg.dayKeys).then(sendResponse);
    return true;
  }
  if (msg.type === MSG_GET_SITES_BY_HOUR_FOR_DAY) {
    getByHourForDay(msg.dayKey).then(sendResponse);
    return true;
  }
  if (msg.type === MSG_GET_SUBPAGES_BY_DAY) {
    getSubpagesByDay().then(sendResponse);
    return true;
  }
  if (msg.type === MSG_GET_SUBPAGES_BY_HOUR) {
    getSubpagesByHour().then(sendResponse);
    return true;
  }
  if (msg.type === MSG_INVALIDATE_SITES_CACHE) {
    invalidateSitesCache();
    sendResponse(true);
    return true;
  }
});

async function getByDay() {
  if (!cachedByDay) {
    const { [SITES_DAY_KEY]: sitesByDay = {} } = await chrome.storage.local.get(SITES_DAY_KEY);
    cachedByDay = sitesByDay;
  }
  return cachedByDay;
}

async function getSubpagesByDay() {
  if (!cachedSubpagesByDay) {
    const { [SUBPAGES_DAY_KEY]: subpagesByDay = {} } = await chrome.storage.local.get(SUBPAGES_DAY_KEY);
    cachedSubpagesByDay = subpagesByDay;
  }
  return cachedSubpagesByDay;
}

async function getSubpagesByHour() {
  if (!cachedSubpagesByHour) {
    const { [SUBPAGES_HOUR_KEY]: subpagesByHour = {} } = await chrome.storage.local.get(SUBPAGES_HOUR_KEY);
    cachedSubpagesByHour = subpagesByHour;
  }
  return cachedSubpagesByHour;
}

async function getByHourToday() {
  if (!cachedByHour) {
    const { [SITES_HOUR_KEY]: sitesByHour = {} } = await chrome.storage.local.get(SITES_HOUR_KEY);
    cachedByHour = sitesByHour;
  }
  const todayKey = localDayKey(Date.now());
  const result = {};
  for (let h = 0; h < 24; h++) {
    const hourKey = `${todayKey}T${String(h).padStart(2, '0')}`;
    if (cachedByHour[hourKey]) result[hourKey] = cachedByHour[hourKey];
  }
  return result;
}

async function getByHourForDay(dayKey) {
  if (!cachedByHour) {
    const { [SITES_HOUR_KEY]: sitesByHour = {} } = await chrome.storage.local.get(SITES_HOUR_KEY);
    cachedByHour = sitesByHour;
  }
  const result = {};
  for (let h = 0; h < 24; h++) {
    const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
    if (cachedByHour[hourKey]) result[hourKey] = cachedByHour[hourKey];
  }
  return result;
}

async function getAvgPerClockHour(siteIds, range, dayKeys = null) {
  if (!cachedByHour) {
    const { [SITES_HOUR_KEY]: sitesByHour = {} } = await chrome.storage.local.get(SITES_HOUR_KEY);
    cachedByHour = sitesByHour;
  }

  if (!dayKeys) {
    const now = new Date();
    const todayKey = localDayKey(now.getTime());

    if (range === 'all') {
      const hourKeys = Object.keys(cachedByHour);
      if (hourKeys.length === 0) {
        dayKeys = [];
      } else {
        const dates = hourKeys.map(k => k.slice(0, 10)).sort();
        const earliestDateStr = dates[0];
        const [y, m, d] = earliestDateStr.split('-').map(Number);
        const earliestDate = new Date(y, m - 1, d);
        dayKeys = [];
        for (let date = new Date(earliestDate); ; date.setDate(date.getDate() + 1)) {
          const k = localDayKey(date.getTime());
          if (k === todayKey) break;
          dayKeys.push(k);
        }
      }
    } else {
      const days = parseInt(range);
      dayKeys = [];
      for (let d = 1; d <= days; d++) {
        const day = new Date(now);
        day.setDate(day.getDate() - d);
        dayKeys.push(localDayKey(day.getTime()));
      }
    }
  }

  const D = dayKeys.length;
  if (D === 0) return new Array(24).fill(0);

  const sums = new Array(24).fill(0);
  for (const dayKey of dayKeys) {
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const bucket = cachedByHour[hourKey];
      if (!bucket) continue;
      if (siteIds?.length) {
        for (const id of siteIds) sums[h] += bucket[id]?.activeMs ?? 0;
      } else {
        for (const entry of Object.values(bucket)) sums[h] += entry.activeMs ?? 0;
      }
    }
  }
  return sums.map(s => s / D);
}

// --- Tab / window events ---

chrome.tabs.onActivated.addListener(async ({ windowId, tabId }) => {
  await bootstrapDone;
  const tab = await chrome.tabs.get(tabId);
  dbg('onActivated: windowId=', windowId, 'tabId=', tabId, 'url=', tab.url, 'pendingUrl=', tab.pendingUrl, 'status=', tab.status, 'discarded=', tab.discarded, 'active=', tab.active);
  if (!tab.active) return;
  const siteId = siteIdFromUrl(tab.url);
  const path = pathFromUrl(tab.url);
  setWindowSite(windowId, siteId);
  setWindowPath(windowId, siteId, path);
});

async function cacheFavicon(hostname, url) {
  if (!url || !url.startsWith('http')) return;
  const { faviconCache = {} } = await chrome.storage.local.get('faviconCache');
  if (faviconCache[hostname]?.url === url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const type = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    faviconCache[hostname] = { url, dataUrl: `data:${type};base64,${btoa(binary)}` };
    await chrome.storage.local.set({ faviconCache });
  } catch { /* ignore network errors */ }
}

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  await bootstrapDone;
  if (changeInfo.favIconUrl) {
    const hostname = siteIdFromUrl(tab.url);
    if (hostname) cacheFavicon(hostname, changeInfo.favIconUrl);
  }
  if (isDebug()) dbg('onUpdated: tabId=', _tabId, 'changeInfo=', JSON.stringify(changeInfo), 'url=', tab.url, 'active=', tab.active, 'audible=', tab.audible, 'muted=', tab.mutedInfo?.muted);
  if (changeInfo.status === 'complete' && tab.active) {
    const siteId = siteIdFromUrl(tab.url);
    const path = pathFromUrl(tab.url);
    setWindowSite(tab.windowId, siteId);
    setWindowPath(tab.windowId, siteId, path);
  }
  if (changeInfo.status === 'complete') {
    // Catches audible tab navigating between sites without going silent (changeInfo.audible won't fire)
    if (tab.audible && !tab.mutedInfo?.muted) {
      const siteId = siteIdFromUrl(tab.url);
      const path = pathFromUrl(tab.url);
      addAudibleTab(tab.id, siteId);
      addAudibleTabPath(tab.id, siteId, path);
    } else {
      removeAudibleTab(tab.id);
      removeAudibleTabPath(tab.id);
    }
  }
  if ('audible' in changeInfo) {
    if (changeInfo.audible && !tab.mutedInfo?.muted) {
      const siteId = siteIdFromUrl(tab.url);
      const path = pathFromUrl(tab.url);
      addAudibleTab(tab.id, siteId);
      addAudibleTabPath(tab.id, siteId, path);
    } else {
      removeAudibleTab(tab.id);
      removeAudibleTabPath(tab.id);
    }
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await bootstrapDone;
  removeAudibleTab(tabId);
  removeAudibleTabPath(tabId);
});

chrome.windows.onCreated.addListener(async (window) => {
  await bootstrapDone;
  if (window.state === 'minimized') return;
  const [tab] = await chrome.tabs.query({ windowId: window.id, active: true });
  const siteId = siteIdFromUrl(tab?.url);
  const path = pathFromUrl(tab?.url);
  setWindowSite(window.id, siteId);
  setWindowPath(window.id, siteId, path);
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  await bootstrapDone;
  removeWindowSite(windowId);
  removeWindowPath(windowId);
});

// SPA navigation — domain unchanged, only path changes. tabs.onUpdated with
// status:complete handles full loads; this handles history.pushState etc.
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  await bootstrapDone;
  if (details.frameId !== 0) return;
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  if (!tab) return;
  const siteId = siteIdFromUrl(details.url);
  const path = pathFromUrl(details.url);
  if (tab.active) setWindowPath(tab.windowId, siteId, path);
  if (tab.audible && !tab.mutedInfo?.muted) {
    addAudibleTabPath(tab.id, siteId, path);
  }
});

// --- Flush alarm ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'flush') return;
  await bootstrapDone;
  if (coldStart) {
    await chrome.storage.local.remove(['_trackingSnapshot', '_subpageSnapshot']);
    coldStart = false;
  }
  await recoverFromSnapshot(bootstrapAt, idleStartedAt);
  await recoverSubpagesFromSnapshot(bootstrapAt, idleStartedAt);
  await reconcileWindows();
  await reconcileSubpagePaths();
  const flushAt = Date.now();
  clipIfIdle(flushAt);
  await flushToStorage(flushAt);
  await flushSubpagesToStorage(flushAt);
  await saveSnapshot(flushAt);
  await saveSubpageSnapshot(flushAt);
  invalidateSitesCache();

  await checkEnforcement(flushAt);
});

// React to rule edits immediately (enable/disable/add/delete) rather than
// waiting for the next flush — so disabling unblocks and enabling an
// already-crossed rule blocks right away.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.rules) return;
  await bootstrapDone;
  await checkEnforcement(Date.now());
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[PREF_IDLE_THRESHOLD_SEC]) return;
  const sec = await getIdleThresholdSec();
  cachedIdleThresholdMs = sec * 1000;
  chrome.idle.setDetectionInterval(sec);
  dbg('idle threshold changed → setDetectionInterval(', sec, ')');
});

async function seedIdleState() {
  const sec = await getIdleThresholdSec();
  cachedIdleThresholdMs = sec * 1000;
  chrome.idle.setDetectionInterval(sec);
  const state = await chrome.idle.queryState(sec);
  if (state === 'idle' || state === 'locked') {
    idleStartedAt = Date.now() - cachedIdleThresholdMs;
    dbg('bootstrap: user already', state, '— seeding idleStartedAt=', idleStartedAt);
  }
}

function clipIfIdle(flushAt) {
  if (idleStartedAt === null) return;
  applyIdleClip(idleStartedAt, flushAt);
  applyIdleClipSubpages(idleStartedAt, flushAt);
  dbg('flush: clipped active at idleStartedAt=', idleStartedAt);
}

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    // Chrome fires this event only after the user has been idle for the full
    // detection interval, so subtract the threshold to get the retroactive
    // actual-idle start rather than the (too-late) detection time.
    if (idleStartedAt === null) idleStartedAt = Date.now() - cachedIdleThresholdMs;
    dbg('idle.onStateChanged:', state, 'idleStartedAt=', idleStartedAt);
  } else {
    const activeAt = Date.now();
    dbg('idle.onStateChanged: active (was idleStartedAt=', idleStartedAt, ')');
    // Clip the in-flight window (since the last flush) before clearing the
    // timestamp, otherwise that window gets counted as active on the next flush.
    if (idleStartedAt !== null) {
      applyIdleClip(idleStartedAt, activeAt);
      applyIdleClipSubpages(idleStartedAt, activeAt);
    }
    idleStartedAt = null;
  }
});

// Compute which rules are over their limit and publish DNR redirect rules so
// over-limit sites are blocked until the period window rolls over.
async function checkEnforcement(now) {
  const {
    rules = [],
    [SITES_DAY_KEY]: sitesByDay = {},
    [SITES_HOUR_KEY]: sitesByHour = {},
    [SUBPAGES_DAY_KEY]: subpagesByDay = {},
    [SUBPAGES_HOUR_KEY]: subpagesByHour = {},
  } = await chrome.storage.local.get(['rules', SITES_DAY_KEY, SITES_HOUR_KEY, SUBPAGES_DAY_KEY, SUBPAGES_HOUR_KEY]);

  const overage = computeOverage(rules, { sitesByDay, sitesByHour, subpagesByDay, subpagesByHour }, now);
  await publishOverage(overage);
}

// Pre-emptive block: on a main-frame navigation, flush the tracker's accrued
// usage to storage and re-check limits *before* relying on the next flush tick.
// flushToStorage drains the pending in-memory ranges up to `now`, so the check
// sees usage as current as this instant — catching a crossing that happened
// since the last flush. The freshly-published DNR rule plus reloadMatchingTabs
// then block the site without waiting up to a minute for the flush alarm.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // main frame only
  if (!details.url?.startsWith('http')) return;
  await bootstrapDone;
  const now = Date.now();
  await flushToStorage(now);
  await flushSubpagesToStorage(now);
  invalidateSitesCache();
  await checkEnforcement(now);
});
