import { siteIdFromUrl, pathFromUrl } from './siteResolution.js';
import { createTrackingModule } from './intervalTrackingUtils.js';

// Mirror of subpageTracking.js for the interval experiment: keys on
// `${domain}\n${path}` so capture is at domain+path granularity. The engine
// writes one interval row per (domain, path, kind) range. Own snapshot key.
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
  snapshotStorageKey: '_intervalSnapshot',
});

export function setWindowPath(windowId, siteId, path) {
  mod.setWindow(windowId, siteId && path ? makeKey(siteId, path) : null);
}
export function removeWindowPath(windowId, minimized = false) {
  mod.removeWindow(windowId, minimized);
}
export function addAudibleTabPath(tabId, siteId, path, countVisit = true) {
  if (!siteId || !path) return;
  mod.addAudibleTab(tabId, makeKey(siteId, path), countVisit);
}
export function removeAudibleTabPath(tabId) {
  mod.removeAudibleTab(tabId);
}
export const initTracking = mod.init;
export const reconcileWindows = mod.reconcile;
export const saveSnapshot = mod.saveSnapshot;
export const recoverFromSnapshot = mod.recoverFromSnapshot;
export const flushToStorage = mod.flushToStorage;
export const applyIdleClip = mod.applyIdleClip;
