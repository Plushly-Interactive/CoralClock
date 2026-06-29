import { localDayKey, formatMs } from '../shared/timeUtils.js';
import { siteIdFromUrl } from './siteResolution.js';
import { usageSince } from '../data/intervalAggregates.js';
import { PREF_BADGE_ENABLED } from '../shared/prefKeys.js';

export const DEFAULT_BADGE_ENABLED = true;

export async function updateBadge() {
  const { [PREF_BADGE_ENABLED]: enabled = DEFAULT_BADGE_ENABLED } = await chrome.storage.local.get(PREF_BADGE_ENABLED);
  if (!enabled) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  let win;
  try {
    win = await chrome.windows.getLastFocused({ populate: true });
  } catch {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const tab = win?.tabs?.find(t => t.active);
  const siteId = siteIdFromUrl(tab?.url);
  if (!siteId) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const { sitesByDay } = await usageSince(startOfDay.getTime());
  const cell = sitesByDay[localDayKey(Date.now())]?.[siteId];
  const ms = cell ? (cell.activeMs ?? 0) + (cell.audioMs ?? 0) - (cell.overlapMs ?? 0) : 0;
  chrome.action.setBadgeText({ text: ms > 0 ? formatMs(ms) : '' });
}
