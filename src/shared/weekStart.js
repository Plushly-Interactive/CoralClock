import { PREF_WEEK_START } from './prefKeys.js';
import { localDayKey } from './timeUtils.js';

// JS Date.getDay() convention: 0 = Sunday … 6 = Saturday.
export const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
export const DEFAULT_WEEK_START = 'monday';

const DOW = Object.fromEntries(WEEK_DAYS.map((name, i) => [name, i]));

let cachedDow = DOW[DEFAULT_WEEK_START];

chrome.storage.local.get(PREF_WEEK_START).then(({ [PREF_WEEK_START]: v }) => {
  cachedDow = DOW[v] ?? DOW[DEFAULT_WEEK_START];
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[PREF_WEEK_START]) return;
  cachedDow = DOW[changes[PREF_WEEK_START].newValue] ?? DOW[DEFAULT_WEEK_START];
});

export function weekDow(date) {
  return (date.getDay() - cachedDow + 7) % 7;
}

const LABELS_SUN_FIRST = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function rotatedDayLabels() {
  return [...LABELS_SUN_FIRST.slice(cachedDow), ...LABELS_SUN_FIRST.slice(0, cachedDow)];
}

// Week key format: 'YYYY-MM-DDw' — the date of the week-start day with a trailing 'w'.
// Length 11, distinct from day keys (10) and month keys (7).

export function weekKeyForDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() - cachedDow + 7) % 7;
  d.setDate(d.getDate() - dow);
  return localDayKey(d.getTime()) + 'w';
}

export function daysInWeek(weekKey) {
  const [y, m, d] = weekKey.slice(0, 10).split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => localDayKey(new Date(y, m - 1, d + i).getTime()));
}

export function navigateWeek(weekKey, dir) {
  const [y, m, d] = weekKey.slice(0, 10).split('-').map(Number);
  return localDayKey(new Date(y, m - 1, d + dir * 7).getTime()) + 'w';
}
