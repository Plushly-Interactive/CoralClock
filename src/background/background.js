import { localDayKey, localHourKey } from '../shared/timeUtils.js';
import { weekDow } from '../shared/weekStart.js';
import { ensureStorageVersion } from '../data/migrations.js';
import { PREF_BADGE_ENABLED } from '../shared/prefKeys.js';
import { siteIdFromUrl } from './siteResolution.js';
import { computeOverage, publishOverage } from './enforcement.js';
import { usageSince } from '../data/intervalAggregates.js';
import { dbg, initDebug } from './trackingDebug.js';
import { updateBadge } from './badge.js';
// The interval tracker is the sole live capturer. It self-registers its capture
// listeners on import; background drives its periodic flush via flushNow() and a
// lighter per-navigation drain via flushToStorage.
import { flushNow, flushToStorage as drainIntervals } from './intervalTracker.js';

// Logged on every service-worker (re)start. A burst of these is the signal that
// the worker is churning (MV3 idle-suspend, crash-on-load, or dev reload), which
// can desync in-memory tracking state from live tabs. Unconditional (not gated
// on _debug): it runs at module load before initDebug() reads the flag, and it
// carries no URL/sensitive data — just a timestamp.
console.log(`[BG-DBG ${new Date().toISOString()}] SERVICE WORKER STARTED`);

function approachWindowKey(period, now) {
  if (period === 'hour') return localHourKey(now);
  if (period === 'week') {
    const dow = weekDow(new Date(now));
    const base = new Date(now);
    base.setDate(base.getDate() - dow);
    return localDayKey(base.getTime());
  }
  return localDayKey(now);
}

const PERIOD_LABEL = { hour: 'hourly', day: 'daily', week: 'weekly' };

function fmtMs(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(ms / 3600000);
  const rem = Math.round((ms % 3600000) / 60000);
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

// Notification dedup state. Loaded once from chrome.storage.session into a
// cached Promise so concurrent checkEnforcement calls (e.g. rapid navigations
// or redirect chains) share the same in-memory object and never read stale
// storage. Persisted back so state survives MV3 SW restarts within a session.
let _notifyStateP = null;

function getNotifyState() {
  if (!_notifyStateP) {
    _notifyStateP = chrome.storage.session.get('_notifyState').then(({ _notifyState: s }) => ({
      blocked: new Set(s?.blocked ?? []),
      approaching: new Map(Object.entries(s?.approaching ?? {})),
    }));
  }
  return _notifyStateP;
}

function persistNotifyState(state) {
  chrome.storage.session.set({
    _notifyState: {
      blocked: [...state.blocked],
      approaching: Object.fromEntries(state.approaching),
    },
  });
}

async function notifyBlocked(overage) {
  const state = await getNotifyState();
  for (const ruleId of state.blocked) {
    if (!overage.has(ruleId)) state.blocked.delete(ruleId);
  }
  let changed = false;
  for (const [ruleId, entry] of overage) {
    if (state.blocked.has(ruleId)) continue;
    state.blocked.add(ruleId);
    changed = true;
    const label = entry.target ?? entry.keyword ?? entry.pattern ?? 'A site';
    chrome.notifications.create(`blocked-${ruleId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('resources/icons/reef-icon-square-128px.png'),
      title: 'Time limit reached',
      message: `${label} is now blocked`,
    });
  }
  if (changed) persistNotifyState(state);
}

async function notifyApproaching(approaching, now) {
  const state = await getNotifyState();
  let changed = false;
  for (const [ruleId, entry] of approaching) {
    const windowKey = approachWindowKey(entry.period, now);
    if (state.approaching.get(ruleId) === windowKey) continue;
    state.approaching.set(ruleId, windowKey);
    changed = true;
    const label = entry.target ?? entry.keyword ?? entry.pattern ?? 'A site';
    const pct = Math.round(entry.pct * 100);
    const left = fmtMs(entry.remainingMs);
    chrome.notifications.create(`approach-${ruleId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('resources/icons/reef-icon-square-128px.png'),
      title: 'Approaching time limit',
      message: `${label} — ${pct}% of ${entry.limit} ${entry.limitUnit} ${PERIOD_LABEL[entry.period] ?? entry.period} limit used (${left} left)`,
    });
  }
  if (changed) persistNotifyState(state);
}

chrome.alarms.get('flush').then(existing => {
  if (!existing) chrome.alarms.create('flush', { periodInMinutes: 1 });
});
// Cutover left the old scalar interval-flush alarm orphaned on installed
// instances; clear it once so only the single 'flush' alarm fires.
chrome.alarms.clear('intervalFlush');
const bootstrapDone = bootstrap();
bootstrapDone.then(() => updateBadge());

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  chrome.tabs.create({
    url: chrome.runtime.getURL('src/pages/dashboard/dashboard.html?tour=1'),
  });
});

