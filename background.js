import { formatMs } from './utils.js';
import { resolveSite } from './siteResolution.js';

console.log('BiteGuard: background started');

const siteStates = new Map();
const windowToSite = new Map();
const pending = new Map();
const pendingVisits = new Map();

let cachedByDay = null;
let cachedByHour = null;

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

chrome.alarms.create('flush', { periodInMinutes: 1 });
scheduleResetAlarms();
bootstrap();

async function bootstrap() {
  const windows = await chrome.windows.getAll({ populate: true });
  for (const w of windows) {
    if (w.state === 'minimized') continue;
    const tab = w.tabs?.find(t => t.active);
    const siteId = siteIdFromUrl(tab?.url);
    if (siteId) addWindowSite(w.id, siteId);
  }
}

function siteIdFromUrl(url) {
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

function removeWindowSite(windowId) {
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
  const elapsed = Date.now() - s.startedAt;
  if (elapsed > 0) pending.set(siteId, (pending.get(siteId) ?? 0) + elapsed);
  s.startedAt = Date.now();
}

async function setWindowSite(windowId, newSiteId) {
  const oldSiteId = windowToSite.get(windowId);
  if (oldSiteId === newSiteId) return;
  if (oldSiteId !== undefined) removeWindowSite(windowId);
  if (newSiteId) {
    addWindowSite(windowId, newSiteId);
    pendingVisits.set(newSiteId, (pendingVisits.get(newSiteId) ?? 0) + 1);
    await updateBadge(newSiteId);
    await checkAndBlock(newSiteId);
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

chrome.tabs.onActivated.addListener(async ({ windowId, tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await setWindowSite(windowId, siteIdFromUrl(tab.url));
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await setWindowSite(tab.windowId, siteIdFromUrl(tab.url));
  }
});

chrome.windows.onCreated.addListener(async (window) => {
  if (window.state === 'minimized') return;
  const [tab] = await chrome.tabs.query({ windowId: window.id, active: true });
  await setWindowSite(window.id, siteIdFromUrl(tab?.url));
});

chrome.windows.onRemoved.addListener((windowId) => {
  removeWindowSite(windowId);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'reset-hour') { await resetPeriod('hour'); return; }
  if (alarm.name === 'reset-day')  { await resetPeriod('day');  return; }
  if (alarm.name === 'reset-week') { await resetPeriod('week'); return; }
  await reconcileWindows();
  await flushToStorage();
  for (const siteId of siteStates.keys()) await checkAndBlock(siteId);
});

async function reconcileWindows() {
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

async function flushToStorage() {
  for (const siteId of siteStates.keys()) recordElapsed(siteId);
  if (pending.size === 0 && pendingVisits.size === 0) return;
  const { timeRecords = {}, dailyRecords = {}, analyticsByDay = {}, analyticsByHour = {} } =
    await chrome.storage.local.get(['timeRecords', 'dailyRecords', 'analyticsByDay', 'analyticsByHour']);
  const day = localDayKey(Date.now());
  const hour = localHourKey(Date.now());
  analyticsByDay[day] ??= {};
  analyticsByHour[hour] ??= {};
  for (const [siteId, ms] of pending) {
    timeRecords[siteId] = (timeRecords[siteId] ?? 0) + ms;
    dailyRecords[siteId] = (dailyRecords[siteId] ?? 0) + ms;
    analyticsByDay[day][siteId] ??= { ms: 0, visits: 0 };
    analyticsByDay[day][siteId].ms += ms;
    analyticsByHour[hour][siteId] ??= { ms: 0, visits: 0 };
    analyticsByHour[hour][siteId].ms += ms;
  }
  for (const [siteId, count] of pendingVisits) {
    analyticsByDay[day][siteId] ??= { ms: 0, visits: 0 };
    analyticsByDay[day][siteId].visits += count;
    analyticsByHour[hour][siteId] ??= { ms: 0, visits: 0 };
    analyticsByHour[hour][siteId].visits += count;
  }
  pending.clear();
  pendingVisits.clear();
  await chrome.storage.local.set({ timeRecords, dailyRecords, analyticsByDay, analyticsByHour });
  cachedByDay = null;
  cachedByHour = null;
}

function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localHourKey(ts) {
  return `${localDayKey(ts)}T${String(new Date(ts).getHours()).padStart(2, '0')}`;
}

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
  if (!siteId) { chrome.action.setBadgeText({ text: '' }); return; }
  const { timeRecords = {}, rules = [] } = await chrome.storage.local.get(['timeRecords', 'rules']);
  const hasRule = rules.some(r => r.enabled && resolveSite(r.target).siteId === siteId);
  const text = hasRule ? formatMs(timeRecords[siteId] ?? 0) : '';
  chrome.action.setBadgeText({ text });
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

  for (const siteId of siteStates.keys()) recordElapsed(siteId);
  pending.clear();
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
