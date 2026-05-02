import { formatMs, localDayKey } from './utils.js';
import { resolveSite } from './siteResolution.js';
import { ensureStorageVersion } from './migrations.js';
import {
  siteStates, siteIdFromUrl,
  setWindowSite, removeWindowSite, discardPending,
  flushToStorage, reconcileWindows, initTracking,
} from './tracking.js';

console.log('BiteGuard: background started');

let cachedByDay = null;
let cachedByHour = null;

chrome.alarms.create('flush', { periodInMinutes: 1 });
scheduleResetAlarms();
bootstrap();

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
  const newSite = setWindowSite(windowId, siteIdFromUrl(tab.url));
  await handleSiteChange(newSite);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    const newSite = setWindowSite(tab.windowId, siteIdFromUrl(tab.url));
    await handleSiteChange(newSite);
  }
});

chrome.windows.onCreated.addListener(async (window) => {
  if (window.state === 'minimized') return;
  const [tab] = await chrome.tabs.query({ windowId: window.id, active: true });
  const newSite = setWindowSite(window.id, siteIdFromUrl(tab?.url));
  await handleSiteChange(newSite);
});

chrome.windows.onRemoved.addListener((windowId) => {
  removeWindowSite(windowId);
});

async function handleSiteChange(newSite) {
  if (newSite === undefined) return;
  if (newSite) {
    await updateBadge(newSite);
    await checkAndBlock(newSite);
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// --- Alarms ---

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'reset-hour') { await resetPeriod('hour'); return; }
  if (alarm.name === 'reset-day')  { await resetPeriod('day');  return; }
  if (alarm.name === 'reset-week') { await resetPeriod('week'); return; }
  await reconcileWindows();
  await flushToStorage();
  cachedByDay = null;
  cachedByHour = null;
  for (const siteId of siteStates.keys()) await checkAndBlock(siteId);
});

// --- Rules ---

chrome.storage.onChanged.addListener(async ({ rules }) => {
  if (!rules) return;
  const oldRules = rules.oldValue ?? [];
  const newRules = rules.newValue ?? [];
  for (const old of oldRules) {
    const updated = newRules.find(r => r.id === old.id);
    if (!updated || !updated.enabled) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [hostnameToRuleId(old.target)]
      });
    }
  }
});

async function updateBadge(siteId) {
  const { timeRecords = {}, rules = [] } = await chrome.storage.local.get(['timeRecords', 'rules']);
  const hasRule = rules.some(r => r.enabled && resolveSite(r.target).siteId === siteId);
  const text = hasRule ? formatMs(timeRecords[siteId] ?? 0) : '';
  chrome.action.setBadgeText({ text });
}

async function checkAndBlock(siteId) {
  const { rules = [], timeRecords = {} } = await chrome.storage.local.get(['rules', 'timeRecords']);
  const rule = rules.find(r => r.enabled && resolveSite(r.target).siteId === siteId);
  if (!rule) return;
  const accumulated = timeRecords[siteId] ?? 0;
  if (accumulated < toLimitMs(rule)) return;
  const ruleId = hostnameToRuleId(rule.target);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: `/blocked.html?host=${rule.target}` } },
      condition: { urlFilter: `||${rule.target}^`, resourceTypes: ['main_frame'] }
    }]
  });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes(rule.target)) {
    chrome.tabs.update(tab.id, { url: chrome.runtime.getURL(`blocked.html?host=${rule.target}`) });
  }
}

function toLimitMs(rule) {
  const multipliers = { minutes: 60000, hours: 3600000, days: 86400000 };
  return rule.limit * (multipliers[rule.limitUnit] ?? 60000);
}

function hostnameToRuleId(hostname) {
  let hash = 0;
  for (const char of hostname) hash = (hash * 31 + char.charCodeAt(0)) & 0x7fffffff;
  return hash || 1;
}

async function scheduleResetAlarms() {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  const nextDay = new Date(now);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 0, 0, 0);
  const nextWeek = new Date(now);
  const daysUntilSunday = (7 - nextWeek.getDay()) % 7 || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilSunday);
  nextWeek.setHours(0, 0, 0, 0);
  if (!await chrome.alarms.get('reset-hour')) chrome.alarms.create('reset-hour', { when: nextHour.getTime(), periodInMinutes: 60 });
  if (!await chrome.alarms.get('reset-day'))  chrome.alarms.create('reset-day',  { when: nextDay.getTime(),  periodInMinutes: 1440 });
  if (!await chrome.alarms.get('reset-week')) chrome.alarms.create('reset-week', { when: nextWeek.getTime(), periodInMinutes: 10080 });
}

async function resetPeriod(period) {
  const { rules = [], timeRecords = {} } = await chrome.storage.local.get(['rules', 'timeRecords']);
  const allTargets     = rules.filter(r => r.period === period).map(r => r.target);
  const enabledTargets = rules.filter(r => r.period === period && r.enabled).map(r => r.target);
  for (const target of allTargets) {
    const { siteId } = resolveSite(target);
    timeRecords[siteId] = 0;
  }
  for (const target of enabledTargets) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [hostnameToRuleId(target)] });
  }
  const update = { timeRecords };
  if (period === 'day') update.dailyRecords = {};
  await chrome.storage.local.set(update);
  discardPending();
}
