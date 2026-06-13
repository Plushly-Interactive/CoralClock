import { siteIdFromUrl, pathFromUrl } from './siteResolution.js';
import {
  setWindowPath, removeWindowPath, addAudibleTabPath, removeAudibleTabPath,
  initTracking, reconcileWindows, flushToStorage,
  saveSnapshot, recoverFromSnapshot, applyIdleClip,
} from './intervalPageTracking.js';
import { getIdleThresholdSec, DEFAULT_IDLE_THRESHOLD_SEC } from '../shared/idleConfig.js';
import { PREF_IDLE_THRESHOLD_SEC } from '../shared/prefKeys.js';

// Interval-tracking sidecar entry. Mirrors background.js's SUBPAGE-tracking
// wiring (same listeners incl. SPA navigation, same bootstrap, same flush alarm,
// same idle handling) but drives the duplicated interval module keyed on
// domain+path, so capture is identical to the real subpage tracker. No
// enforcement/badge/messaging. Self-registers on import; delete this file + its
// import line + the other interval files to remove the experiment.

let bootstrapAt;
let coldStart = false;
let idleStartedAt = null;
let cachedIdleThresholdMs = DEFAULT_IDLE_THRESHOLD_SEC * 1000;

chrome.alarms.get('intervalFlush').then(existing => {
  if (!existing) chrome.alarms.create('intervalFlush', { periodInMinutes: 1 });
});
const bootstrapDone = bootstrap();

chrome.runtime.onStartup.addListener(() => {
  coldStart = true;
  chrome.storage.local.remove('_intervalSnapshot');
});

async function bootstrap() {
  bootstrapAt = Date.now();
  await initTracking();
  await seedIdleState();
}

async function seedIdleState() {
  const sec = await getIdleThresholdSec();
  cachedIdleThresholdMs = sec * 1000;
  chrome.idle.setDetectionInterval(sec);
  const state = await chrome.idle.queryState(sec);
  if (state === 'idle' || state === 'locked') idleStartedAt = Date.now() - cachedIdleThresholdMs;
}

// --- tab / window events (same signals background.js feeds the subpage tracker) ---

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await bootstrapDone;
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab?.active) return;
  setWindowPath(tab.windowId, siteIdFromUrl(tab.url), pathFromUrl(tab.url));
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  await bootstrapDone;
  if (changeInfo.status === 'complete' && tab.active) {
    setWindowPath(tab.windowId, siteIdFromUrl(tab.url), pathFromUrl(tab.url));
  }
  if (changeInfo.status === 'complete' || 'audible' in changeInfo) {
    if (tab.audible && !tab.mutedInfo?.muted) addAudibleTabPath(tab.id, siteIdFromUrl(tab.url), pathFromUrl(tab.url));
    else removeAudibleTabPath(tab.id);
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await bootstrapDone;
  removeAudibleTabPath(tabId);
});

chrome.windows.onCreated.addListener(async (window) => {
  await bootstrapDone;
  if (window.state === 'minimized') return;
  const [tab] = await chrome.tabs.query({ windowId: window.id, active: true });
  setWindowPath(window.id, siteIdFromUrl(tab?.url), pathFromUrl(tab?.url));
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  await bootstrapDone;
  removeWindowPath(windowId);
});

// SPA navigation — path changes without a full load (domain unchanged).
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  await bootstrapDone;
  if (details.frameId !== 0) return;
  const tab = await chrome.tabs.get(details.tabId).catch(() => null);
  if (!tab) return;
  const siteId = siteIdFromUrl(details.url);
  const path = pathFromUrl(details.url);
  if (tab.active) setWindowPath(tab.windowId, siteId, path);
  if (tab.audible && !tab.mutedInfo?.muted) addAudibleTabPath(tab.id, siteId, path);
});

// --- flush alarm (mirrors background.js's flush handler) ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'intervalFlush') return;
  await bootstrapDone;
  if (coldStart) {
    await chrome.storage.local.remove('_intervalSnapshot');
    coldStart = false;
  }
  await recoverFromSnapshot(bootstrapAt, idleStartedAt);
  await reconcileWindows();
  const flushAt = Date.now();
  if (idleStartedAt !== null) applyIdleClip(idleStartedAt, flushAt);
  await flushToStorage(flushAt);
  await saveSnapshot(flushAt);
});

// --- idle ---

chrome.idle.onStateChanged.addListener((state) => {
  if (state === 'idle' || state === 'locked') {
    if (idleStartedAt === null) idleStartedAt = Date.now() - cachedIdleThresholdMs;
  } else {
    if (idleStartedAt !== null) applyIdleClip(idleStartedAt, Date.now());
    idleStartedAt = null;
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[PREF_IDLE_THRESHOLD_SEC]) return;
  const sec = await getIdleThresholdSec();
  cachedIdleThresholdMs = sec * 1000;
  chrome.idle.setDetectionInterval(sec);
});
