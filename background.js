import { localDayKey } from './utils.js';
import { ensureStorageVersion } from './migrations.js';
import { siteIdFromUrl, pathFromUrl } from './siteResolution.js';
import {
  setWindowSite, removeWindowSite,
  addAudibleTab, removeAudibleTab,
  flushToStorage, reconcileWindows, initTracking,
  saveSnapshot, recoverFromSnapshot,
} from './siteTracking.js';
import {
  setWindowPath, removeWindowPath,
  addAudibleTabPath, removeAudibleTabPath,
  initSubpageTracking, reconcileSubpagePaths,
  flushSubpagesToStorage,
  saveSubpageSnapshot, recoverSubpagesFromSnapshot,
} from './subpageTracking.js';

console.log('BiteGuard: background started');

let cachedByDay = null;
let cachedByHour = null;
let bootstrapAt;
let coldStart = false;

chrome.alarms.get('flush').then(existing => {
  if (!existing) chrome.alarms.create('flush', { periodInMinutes: 1 });
});
const bootstrapDone = bootstrap();

chrome.runtime.onStartup.addListener(() => {
  coldStart = true;
  chrome.storage.local.remove(['_trackingSnapshot', '_subpageSnapshot']);
});

async function bootstrap() {
  await ensureStorageVersion();
  bootstrapAt = Date.now();
  await initTracking();
  await initSubpageTracking();
}

// --- Messages ---

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'getAnalyticsByDay') {
    getByDay().then(sendResponse);
    return true;
  }
  if (msg.type === 'getAnalyticsByHourToday') {
    getByHourToday().then(sendResponse);
    return true;
  }
  if (msg.type === 'getAvgPerClockHour') {
    getAvgPerClockHour(msg.siteIds, msg.range, msg.dayKeys).then(sendResponse);
    return true;
  }
  if (msg.type === 'getAnalyticsByHourForDay') {
    getByHourForDay(msg.dayKey).then(sendResponse);
    return true;
  }
  if (msg.type === 'invalidateAnalyticsCache') {
    cachedByDay = null;
    cachedByHour = null;
    sendResponse(true);
    return true;
  }
});

async function getByDay() {
  if (!cachedByDay) {
    const { analyticsByDay = {} } = await chrome.storage.local.get('analyticsByDay');
    cachedByDay = analyticsByDay;
  }
  return cachedByDay;
}

async function getByHourToday() {
  if (!cachedByHour) {
    const { analyticsByHour = {} } = await chrome.storage.local.get('analyticsByHour');
    cachedByHour = analyticsByHour;
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
    const { analyticsByHour = {} } = await chrome.storage.local.get('analyticsByHour');
    cachedByHour = analyticsByHour;
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
    const { analyticsByHour = {} } = await chrome.storage.local.get('analyticsByHour');
    cachedByHour = analyticsByHour;
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
  if (!tab.active) return;
  const siteId = siteIdFromUrl(tab.url);
  const path = pathFromUrl(tab.url);
  setWindowSite(windowId, siteId);
  setWindowPath(windowId, siteId, path);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  await bootstrapDone;
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
  await recoverFromSnapshot(bootstrapAt);
  await recoverSubpagesFromSnapshot(bootstrapAt);
  await reconcileWindows();
  await reconcileSubpagePaths();
  const flushAt = Date.now();
  await flushToStorage(flushAt);
  await flushSubpagesToStorage(flushAt);
  await saveSnapshot(flushAt);
  await saveSubpageSnapshot(flushAt);
  cachedByDay = null;
  cachedByHour = null;
});
