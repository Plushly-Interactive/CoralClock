import { formatMs } from './utils.js';

console.log('BiteGuard: background started');

let activeSession = null; // { hostname, startedAt }

chrome.alarms.create('flush', { periodInMinutes: 1 });
scheduleResetAlarms();

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (tab?.url) handleTabChange(tab.url);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'reset-hour') { await resetPeriod('hour'); return; }
  if (alarm.name === 'reset-day')  { await resetPeriod('day');  return; }
  if (alarm.name === 'reset-week') { await resetPeriod('week'); return; }

  if (!activeSession) return;
  const hostname = activeSession.hostname;
  await flushSession();
  activeSession = { hostname, startedAt: Date.now() };
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

async function flushSession() {
  if (!activeSession) return;
  const elapsed = Date.now() - activeSession.startedAt;
  const { timeRecords = {}, dailyRecords = {} } = await chrome.storage.local.get(['timeRecords', 'dailyRecords']);
  const h = activeSession.hostname;
  timeRecords[h] = (timeRecords[h] ?? 0) + elapsed;
  dailyRecords[h] = (dailyRecords[h] ?? 0) + elapsed;
  await chrome.storage.local.set({ timeRecords, dailyRecords });
  activeSession = null;
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
  activeSession = { hostname, startedAt: Date.now() };
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

  if (activeSession && allTargets.includes(activeSession.hostname)) {
    activeSession.startedAt = Date.now();
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
