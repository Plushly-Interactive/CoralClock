console.log('BiteGuard: background started');

let activeSession = null; // { hostname, startedAt }

chrome.alarms.create('flush', { periodInMinutes: 1 });

chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
  if (tab?.url) handleTabChange(tab.url);
});

chrome.alarms.onAlarm.addListener(async () => {
  if (!activeSession) return;
  const hostname = activeSession.hostname;
  await flushSession();
  activeSession = { hostname, startedAt: Date.now() };
  await updateBadge(hostname);
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
