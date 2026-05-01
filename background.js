import { formatMs } from './utils.js';
import { resolveSite } from './siteResolution.js';

console.log('BiteGuard: background started');

let activeVisit = null;
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

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (tab?.url) handleTabChange(tab.url);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'reset-hour') { await resetPeriod('hour'); return; }
  if (alarm.name === 'reset-day')  { await resetPeriod('day');  return; }
  if (alarm.name === 'reset-week') { await resetPeriod('week'); return; }

  if (!activeVisit) return;
  const hostname = activeVisit.hostname;
  await flushSession();
  activeVisit = { hostname, startedAt: Date.now() };
  await updateBadge(hostname);
  await checkAndBlock(hostname);
});

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

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId);
  await handleTabChange(tab.url);
});

chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await handleTabChange(tab.url);
  }
});

function localDayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localHourKey(ts) {
  return `${localDayKey(ts)}T${String(new Date(ts).getHours()).padStart(2, '0')}`;
}

async function flushSession() {
  if (!activeVisit) return;
  const elapsed = Date.now() - activeVisit.startedAt;
  const { timeRecords = {}, dailyRecords = {}, analyticsByDay = {}, analyticsByHour = {} } = await chrome.storage.local.get(['timeRecords', 'dailyRecords', 'analyticsByDay', 'analyticsByHour']);
  const h = activeVisit.hostname;
  timeRecords[h] = (timeRecords[h] ?? 0) + elapsed;
  dailyRecords[h] = (dailyRecords[h] ?? 0) + elapsed;

  const { siteId } = resolveSite(h);
  const day = localDayKey(Date.now());
  const hour = localHourKey(Date.now());
  analyticsByDay[day] ??= {};
  analyticsByDay[day][siteId] ??= { ms: 0, visits: 0 };
  analyticsByDay[day][siteId].ms += elapsed;
  analyticsByHour[hour] ??= {};
  analyticsByHour[hour][siteId] ??= { ms: 0, visits: 0 };
  analyticsByHour[hour][siteId].ms += elapsed;

  await chrome.storage.local.set({ timeRecords, dailyRecords, analyticsByDay, analyticsByHour });
  cachedByDay = null;
  cachedByHour = null;
  activeVisit = null;
}

async function handleTabChange(url) {
  await flushSession();
  if (!url?.startsWith('http')) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const raw = new URL(url).hostname;
  const { rules = [] } = await chrome.storage.local.get('rules');
  const rule = rules.find(r => r.enabled && (r.target === raw || raw.endsWith('.' + r.target)));
  const hostname = rule ? rule.target : raw;
  activeVisit = { hostname, startedAt: Date.now() };

  const { siteId: newSiteId } = resolveSite(hostname);
  const { analyticsByDay: newByDay = {}, analyticsByHour: newByHour = {} } = await chrome.storage.local.get(['analyticsByDay', 'analyticsByHour']);
  const newDay = localDayKey(Date.now());
  const newHour = localHourKey(Date.now());
  newByDay[newDay] ??= {};
  newByDay[newDay][newSiteId] ??= { ms: 0, visits: 0 };
  newByDay[newDay][newSiteId].visits += 1;
  newByHour[newHour] ??= {};
  newByHour[newHour][newSiteId] ??= { ms: 0, visits: 0 };
  newByHour[newHour][newSiteId].visits += 1;
  await chrome.storage.local.set({ analyticsByDay: newByDay, analyticsByHour: newByHour });
  cachedByDay = null;
  cachedByHour = null;

  await updateBadge(hostname);
  await checkAndBlock(hostname);
  console.log(`tracking: ${hostname}`);
}

async function updateBadge(hostname) {
  const { timeRecords = {}, rules = [] } = await chrome.storage.local.get(['timeRecords', 'rules']);
  const hasActiveRule = rules.some(r => r.enabled && r.target === hostname);
  const text = hasActiveRule ? formatMs(timeRecords[hostname] ?? 0) : '';
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

  for (const target of allTargets) timeRecords[target] = 0;
  for (const target of enabledTargets) {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [hostnameToRuleId(target)] });
  }

  const update = { timeRecords };
  if (period === 'day') update.dailyRecords = {};
  await chrome.storage.local.set(update);

  if (activeVisit && allTargets.includes(activeVisit.hostname)) {
    activeVisit.startedAt = Date.now();
  }
}

async function checkAndBlock(hostname) {
  const { rules = [], timeRecords = {} } = await chrome.storage.local.get(['rules', 'timeRecords']);
  const rule = rules.find(r => r.enabled && r.target === hostname);
  if (!rule) return;

  const accumulated = timeRecords[hostname] ?? 0;
  if (accumulated < toLimitMs(rule)) return;

  const ruleId = hostnameToRuleId(hostname);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [ruleId],
    addRules: [{
      id: ruleId,
      priority: 1,
      action: { type: 'redirect', redirect: { extensionPath: `/blocked.html?host=${hostname}` } },
      condition: { urlFilter: `||${hostname}^`, resourceTypes: ['main_frame'] }
    }]
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url?.includes(hostname)) {
    chrome.tabs.update(tab.id, { url: chrome.runtime.getURL(`blocked.html?host=${hostname}`) });
  }
}
