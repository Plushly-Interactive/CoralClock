import { siteIdFromUrl } from './siteResolution.js';
import { createTrackingModule } from './trackingUtils.js';

export const SITES_DAY_KEY = 'sitesByDay';
export const SITES_HOUR_KEY = 'sitesByHour';

const mod = createTrackingModule({
  urlToKey: siteIdFromUrl,
  dayStorageKey: SITES_DAY_KEY,
  hourStorageKey: SITES_HOUR_KEY,
  snapshotStorageKey: '_trackingSnapshot',
  getCell(bucket, key) {
    bucket[key] ??= { activeMs: 0, audioMs: 0, overlapMs: 0, idleMs: 0, visits: 0 };
    return bucket[key];
  },
  recoverLegacy(snap) {
    // historical names: { sites } → { activeSites, audioSites } → { activeKeys, audioKeys }
    return {
      activeKeys: snap.activeKeys ?? snap.activeSites ?? snap.sites ?? [],
      audioKeys: snap.audioKeys ?? snap.audioSites ?? [],
    };
  },
});

export const setWindowSite = mod.setWindow;
export const removeWindowSite = mod.removeWindow;
export const addAudibleTab = mod.addAudibleTab;
export const removeAudibleTab = mod.removeAudibleTab;
export const initTracking = mod.init;
export const reconcileWindows = mod.reconcile;
export const saveSnapshot = mod.saveSnapshot;
export const recoverFromSnapshot = mod.recoverFromSnapshot;
export const flushToStorage = mod.flushToStorage;
export const applyIdleClip = mod.applyIdleClip;
