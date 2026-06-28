import { intervalFetch } from './intervalProvider.js';
import { earliestDayKey } from './intervalAggregates.js';
import { fetchTrackingData, isMockMode } from '../shared/tourMockData.js';
import { localDayKey } from '../shared/timeUtils.js';
import {
  MSG_GET_SITES_BY_DAY, MSG_GET_SITES_BY_HOUR_TODAY, MSG_GET_SITES_BY_HOUR_FOR_DAY,
  MSG_GET_SUBPAGES_BY_DAY, MSG_GET_SUBPAGES_BY_HOUR, MSG_GET_AVG_PER_CLOCK_HOUR,
} from '../shared/msgTypes.js';

// The Phase B authoritative tracking-data reader for the main dashboard and
// site/path pages. Promotes the interval log to the single source of truth, merging
// the frozen legacy buckets underneath for days before interval tracking began.
//
// The boundary is data presence, not a stored marker: earliestDayKey() is the
// first day with interval data; days strictly before it read buckets (via the
// background message API behind fetchTrackingData), that day and after read
// intervals (intervalFetch). 'YYYY-MM-DD' / 'YYYY-MM-DDTHH' keys compare
// lexicographically = chronologically, so a plain string '<' is the split.
//
// The two reads use different access paths (SW message for buckets, direct
// function for intervals) only because the tiers live in different stores. This
// merger never queries buckets for today, so the message API's live-snapshot merge
// is moot here and the bucket read could become a direct chrome.storage.local read.
// Deferred follow-up: see bucket-to-interval-tracking-migration.md "Follow-ups".
//
// Failsafes: in mock mode (guided tour) the fixtures are returned alone, no
// interval merge; when the log is empty (boundary null) every read falls through
// to buckets, exactly as before interval tracking existed.

// Per-day dict shapes ({ dayKey: ... }): legacy bucket days, then every interval
// day on top (interval keys are all >= boundary by construction).
async function mergeByDay(msg, boundary) {
  const [iv, bk] = await Promise.all([intervalFetch(msg), fetchTrackingData(msg)]);
  const out = {};
  for (const dayKey in bk) if (dayKey < boundary) out[dayKey] = bk[dayKey];
  return Object.assign(out, iv);
}

// Per-hour dict shapes ({ hourKey: ... }): same split, keyed on the hour's day.
async function mergeByHour(msg, boundary) {
  const [iv, bk] = await Promise.all([intervalFetch(msg), fetchTrackingData(msg)]);
  const out = {};
  for (const hourKey in bk) if (hourKey.slice(0, 10) < boundary) out[hourKey] = bk[hourKey];
  return Object.assign(out, iv);
}

// The day-set the avg-per-clock-hour chart averages over (always excludes today),
// split at the boundary. An explicit dayKeys (drill mode) is used as-is; otherwise
// a numeric range = the n days before today and 'all' = the union of both tiers'
// day keys.
async function partitionAvgDays(msg, boundary) {
  const today = localDayKey(Date.now());
  let days;
  if (Array.isArray(msg.dayKeys)) {
    days = msg.dayKeys;
  } else {
    const n = parseInt(msg.range);
    days = [];
    if (msg.range === 'all') {
      const [iByDay, bByDay] = await Promise.all([
        intervalFetch({ type: MSG_GET_SITES_BY_DAY }),
        fetchTrackingData({ type: MSG_GET_SITES_BY_DAY }),
      ]);
      days = [...new Set([...Object.keys(iByDay), ...Object.keys(bByDay)])];
    } else if (Number.isFinite(n)) {
      for (let i = 1; i <= n; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(localDayKey(d.getTime()));
      }
    }
  }
  const intervalDays = [], bucketDays = [];
  for (const d of days) {
    if (d === today) continue;
    (d >= boundary ? intervalDays : bucketDays).push(d);
  }
  return { intervalDays, bucketDays };
}

// Avg-per-clock-hour returns a 24-array already averaged over its day-set, so it
// can't be key-merged. The stitch owns the day-set, asks each tier for its own
// day subset, then recombines weighted by day count: (arrI*Di + arrB*Db)/(Di+Db).
async function mergeAvg(msg, boundary) {
  const { intervalDays, bucketDays } = await partitionAvgDays(msg, boundary);
  const Di = intervalDays.length, Db = bucketDays.length, D = Di + Db;
  if (D === 0) return new Array(24).fill(0);
  const [arrI, arrB] = await Promise.all([
    Di ? intervalFetch({ ...msg, dayKeys: intervalDays }) : null,
    Db ? fetchTrackingData({ ...msg, dayKeys: bucketDays }) : null,
  ]);
  const out = new Array(24).fill(0);
  for (let h = 0; h < 24; h++) out[h] = ((arrI?.[h] ?? 0) * Di + (arrB?.[h] ?? 0) * Db) / D;
  return out;
}

export async function loadMergedTrackingData(msg) {
  if (await isMockMode()) return fetchTrackingData(msg);
  const boundary = await earliestDayKey();
  if (boundary === null) return fetchTrackingData(msg);
  switch (msg.type) {
    case MSG_GET_SITES_BY_DAY:
    case MSG_GET_SUBPAGES_BY_DAY:
      return mergeByDay(msg, boundary);
    case MSG_GET_SUBPAGES_BY_HOUR:
      return mergeByHour(msg, boundary);
    case MSG_GET_SITES_BY_HOUR_TODAY:
      return intervalFetch(msg);
    case MSG_GET_SITES_BY_HOUR_FOR_DAY:
      return msg.dayKey >= boundary ? intervalFetch(msg) : fetchTrackingData(msg);
    case MSG_GET_AVG_PER_CLOCK_HOUR:
      return mergeAvg(msg, boundary);
    default:
      return fetchTrackingData(msg);
  }
}
