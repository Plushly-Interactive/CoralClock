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
