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
  const { timeRecords = {} } = await chrome.storage.local.get('timeRecords');
  timeRecords[activeSession.hostname] = (timeRecords[activeSession.hostname] ?? 0) + elapsed;
  await chrome.storage.local.set({ timeRecords });
  console.log(`flushed: ${activeSession.hostname}`);
  activeSession = null;
}

async function handleTabChange(url) {
  await flushSession();
  if (!url?.startsWith('http')) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const hostname = new URL(url).hostname;
  activeSession = { hostname, startedAt: Date.now() };
  await updateBadge(hostname);
  await checkAndBlock(hostname);
  console.log(`tracking: ${hostname}`);
}

function formatMs(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = ms / 3600000;
  const days = ms / 86400000;

  if (ms < 3600000)  return `${totalMinutes}m`;
  if (ms < 36000000) return `${Math.floor(hours)}h${totalMinutes % 60}m`;
  if (ms < 86400000) return `${hours.toFixed(1)}h`;
  return `${days.toFixed(1)}d`;
}

async function updateBadge(hostname) {
  const { timeRecords = {} } = await chrome.storage.local.get('timeRecords');
  chrome.action.setBadgeText({ text: formatMs(timeRecords[hostname] ?? 0) });
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
  const targets = rules.filter(r => r.enabled && r.period === period).map(r => r.target);
  if (!targets.length) return;

  for (const target of targets) {
    timeRecords[target] = 0;
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: [hostnameToRuleId(target)] });
  }
  await chrome.storage.local.set({ timeRecords });

  if (activeSession && targets.includes(activeSession.hostname)) {
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
