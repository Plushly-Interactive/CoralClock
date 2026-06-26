import {
  getSitesByDay, getSitesByHour, getSubpagesByDay, getSubpagesByHour, getAvgPerClockHour,
} from './intervalAggregates.js';
import { localDayKey } from '../shared/timeUtils.js';
import {
  MSG_GET_SITES_BY_DAY, MSG_GET_SITES_BY_HOUR_TODAY, MSG_GET_SITES_BY_HOUR_FOR_DAY,
  MSG_GET_SUBPAGES_BY_DAY, MSG_GET_SUBPAGES_BY_HOUR, MSG_GET_AVG_PER_CLOCK_HOUR,
} from '../shared/msgTypes.js';

// Drop-in for fetchTrackingData on site/path pages opened with ?source=interval:
// same message shapes, but served from the interval log (intervalAggregates)
// instead of the scalar background message API. Phase B promotes this to the sole
// provider (wrapped in the bucket stitch); only the ?source ternary is dropped.
function hoursForDay(byHour, dayKey) {
  const out = {};
  for (const [hourKey, cells] of Object.entries(byHour)) {
    if (hourKey.slice(0, 10) === dayKey) out[hourKey] = cells;
  }
  return out;
}

export async function intervalFetch(msg) {
  switch (msg.type) {
    case MSG_GET_SITES_BY_DAY: return getSitesByDay();
    case MSG_GET_SUBPAGES_BY_DAY: return getSubpagesByDay();
    case MSG_GET_SUBPAGES_BY_HOUR: return getSubpagesByHour();
    case MSG_GET_SITES_BY_HOUR_TODAY: return hoursForDay(await getSitesByHour(), localDayKey(Date.now()));
    case MSG_GET_SITES_BY_HOUR_FOR_DAY: return hoursForDay(await getSitesByHour(), msg.dayKey);
    case MSG_GET_AVG_PER_CLOCK_HOUR: return getAvgPerClockHour(msg.siteIds, msg.range, msg.dayKeys);
    default: return undefined;
  }
}
