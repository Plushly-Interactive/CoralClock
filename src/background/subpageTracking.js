import { siteIdFromUrl, pathFromUrl } from './siteResolution.js';
import { createTrackingModule } from './trackingUtils.js';

const KEY_SEP = '\n';

function makeKey(siteId, path) {
  return `${siteId}${KEY_SEP}${path}`;
}

function urlToKey(url) {
  const siteId = siteIdFromUrl(url);
  const path = pathFromUrl(url);
  return siteId && path ? makeKey(siteId, path) : null;
}

const mod = createTrackingModule({
  urlToKey,
  dayStorageKey: 'subpagesByDay',
  hourStorageKey: 'subpagesByHour',
  snapshotStorageKey: '_subpageSnapshot',
  getCell(bucket, key) {
    const [siteId, path] = key.split(KEY_SEP);
    bucket[siteId] ??= {};
    bucket[siteId][path] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, visits: 0 };
    return bucket[siteId][path];
  },
});

export function setWindowPath(windowId, siteId, path) {
  mod.setWindow(windowId, siteId && path ? makeKey(siteId, path) : null);
}
export function removeWindowPath(windowId) {
  mod.removeWindow(windowId);
}
export function addAudibleTabPath(tabId, siteId, path, countVisit = true) {
  if (!siteId || !path) return;
  mod.addAudibleTab(tabId, makeKey(siteId, path), countVisit);
}
export function removeAudibleTabPath(tabId) {
  mod.removeAudibleTab(tabId);
}
export const initSubpageTracking = mod.init;
export const reconcileSubpagePaths = mod.reconcile;
export const saveSubpageSnapshot = mod.saveSnapshot;
export const recoverSubpagesFromSnapshot = mod.recoverFromSnapshot;
export const flushSubpagesToStorage = mod.flushToStorage;
