import { PREF_WEEK_START } from './prefKeys.js';

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
