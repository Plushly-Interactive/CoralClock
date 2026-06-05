# Prune insignificant records

A manual pruning tool that lets the user find and delete tracked identities (domains and subpages) whose total time across all records falls below a configurable threshold. Targets the noise that accumulates from brief visits and accidental clicks (e.g. a page opened for 3 seconds), without touching genuine history.

## User stories

- As a user, I want to set a "what's insignificant" threshold so that I control what gets removed.
- As a user, I want to choose which stores to scan (domain vs. subpage, daily vs. hourly) so that I can prune at the granularity I care about.
- As a user, I want insignificance evaluated across an identity's full history so that a site briefly visited many times (totalling real time) is kept.
- As a user, I want to see every identity that will be deleted before I confirm so that nothing meaningful is removed by accident.
- As a user, I want to deselect individual identities or whole groups from the deletion list so that I can keep ones I recognize.
- As a user, I want to see the total count and disk-size impact so that I know how much I'm freeing.
- As a user, I want to see the storage quota usage at all times so that I can judge urgency.
- As a user, I want my chosen threshold to be remembered between visits so that I don't have to reset it each time.

## Acceptance criteria

- A new "Storage management" page is reachable from the dashboard via a "Manage storage" header button (renamed from "Storage pruning").
- ~~The page header shows a live storage bar.~~ **Decided:** the header bar was removed in favour of the quota stat box on the new storage management page, which covers the same information without occupying the header.
- The page has a threshold input (seconds), defaulting to 30 on first use and otherwise restored from `settings.pruneThresholdSeconds`.
- The page has two checkboxes: `Sites` and `Subpages`, both checked by default. **Decided:** the original four (daily/hourly per type) were collapsed into two because deleting insignificant records only for the daily or only for the hourly bucket of a site/path has no practical value — both buckets are evaluated together per identity.
- A `Scan` button finds, across both daily and hourly records for each selected type, every identity (a `siteId` for sites, a `siteId + path` for subpages) whose **summed** `activeMs` AND **summed** `audioMs` across all of its records are both below the threshold, and displays them in a list.
- Results are grouped by store using collapsible `<details>` panels, each showing the store name and result count.
- Each result row shows: site (and path for subpages, with truncation + hover tooltip), last visit (day + hour range), total active time, total audio time, record count, and a selection checkbox.
- Each column header is clickable to sort the group by that column, toggling ascending/descending. Sorting one group does not scroll the page or reset other groups.
- Each group has a "Selected" header checkbox that selects/deselects every row in the group and shows an indeterminate state when only some rows are selected.
- A running summary shows count of selected identities, total record count behind them, and an estimated bytes-saved figure (computed by simulating the deletion against a clone of the scanned stores).
- A `Delete selected` button at the bottom of the results applies the deletions, sends `invalidateSitesCache` to the background so other UI views reflect the change, shows a transient notification with the **actual** freed bytes (from `chrome.storage.local.getBytesInUse` before/after), then re-runs the scan and refreshes the list.
- If no records match the threshold, the results list area shows an empty-state message and the delete button is hidden.
- Changing the threshold input persists the new value to `settings.pruneThresholdSeconds` on each input event.

## Scope

### Surfaces involved


| Surface                    | Role in this feature                                                               |
| -------------------------- | ---------------------------------------------------------------------------------- |
| New `storage-pruning` page | Threshold input, scope checkboxes, results list, delete action, storage bar        |
| dashboard                  | Header button linking to the new page                                              |
| background                 | Receives `invalidateSitesCache` after each successful prune (existing handler) |


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

## Edge cases

- An identity has records in multiple stores (e.g. daily and hourly): each store is evaluated independently, so the identity can be flagged in one store and kept in another.
- Threshold input is empty or non-numeric: scan button stays disabled.
- All scope checkboxes unchecked: scan button stays disabled.
- Empty stores: page loads, scan returns zero results, empty state shown.
- Deletion leaves an empty inner object (a dayKey/hourKey whose every entry was pruned, or a `siteId` whose every path was pruned): the outer key is also removed to keep storage clean.
- First-time visit (no `settings` key yet): page initialises with default `pruneThresholdSeconds: 30`.
- Sort/select interactions within one group do not scroll the page or reset other groups (groups re-render in place).

