import { localDayKey, localHourKey } from '../shared/timeUtils.js';
import { RULE_MULTIPLIERS, describeRule, BLOCKS_DAY_KEY, blockKey } from '../shared/rules.js';
import { weekDow } from '../shared/weekStart.js';
import { siteIdFromUrl, pathFromUrl } from './siteResolution.js';

// Usage contributed by one site/subpage cell under the rule's mode.
function cellUsage(cell, mode) {
  if (!cell) return 0;
  const active = cell.activeMs ?? 0;
  const audio = cell.audioMs ?? 0;
  const overlap = cell.overlapMs ?? 0;
  if (mode === 'audio') return audio;
  if (mode === 'active+audio') return active + audio - overlap;
  return active; // 'active' (default)
}

// The day/hour bucket keys covering the rule's period window, ending at `now`.
// `week` is a *calendar* week starting on the user's configured week-start day
// (default Monday): from this week-start through today, resetting at the week
// boundary like `day`/`hour`. A rolling-7-day variant is a deferred TODO
// (see docs/features/enforcement.md).
function windowKeys(period, now) {
  if (period === 'hour') return { type: 'hour', keys: [localHourKey(now)] };
  if (period === 'week') {
    const dow = weekDow(new Date(now));
    const keys = [];
    for (let i = dow; i >= 0; i--) {
      const day = new Date(now);
      day.setDate(day.getDate() - i);
      keys.push(localDayKey(day.getTime()));
    }
    return { type: 'day', keys };
  }
  return { type: 'day', keys: [localDayKey(now)] }; // 'day' (default)
}

// Does subpage key `p` fall under the rule's path? Boundary-anchored so
// '/maps' matches '/maps', '/maps/x', '/maps?x' but not '/maps-beta'.
function pathUnder(p, rulePath) {
  const base = '/' + rulePath.replace(/^\//, '');
  if (p === base) return true;
  if (!p.startsWith(base)) return false;
  const next = p[base.length];
  return next === '/' || next === '?';
}

// Sum a rule's usage over one bucket (a `{ siteId: cell }` or, for subpages,
// `{ siteId: { path: cell } }` map).
function sumBucket(rule, siteBucket, subpageBucket) {
  if (!siteBucket && !subpageBucket) return 0;
  const { target, matchType, mode, path, pattern, keyword } = rule;

  if (matchType === 'regex') {
    try {
      const re = new RegExp(pattern);
      let sum = 0;
      for (const [siteId, paths] of Object.entries(subpageBucket ?? {})) {
        for (const [p, cell] of Object.entries(paths)) {
          if (re.test(`https://${siteId}${p}`)) sum += cellUsage(cell, mode);
        }
      }
      return sum;
    } catch { return 0; }
  }

  if (matchType === 'keyword') {
    let sum = 0;
    for (const [siteId, paths] of Object.entries(subpageBucket ?? {})) {
      for (const [p, cell] of Object.entries(paths)) {
        if (`https://${siteId}${p}`.includes(keyword)) sum += cellUsage(cell, mode);
      }
    }
    return sum;
  }

  if (matchType === 'host') {
    return cellUsage(siteBucket?.[target], mode);
  }
  if (matchType === 'subdomain') {
    let sum = 0;
    for (const [siteId, cell] of Object.entries(siteBucket ?? {})) {
      if (siteId === target || siteId.endsWith(`.${target}`)) sum += cellUsage(cell, mode);
    }
    return sum;
  }
  // pathPrefix
  let sum = 0;
  const paths = subpageBucket?.[target];
  if (paths) {
    for (const [p, cell] of Object.entries(paths)) {
      if (pathUnder(p, path)) sum += cellUsage(cell, mode);
    }
  }
  return sum;
}

// Pure. For each enabled rule, sum usage over its period window and compare to
// the limit. Returns Map<ruleId, { target, matchType, path, overBy }> for rules
// currently over their limit. No chrome APIs.
export function computeOverage(rules, stores, now = Date.now()) {
  const { sitesByDay = {}, sitesByHour = {}, subpagesByDay = {}, subpagesByHour = {} } = stores;
  const overage = new Map();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const { type, keys } = windowKeys(rule.period, now);
    const siteBuckets = type === 'hour' ? sitesByHour : sitesByDay;
    const subpageBuckets = type === 'hour' ? subpagesByHour : subpagesByDay;

    let used = 0;
    for (const k of keys) used += sumBucket(rule, siteBuckets[k], subpageBuckets[k]);

    const limitMs = rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
    if (limitMs === 0 || used > limitMs) {
      const base = { matchType: rule.matchType, overBy: used - limitMs };
      const entry = rule.matchType === 'regex'   ? { ...base, pattern: rule.pattern }
                  : rule.matchType === 'keyword' ? { ...base, keyword: rule.keyword }
                  : { ...base, target: rule.target, path: rule.path };
      overage.set(rule.id, entry);
    }
  }
  return overage;
}

// --- DNR publisher (chrome APIs) ---

function blockedUrl(ruleId, entry, originalUrl) {
  const params = new URLSearchParams({ rule: ruleId });
  if (entry.target) {
    params.set('site', entry.target);
    if (entry.path) params.set('path', entry.path);
  }
  if (originalUrl) params.set('url', originalUrl);
  return chrome.runtime.getURL(`src/pages/blocked/blocked.html?${params}`);
}

