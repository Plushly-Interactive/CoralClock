import { localDayKey, localHourKey } from '../shared/timeUtils.js';
import { RULE_MULTIPLIERS } from '../shared/rules.js';

// Usage contributed by one analytics/subpage cell under the rule's mode.
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
// `week` is a *calendar* week (Monday-start): from this Monday through today,
// resetting at the week boundary like `day`/`hour`. A rolling-7-day variant is
// a deferred TODO (see docs/features/enforcement.md).
function windowKeys(period, now) {
  if (period === 'hour') return { type: 'hour', keys: [localHourKey(now)] };
  if (period === 'week') {
    const d = new Date(now);
    const dow = (d.getDay() + 6) % 7; // 0 = Monday … 6 = Sunday
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
  const { target, matchType, mode, path } = rule;

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
  const { analyticsByDay = {}, analyticsByHour = {}, subpagesByDay = {}, subpagesByHour = {} } = stores;
  const overage = new Map();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const { type, keys } = windowKeys(rule.period, now);
    const siteBuckets = type === 'hour' ? analyticsByHour : analyticsByDay;
    const subpageBuckets = type === 'hour' ? subpagesByHour : subpagesByDay;

    let used = 0;
    for (const k of keys) used += sumBucket(rule, siteBuckets[k], subpageBuckets[k]);

    const limitMs = rule.limit * (RULE_MULTIPLIERS[rule.limitUnit] ?? 60000);
    if (used > limitMs) {
      overage.set(rule.id, { target: rule.target, matchType: rule.matchType, path: rule.path, overBy: used - limitMs });
    }
  }
  return overage;
}
