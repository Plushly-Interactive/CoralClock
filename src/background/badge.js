import { localDayKey, formatMs } from '../shared/timeUtils.js';
import { siteIdFromUrl } from './siteResolution.js';
import { SITES_DAY_KEY } from './siteTracking.js';

export async function updateBadge() {
  const win = await chrome.windows.getLastFocused({ populate: true });
  const tab = win?.tabs?.find(t => t.active);
  const siteId = siteIdFromUrl(tab?.url);
  if (!siteId) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }
  const today = localDayKey(Date.now());
  const { [SITES_DAY_KEY]: sitesByDay = {} } = await chrome.storage.local.get(SITES_DAY_KEY);
  const cell = sitesByDay[today]?.[siteId];
  const ms = cell ? (cell.activeMs ?? 0) + (cell.audioMs ?? 0) - (cell.overlapMs ?? 0) : 0;
  chrome.action.setBadgeText({ text: ms > 0 ? formatMs(ms) : '' });
}