function buildRule(ruleId, entry, id) {
  const { kind, value } = describeRule(entry);
  return {
    id,
    priority: 1,
    action: { type: 'redirect', redirect: { url: blockedUrl(ruleId, entry) } },
    condition: { [kind]: value, resourceTypes: ['main_frame'] },
  };
}

// Does an open tab's URL fall under this overage entry? Mirrors sumBucket's
// matching (same siteId/path normalization), so reloaded tabs are exactly the
// ones DNR will then redirect.
function tabMatchesEntry(url, entry) {
  if (entry.matchType === 'regex') {
    try { return new RegExp(entry.pattern).test(url); } catch { return false; }
  }
  if (entry.matchType === 'keyword') return url.includes(entry.keyword);
  const siteId = siteIdFromUrl(url);
  if (!siteId) return false;
  if (entry.matchType === 'subdomain') return siteId === entry.target || siteId.endsWith(`.${entry.target}`);
  if (entry.matchType === 'pathPrefix') return siteId === entry.target && pathUnder(pathFromUrl(url) ?? '', entry.path);
  return siteId === entry.target; // host
}

// DNR redirects new requests, not tabs already sitting on a page. So for any
// open http(s) tab covered by an over-limit entry, navigate it to the blocked
// page ourselves — carrying the tab's exact URL so unblock can restore it.
// Tabs already on blocked.html (a chrome-extension URL) don't match, so there's
// no loop. Driven by the full overage set so it also catches tabs open before
// the rule existed (e.g. when a rule is enabled).
async function reloadMatchingTabs(overage) {
  const pairs = [...overage]; // [ruleId, entry]
  if (!pairs.length) return;
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url) continue;
    const hit = pairs.find(([, e]) => tabMatchesEntry(tab.url, e));
    if (!hit) continue;
    const [ruleId, entry] = hit;
    // We know the exact page this tab is on, so send it to the blocked page
    // ourselves with the original URL preserved — returnUnblockedTabs uses it to
    // restore the exact page on unblock. (DNR still catches fresh navigations;
    // those carry no original URL and fall back to the rule target.)
    chrome.tabs.update(tab.id, { url: blockedUrl(ruleId, entry, tab.url) });
  }
}

// Send blocked.html tabs back to their site once their rule is no longer
// enforced (limit reset, or rule disabled/deleted). A blocked tab carries its
// origin in ?rule/?site/?path; if that rule id is no longer over-limit, navigate
// it back. Reconstructs https://<site>[/<path>] — scheme/query aren't preserved.
async function returnUnblockedTabs(overage) {
  const prefix = chrome.runtime.getURL('src/pages/blocked/blocked.html');
  const tabs = await chrome.tabs.query({ url: `${prefix}*` });
  for (const tab of tabs) {
    const params = new URLSearchParams(new URL(tab.url).search);
    const ruleId = params.get('rule');
    if (!ruleId || overage.has(ruleId)) continue; // still blocked
    // Prefer the exact original URL (set when we reloaded the tab into the
    // block); fall back to the rule target for tabs DNR blocked on a fresh nav.
    const original = params.get('url');
    if (original?.startsWith('http')) {
      chrome.tabs.update(tab.id, { url: original });
      continue;
    }
    const site = params.get('site');
    const path = params.get('path');
    if (!site) continue;
    chrome.tabs.update(tab.id, { url: `https://${site}${path ? `/${path}` : ''}` });
  }
}

// Reconcile the published DNR rules against the current overage set. Adds rules
// for newly-over entries, removes rules no longer over. Uses getDynamicRules as
// the source of truth so it self-heals across service-worker restarts.
export async function publishOverage(overage) {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();

  // Reconstruct ruleId → dnrId from existing redirect URLs so we reuse the
  // same integer IDs across ticks (no hash, no collisions).
  const liveMap = new Map();
  const usedIds = new Set();
  for (const r of existing) {
    usedIds.add(r.id);
    try {
      const ruleId = new URL(r.action.redirect.url).searchParams.get('rule');
      if (ruleId) liveMap.set(ruleId, r.id);
    } catch {}
  }

  let nextId = 1;
  function freshId() {
    while (usedIds.has(nextId)) nextId++;
    usedIds.add(nextId);
    return nextId++;
  }

  const desired = new Map();
  const newRuleIds = new Set();
  for (const [ruleId, entry] of overage) {
    const id = liveMap.get(ruleId) ?? freshId();
    desired.set(id, buildRule(ruleId, entry, id));
    if (!liveMap.has(ruleId)) newRuleIds.add(ruleId);
  }

  const existingIds = new Set(existing.map(r => r.id));
  const addRules = [...desired.values()].filter(r => !existingIds.has(r.id));
  const removeRuleIds = existing.map(r => r.id).filter(id => !desired.has(id));

  if (addRules.length || removeRuleIds.length) {
    await chrome.declarativeNetRequest.updateDynamicRules({ addRules, removeRuleIds });
  }

  if (addRules.length) {
    const dayKey = localDayKey(Date.now());
    const { [BLOCKS_DAY_KEY]: blocksByDay = {} } = await chrome.storage.local.get(BLOCKS_DAY_KEY);
    const today = blocksByDay[dayKey] ?? {};
    for (const [ruleId, entry] of overage) {
      if (newRuleIds.has(ruleId)) {
        const key = blockKey(entry);
        today[key] = (today[key] ?? 0) + 1;
      }
    }
    blocksByDay[dayKey] = today;
    await chrome.storage.local.set({ [BLOCKS_DAY_KEY]: blocksByDay });
  }

  await reloadMatchingTabs(overage);
  await returnUnblockedTabs(overage);
}
