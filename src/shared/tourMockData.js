import { readTourState } from './tour.js';
import { localDayKey } from './timeUtils.js';
import { scanSiteBucket, scanSubpageBucket } from '../data/prune.js';
import {
  MSG_GET_ANALYTICS_BY_DAY, MSG_GET_ANALYTICS_BY_HOUR_TODAY,
  MSG_GET_ANALYTICS_BY_HOUR_FOR_DAY, MSG_GET_SUBPAGES_BY_DAY,
  MSG_GET_SUBPAGES_BY_HOUR, MSG_GET_AVG_PER_CLOCK_HOUR,
} from './msgTypes.js';

const MIN = 60_000;
const HOUR = 3_600_000;

function buildFixture() {
  const now = new Date();
  const todayKey = localDayKey(now.getTime());
  const dayKeys = [];
  for (let d = 1; d <= 7; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() - d);
    dayKeys.push(localDayKey(day.getTime()));
  }

  const SITES = ['news.example.com', 'vid.example.com', 'social.example.com', 'forgot.example.com'];
  const SUBPAGES = {
    'news.example.com':   ['/world', '/tech', '/sports', '/old-article-7849173'],
    'vid.example.com':    ['/watch/abc', '/watch/xyz'],
    'social.example.com': ['/home', '/profile'],
    'forgot.example.com': ['/landing'],
  };

  function recordFor(siteId, dayIdx) {
    const base = {
      'news.example.com':   { active: 35 * MIN, audio: 0,        visits: 3 },
      'vid.example.com':    { active: 50 * MIN, audio: 40 * MIN, visits: 2 },
      'social.example.com': { active: 22 * MIN, audio: 0,        visits: 5 },
      'forgot.example.com': { active: 2_000,    audio: 0,        visits: 1 },
    }[siteId];
    const wobble = 1 + ((dayIdx * 17) % 7) / 20;
    return {
      activeMs: Math.round(base.active * wobble),
      audioMs: Math.round(base.audio * wobble),
      overlapMs: Math.round(base.audio * wobble * 0.4),
      visits: base.visits,
    };
  }

  function subpageRecord(path, dayIdx) {
    const base = {
      '/world':                { active: 12 * MIN, visits: 1 },
      '/tech':                 { active: 15 * MIN, visits: 1 },
      '/sports':               { active: 8 * MIN,  visits: 1 },
      '/old-article-7849173':  { active: 2_000,    visits: 1 },
      '/watch/abc':            { active: 28 * MIN, visits: 1 },
      '/watch/xyz':            { active: 18 * MIN, visits: 1 },
      '/home':                 { active: 14 * MIN, visits: 3 },
      '/profile':              { active: 6 * MIN,  visits: 1 },
      '/landing':              { active: 2_000,    visits: 1 },
    }[path];
    const wobble = 1 + ((dayIdx * 11) % 5) / 20;
    return {
      activeMs: Math.round(base.active * wobble),
      audioMs: 0,
      overlapMs: 0,
      visits: base.visits,
    };
  }

  const analyticsByDay = {};
  const analyticsByHour = {};
  const subpagesByDay = {};
  const subpagesByHour = {};

  dayKeys.forEach((dayKey, dayIdx) => {
    analyticsByDay[dayKey] = {};
    subpagesByDay[dayKey] = {};

    for (const siteId of SITES) {
      analyticsByDay[dayKey][siteId] = recordFor(siteId, dayIdx);
    }

    for (const siteId of SITES) {
      subpagesByDay[dayKey][siteId] = {};
      for (const path of SUBPAGES[siteId]) {
        subpagesByDay[dayKey][siteId][path] = subpageRecord(path, dayIdx);
      }
    }

    const activeHours = [9, 12, 14, 18, 20];
    for (const h of activeHours) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      analyticsByHour[hourKey] = {};
      subpagesByHour[hourKey] = {};
      for (const siteId of SITES) {
        const dayRec = analyticsByDay[dayKey][siteId];
        const share = 1 / activeHours.length;
        analyticsByHour[hourKey][siteId] = {
          activeMs: Math.round(dayRec.activeMs * share),
          audioMs: Math.round(dayRec.audioMs * share),
          overlapMs: Math.round(dayRec.overlapMs * share),
          visits: Math.max(1, Math.round(dayRec.visits * share)),
        };
        subpagesByHour[hourKey][siteId] = {};
        for (const path of SUBPAGES[siteId]) {
          const dayRec = subpagesByDay[dayKey][siteId][path];
          const share2 = 1 / activeHours.length;
          subpagesByHour[hourKey][siteId][path] = {
            activeMs: Math.round(dayRec.activeMs * share2),
            audioMs: 0,
            overlapMs: 0,
            visits: 1,
          };
        }
      }
    }
  });

  return { analyticsByDay, analyticsByHour, subpagesByDay, subpagesByHour, dayKeys, todayKey };
}

