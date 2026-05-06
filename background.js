import { localDayKey } from './utils.js';
import { ensureStorageVersion } from './migrations.js';
import {
  siteIdFromUrl,
  setWindowSite, removeWindowSite,
  addAudibleTab, removeAudibleTab,
  flushToStorage, reconcileWindows, initTracking,
  saveSnapshot, recoverFromSnapshot,
} from './tracking.js';

console.log('BiteGuard: background started');

let cachedByDay = null;
let cachedByHour = null;

chrome.alarms.get('flush').then(existing => {
  if (!existing) chrome.alarms.create('flush', { periodInMinutes: 1 });
});
const bootstrapDone = bootstrap();

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.remove('_trackingSnapshot');
});

async function bootstrap() {
  await ensureStorageVersion();
  await initTracking();
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
    getAvgPerClockHour(msg.siteId, msg.range).then(sendResponse);
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

async function getAvgPerClockHour(siteId, range) {
  if (!cachedByHour) {
    const { analyticsByHour = {} } = await chrome.storage.local.get('analyticsByHour');
    cachedByHour = analyticsByHour;
  }
  const now = new Date();
  const todayKey = localDayKey(now.getTime());

  let dayKeys;
  if (range === 'all') {
    const all = new Set();
    for (const hourKey of Object.keys(cachedByHour)) all.add(hourKey.slice(0, 10));
    all.delete(todayKey);
    dayKeys = [...all];
  } else {
    const days = parseInt(range);
    dayKeys = [];
    for (let d = 1; d <= days; d++) {
      const day = new Date(now);
      day.setDate(day.getDate() - d);
      dayKeys.push(localDayKey(day.getTime()));
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
      if (siteId) {
        sums[h] += bucket[siteId]?.activeMs ?? 0;
      } else {
        for (const entry of Object.values(bucket)) sums[h] += entry.activeMs ?? 0;
      }
    }
  }
  return sums.map(s => s / D);
}

// --- Tab / window events ---

chrome.tabs.onActivated.addListener(async ({ windowId, tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  setWindowSite(windowId, siteIdFromUrl(tab.url));
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    setWindowSite(tab.windowId, siteIdFromUrl(tab.url));
  }
  if (changeInfo.status === 'complete') {
    // Catches audible tab navigating between sites without going silent (changeInfo.audible won't fire)
    if (tab.audible && !tab.mutedInfo?.muted) {
      addAudibleTab(tab.id, siteIdFromUrl(tab.url));
    } else {
      removeAudibleTab(tab.id);
    }
  }
  if ('audible' in changeInfo) {
    if (changeInfo.audible && !tab.mutedInfo?.muted) {
      addAudibleTab(tab.id, siteIdFromUrl(tab.url));
    } else {
      removeAudibleTab(tab.id);
    }
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeAudibleTab(tabId);
});

chrome.windows.onCreated.addListener(async (window) => {
  if (window.state === 'minimized') return;
  const [tab] = await chrome.tabs.query({ windowId: window.id, active: true });
  setWindowSite(window.id, siteIdFromUrl(tab?.url));
});

chrome.windows.onRemoved.addListener((windowId) => {
  removeWindowSite(windowId);
});

// --- Flush alarm ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'flush') return;
  await bootstrapDone;
  await recoverFromSnapshot();
  await reconcileWindows();
  await flushToStorage();
  await saveSnapshot();
  cachedByDay = null;
  cachedByHour = null;
});