// Capture init lives in the interval tracker now; background's bootstrap only
// readies debug logging and the storage schema before its listeners run.
async function bootstrap() {
  await initDebug();
  dbg('bootstrap: start');
  try {
    await ensureStorageVersion();
    dbg('bootstrap: done');
    return;
  } catch (e) {
    dbg('bootstrap: FAILED', e?.message ?? e, e?.stack);
    throw e;
  }
}

// --- Tab / window events ---

chrome.tabs.onActivated.addListener(async () => {
  await bootstrapDone;
  updateBadge();
});

async function cacheFavicon(hostname, url) {
  if (!url || !url.startsWith('http')) return;
  const { faviconCache = {} } = await chrome.storage.local.get('faviconCache');
  if (faviconCache[hostname]?.url === url) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const type = res.headers.get('content-type') || 'image/png';
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    faviconCache[hostname] = { url, dataUrl: `data:${type};base64,${btoa(binary)}` };
    await chrome.storage.local.set({ faviconCache });
  } catch { /* ignore network errors */ }
}

// Favicon caching and the badge live here; all usage capture (active/audio/idle)
// is the interval tracker's own onUpdated listener.
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  await bootstrapDone;
  if (changeInfo.favIconUrl) {
    const hostname = siteIdFromUrl(tab.url);
    if (hostname) cacheFavicon(hostname, changeInfo.favIconUrl);
  }
  if (changeInfo.status === 'complete' && tab.active) updateBadge();
});

chrome.windows.onFocusChanged.addListener(async (_windowId) => {
  await bootstrapDone;
  updateBadge();
});

// --- Flush alarm ---

// One alarm drives the interval tracker's flush, then the enforcement check that
// reads its freshly-written rows, then the badge — in sequence, so enforcement
// never reads pre-flush usage.
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'flush') return;
  await bootstrapDone;
  const now = Date.now();
  await flushNow();
  await checkEnforcement(now);
  updateBadge();
});

// React to rule edits immediately (enable/disable/add/delete) rather than
// waiting for the next flush — so disabling unblocks and enabling an
// already-crossed rule blocks right away.
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes.rules) return;
  await bootstrapDone;
  await checkEnforcement(Date.now());
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !(PREF_BADGE_ENABLED in changes)) return;
  updateBadge();
});

// Earliest instant any active rule window can reach back to: this calendar week's
// start (covers week rules; day/hour windows are nested inside it). Matches
// enforcement.js windowKeys' week-start (weekDow from the user's week-start day).
function enforcementWindowStart(now) {
  const dow = weekDow(new Date(now));
  const d = new Date(now);
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Compute which rules are over their limit and publish DNR redirect rules so
// over-limit sites are blocked until the period window rolls over. Reads usage
// from the interval log (the authoritative tracker) over the active rule window;
// computeOverage is unchanged, only its data source is interval-derived now.
async function checkEnforcement(now) {
  const { rules = [] } = await chrome.storage.local.get('rules');
  const stores = await usageSince(enforcementWindowStart(now));

  const { overage, approaching } = computeOverage(rules, stores, now);
  await publishOverage(overage);
  await notifyBlocked(overage);
  await notifyApproaching(approaching, now);
}

// Pre-emptive block: on a main-frame navigation, drain the interval tracker's
// accrued ranges to the log and re-check limits *before* relying on the next flush
// tick. drainIntervals writes the pending in-memory ranges up to `now`, so the
// check (which reads the log) sees usage as current as this instant — catching a
// crossing since the last flush. The freshly-published DNR rule plus
// reloadMatchingTabs then block the site without waiting for the flush alarm.
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; // main frame only
  if (!details.url?.startsWith('http')) return;
  await bootstrapDone;
  const now = Date.now();
  await drainIntervals(now);
  await checkEnforcement(now);
});