let fixtureCache = null;
function fixture() {
  if (!fixtureCache) fixtureCache = buildFixture();
  return fixtureCache;
}

function avgPerClockHour(siteIds, range, dayKeys = null) {
  const { analyticsByHour } = fixture();
  if (!dayKeys) {
    if (range === 'all') {
      const hourKeys = Object.keys(analyticsByHour);
      const dates = [...new Set(hourKeys.map(k => k.slice(0, 10)))].sort();
      dayKeys = dates;
    } else {
      const days = parseInt(range);
      const now = new Date();
      dayKeys = [];
      for (let d = 1; d <= days; d++) {
        const day = new Date(now);
        day.setDate(day.getDate() - d);
        dayKeys.push(localDayKey(day.getTime()));
      }
    }
  }
  const D = dayKeys.length;
  if (D === 0) return new Array(24).fill(0);
  const sums = new Array(24).fill(0);
  for (const dayKey of dayKeys) {
    for (let h = 0; h < 24; h++) {
      const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
      const bucket = analyticsByHour[hourKey];
      if (!bucket) continue;
      if (siteIds?.length) {
        for (const id of siteIds) sums[h] += bucket[id]?.activeMs ?? 0;
      } else {
        for (const entry of Object.values(bucket)) sums[h] += entry.activeMs ?? 0;
      }
    }
  }
  return sums.map(s => s / D);
}

function hourBucketForDay(dayKey) {
  const { analyticsByHour } = fixture();
  const result = {};
  for (let h = 0; h < 24; h++) {
    const hourKey = `${dayKey}T${String(h).padStart(2, '0')}`;
    if (analyticsByHour[hourKey]) result[hourKey] = analyticsByHour[hourKey];
  }
  return result;
}

function mockAnswer(msg) {
  const f = fixture();
  switch (msg.type) {
    case MSG_GET_ANALYTICS_BY_DAY: return f.analyticsByDay;
    case MSG_GET_ANALYTICS_BY_HOUR_TODAY: return {};
    case MSG_GET_ANALYTICS_BY_HOUR_FOR_DAY: return hourBucketForDay(msg.dayKey);
    case MSG_GET_SUBPAGES_BY_DAY: return f.subpagesByDay;
    case MSG_GET_SUBPAGES_BY_HOUR: return f.subpagesByHour;
    case MSG_GET_AVG_PER_CLOCK_HOUR: return avgPerClockHour(msg.siteIds, msg.range, msg.dayKeys);
    default: return null;
  }
}

let mockModeCache = null;
async function isMockMode() {
  if (mockModeCache !== null) return mockModeCache;
  const state = await readTourState();
  mockModeCache = !!state.useMockData;
  return mockModeCache;
}

export function clearMockModeCache() {
  mockModeCache = null;
  fixtureCache = null;
}

export async function analyticsRequest(msg) {
  if (await isMockMode()) {
    const answer = mockAnswer(msg);
    if (answer !== null) return answer;
  }
  return chrome.runtime.sendMessage(msg);
}

export function mockScanResults(scopes, thresholdMs) {
  const f = fixture();
  const results = [];
  if (scopes.siteDaily) results.push(...scanSiteBucket(f.analyticsByDay, thresholdMs, 'analyticsByDay'));
  if (scopes.siteHourly) results.push(...scanSiteBucket(f.analyticsByHour, thresholdMs, 'analyticsByHour'));
  if (scopes.subpageDaily) results.push(...scanSubpageBucket(f.subpagesByDay, thresholdMs, 'subpagesByDay'));
  if (scopes.subpageHourly) results.push(...scanSubpageBucket(f.subpagesByHour, thresholdMs, 'subpagesByHour'));
  return results;
}
