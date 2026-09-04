# Subdomain tracking — implementation detail

TL;DR: the per-file changes and storage shapes cut from `docs/features/subdomain-tracking.md`. Reference only.

### Files likely to change


| File                                                | Change                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/background/siteResolution.js`                  | `siteIdFromUrl` returns hostname with `www.` stripped; new helper `eTLDPlus1(hostname)`; new helper `formatHostnameLabel(hostname)` for inverted title-case (or place in `src/shared/`) |
| `src/data/migrations.js`                            | New migration: rewrite keys in `sitesByDay`, `sitesByHour`, `subpagesByDay`, `subpagesByHour` from eTLD+1 to hostname form; collision-sum where needed                          |
| `src/pages/dashboard/dashboard.js`                  | Group-by-eTLD+1 toggle; default ungrouped; apply label formatter                                                                                                                        |
| `src/pages/dashboard/dashboard.html`                | Toggle control markup                                                                                                                                                                   |
| `src/pages/dashboard/dashboard.css`                 | Toggle styles (reuse shared classes where possible)                                                                                                                                     |
| `src/pages/site/site.js`                            | Roll up all hostnames matching `?siteId` (eTLD+1); add subdomain breakdown                                                                                                              |
| `src/pages/site/site.html`                          | Subdomain breakdown markup                                                                                                                                                              |
| `src/pages/path/path.js`                            | No logic change expected; keys are now hostname-based but the page already reads its `siteId` from query string                                                                         |
| `src/shared/utils.js` or new `src/shared/labels.js` | `formatHostnameLabel(hostname)` if shared across pages                                                                                                                                  |
| `src/data/importData.js`                            | Import path normalizes incoming hostnames the same way (strip `www.`); collision-sum on import                                                                                          |
| `src/pages/storage-pruning/storage-pruning.js`      | No logic change; identities are now hostnames but the page's notion of "identity" is whatever key is in storage                                                                         |


### Storage / tracking


| Key               | Shape                                                                             | Read by                                                    | Written by                         | Notes                                                     |
| ----------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `sitesByDay`  | `{ dayKey → { hostname → { activeMs, audioMs } } }`                               | background, dashboard, site, importData, migrations, prune | background, importData, migrations | **Key change**: hostname (www stripped) instead of eTLD+1 |
| `sitesByHour` | `{ hourKey → { hostname → { activeMs, audioMs } } }`                              | background, dashboard, site, importData, migrations, prune | background, importData, migrations | Same key change                                           |
| `subpagesByDay`   | `{ dayKey → { hostname → { path → { activeMs, audioMs, overlapMs, visits } } } }` | background, path, importData, prune                        | background, importData             | Outer site key changes from eTLD+1 to hostname            |
| `subpagesByHour`  | `{ hourKey → { hostname → { path → … } } }`                                       | background, path, importData                               | background, importData             | Same                                                      |
| `storageVersion`  | `{ version: number }`                                                             | migrations                                                 | migrations                         | Bumped by this migration                                  |


No new storage keys. All four tracking data keys change semantics on their outer site dimension.
