import { allIntervals, SESSION_GAP_MS } from './intervalLog.js';
import { localDayKey, localHourKey } from '../shared/timeUtils.js';

// Reconstructs the site dashboard's data shapes from the domain+path interval
// log — everything is DERIVED from the ranges, nothing is pre-stored.
//
//  - active/audio time per domain per hour = UNION of that domain's path ranges
//    (parallel same-site windows counted once), capped at one hour, summed into
//    the day. Matches the scalar site tracker.
//  - visits per domain = number of NON-CONTIGUOUS active intervals for the
//    domain (all its paths merged; abutting path ranges are one continuous
//    domain interval, a real gap splits it). Each interval is credited to its
//    start day. Within-site navigation doesn't bump it; leaving and returning
//    does — matching the scalar site-visit count for foreground browsing.
//  - wall-clock per hour = union of every site's active+audio (the aggregate the
//    "avg per clock hour" chart uses).

const HOUR_CAP = 3600000;

let cachePromise = null;

function* hourBounds(from, to) {
  let t = from;
  while (t < to) {
    const nextHour = new Date(t);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    const end = Math.min(nextHour.getTime(), to);
    yield { hourKey: localHourKey(t), from: t, to: end };
    t = end;
  }
}

function unionLen(ranges) {
  if (ranges.length === 0) return 0;
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0, [cs, ce] = ranges[0];
  for (let i = 1; i < ranges.length; i++) {
    const [s, e] = ranges[i];
    if (s > ce) { total += ce - cs; cs = s; ce = e; }
    else if (e > ce) ce = e;
  }
  return total + (ce - cs);
}

async function build() {
  const intervals = await allIntervals();

  const hours = {};              // hourKey -> { domains: {domain:{active:[],audio:[]}}, wall:[] }
  const presenceByDomain = {};   // domain -> [{from,to,active}] (for visit counting)
  for (const r of intervals) {
    if (r.kind === 'active' || r.kind === 'audio') {
      for (const seg of hourBounds(r.from, r.to)) {
        const h = (hours[seg.hourKey] ??= { domains: {}, wall: [] });
        const dd = (h.domains[r.domain] ??= { active: [], audio: [] });
        dd[r.kind].push([seg.from, seg.to]);
        h.wall.push([seg.from, seg.to]);
      }
    }
    // Presence for visit counting: active/audio/idle all keep a run open (audio or
    // an AFK stretch during an active gap doesn't split it); but a run only counts
    // as a visit if it actually contains `active` (so background-audio-only is 0).
    if (r.kind === 'active' || r.kind === 'audio' || r.kind === 'idle') {
      (presenceByDomain[r.domain] ??= []).push({ from: r.from, to: r.to, active: r.kind === 'active' });
    }
  }

  const sitesByDay = {};
  const wallByHour = {};
  const hourKeys = Object.keys(hours);
  for (const hourKey of hourKeys) {
    const h = hours[hourKey];
    const dayKey = hourKey.slice(0, 10);
    wallByHour[hourKey] = Math.min(unionLen(h.wall), HOUR_CAP);
    for (const [domain, dd] of Object.entries(h.domains)) {
      const d = ((sitesByDay[dayKey] ??= {})[domain] ??= { activeMs: 0, audioMs: 0, visits: 0 });
      d.activeMs += Math.min(unionLen(dd.active), HOUR_CAP);
      d.audioMs += Math.min(unionLen(dd.audio), HOUR_CAP);
    }
  }

  // Domain visits: merge a domain's presence (active+audio+idle) into disjoint
  // runs — audio/idle during an active gap keep the run open. A run is a visit
  // only if it contains active presence (background-audio-only → not a visit).
  // SESSION_GAP_MS (same threshold as the live-row coalesce) bridges sub-second
  // seams, so a row boundary and a visit boundary agree.
  for (const [domain, items] of Object.entries(presenceByDomain)) {
    items.sort((a, b) => a.from - b.from);
    let cs = items[0].from, ce = items[0].to, hasActive = items[0].active;
    const credit = (start) => {
      const dayKey = localDayKey(start);
      ((sitesByDay[dayKey] ??= {})[domain] ??= { activeMs: 0, audioMs: 0, visits: 0 }).visits += 1;
    };
    for (let i = 1; i < items.length; i++) {
      const it = items[i];
      if (it.from <= ce + SESSION_GAP_MS) {        // same run — active/audio/idle bridges
        if (it.to > ce) ce = it.to;
        if (it.active) hasActive = true;
      } else {
        if (hasActive) credit(cs);                  // count only runs that had active
        cs = it.from; ce = it.to; hasActive = it.active;
      }
    }
    if (hasActive) credit(cs);
  }

  return { sitesByDay, wallByHour, hourKeys };
}

function load() {
  cachePromise ??= build();
  return cachePromise;
}

export function invalidate() {
  cachePromise = null;
}

export async function getSitesByDay() {
  return (await load()).sitesByDay;
}

// 24-length array: average per clock hour over the range's days, excluding today
// — mirrors background.js's aggregate getAvgPerClockHour (same day set + divisor).
export async function getAvgPerClockHour(range) {
  const { wallByHour, hourKeys } = await load();
  const now = new Date();
  const today = localDayKey(now.getTime());

  let dayKeys;
  if (range === 'all') {
    if (hourKeys.length === 0) return new Array(24).fill(0);
    const dates = hourKeys.map(k => k.slice(0, 10)).sort();
    const [y, m, d] = dates[0].split('-').map(Number);
    dayKeys = [];
    for (let date = new Date(y, m - 1, d); ; date.setDate(date.getDate() + 1)) {
      const k = localDayKey(date.getTime());
      if (k === today) break;
      dayKeys.push(k);
    }
  } else {
    const n = parseInt(range);
    dayKeys = [];
    if (Number.isFinite(n)) {
      for (let i = 1; i <= n; i++) {
        const day = new Date(now);
        day.setDate(day.getDate() - i);
        dayKeys.push(localDayKey(day.getTime()));
      }
    }
  }

  const D = dayKeys.length;
  if (D === 0) return new Array(24).fill(0);
  const sums = new Array(24).fill(0);
  for (const dayKey of dayKeys) {
    for (let h = 0; h < 24; h++) {
      sums[h] += wallByHour[`${dayKey}T${String(h).padStart(2, '0')}`] ?? 0;
    }
  }
  return sums.map(s => s / D);
}
