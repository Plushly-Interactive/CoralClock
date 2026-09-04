# Prune insignificant records — implementation detail

TL;DR: the per-file changes and storage shapes cut from `docs/features/storage-management/prune-insignificant-records.md`. Reference only.

### Files likely to change


| File                                             | Change                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/storage-pruning/storage-pruning.html` | New: page markup (header with storage bar, intro, controls, results section)                                                                  |
| `src/pages/storage-pruning/storage-pruning.css`  | New: page-specific styles                                                                                                                     |
| `src/pages/storage-pruning/storage-pruning.js`   | New: scan / sort / select / delete UI logic; direct `chrome.storage.local` reads/writes                                                       |
| `src/data/prune.js`                              | New: pure aggregation functions (`scanSiteBucket`, `scanSubpageBucket`) and deletion appliers (`applySiteDeletions`, `applySubpageDeletions`) |
| `src/pages/dashboard/dashboard.html`             | Add `#prune-btn` button linking to the storage-pruning page                                                                                   |
| `src/pages/dashboard/dashboard.js`               | Wire `#prune-btn` to navigate to the storage-pruning page                                                                                     |
| `src/shared/theme.css`                           | Hoist `.data-table` / `.data-table--scroll` / `.page-title` / `#back-btn` (used by this page and shared with dashboard)                       |
| `src/shared/utils.js`                            | Extract `showNotification` (shared with `importData.js`)                                                                                      |


### Storage / tracking


| Key               | Shape                                    | Read by              | Written by           | Notes                                                                                 |
| ----------------- | ---------------------------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `sitesByDay`  | existing                                 | storage-pruning page | storage-pruning page | filtered per identity (`siteId`)                                                      |
| `sitesByHour` | existing                                 | storage-pruning page | storage-pruning page | filtered per identity (`siteId`)                                                      |
| `subpagesByDay`   | existing                                 | storage-pruning page | storage-pruning page | filtered per identity (`siteId + path`)                                               |
| `subpagesByHour`  | existing                                 | storage-pruning page | storage-pruning page | filtered per identity (`siteId + path`)                                               |
| `settings`        | `{ pruneThresholdSeconds: number, ... }` | storage-pruning page | storage-pruning page | new key, bag of user preferences (extensible). `pruneThresholdSeconds` defaults to 30 |


An **identity** is `siteId` for domain stores and `siteId + path` for subpage stores. An identity is **insignificant** in a given store when, summed across every record stored for it in that store, both `totalActiveMs < threshold` AND `totalAudioMs < threshold`. Insignificance is evaluated per store independently — pruning the hourly entries does not touch the daily ones.

After any prune, the page sends `{ type: 'invalidateSitesCache' }` to background so tracking data caches (`cachedByDay` / `cachedByHour` / `cachedSubpagesByDay` / `cachedSubpagesByHour`) are dropped.
