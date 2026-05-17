# Prune insignificant records

A manual pruning tool that lets the user find and delete tracked records whose time falls below a configurable threshold. Targets the noise that accumulates in `subpagesByHour` and similar stores (e.g. a YouTube video opened for 3 seconds), without touching genuine history.

## User stories

- As a user, I want to set a "what's insignificant" threshold so that I control what gets removed.
- As a user, I want to choose which stores to scan (domain vs. subpage, daily vs. hourly) so that I can prune at the granularity I care about.
- As a user, I want to see every record that will be deleted before I confirm so that nothing meaningful is removed by accident.
- As a user, I want to deselect individual records from the deletion list so that I can keep ones I recognize.
- As a user, I want to see the total count and disk-size impact so that I know how much I'm freeing.
- As a user, I want my chosen threshold to be remembered between visits so that I don't have to reset it each time.

## Acceptance criteria

- A new "Storage pruning" page is reachable from the dashboard.
- The page has a threshold input (seconds), defaulting to 30 on first use and otherwise restored from the saved value.
- The page has four checkboxes: `Domains - daily`, `Domains - hourly`, `Subpages - daily`, `Subpages - hourly`, all checked by default.
- A `Scan` button finds all records below threshold across the selected stores and displays them in a list.
- Each result row shows: store name, date key, site (and path for subpages), `activeMs`, `audioMs`, and a checkbox (checked by default).
- A running summary shows count and approximate size (bytes) of currently-selected records.
- A `Delete selected` button removes only the checked records, then re-runs the scan and refreshes the list.
- After deletion, the background cache is invalidated so other UI views reflect the change.
- If no records match the threshold, the list area shows an empty-state message.
- Changing the threshold input persists the new value to `settings.pruneThresholdSeconds`.

## Scope

### Surfaces involved


| Surface                    | Role in this feature                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| New `storage-pruning` page | Threshold input, scope checkboxes, results list, delete action         |
| dashboard                  | Link to the new page                                                   |
| background                 | New message handlers: scan (read) and prune (write + invalidate cache) |


### Files likely to change


| File                                             | Change                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/pages/storage-pruning/storage-pruning.html` | New: page markup (threshold input, checkboxes, results table, action buttons)            |
| `src/pages/storage-pruning/storage-pruning.css`  | New: page-specific styles                                                                |
| `src/pages/storage-pruning/storage-pruning.js`   | New: scan / select / delete UI logic                                                     |
| `src/background/background.js`                   | Add `scanInsignificantRecords` and `pruneInsignificantRecords` message handlers          |
| `src/data/prune.js`                              | New: pure functions that walk a bucket store and return / remove records below threshold |
| `src/pages/dashboard/dashboard.html`             | Add link to storage-pruning page                                                         |


### Storage / tracking


| Key               | Shape                                    | Read by              | Written by           | Notes                                                                                 |
| ----------------- | ---------------------------------------- | -------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| `analyticsByDay`  | existing                                 | scan handler         | prune handler        | filtered per dayKey                                                                   |
| `analyticsByHour` | existing                                 | scan handler         | prune handler        | filtered per hourKey                                                                  |
| `subpagesByDay`   | existing                                 | scan handler         | prune handler        | filtered per dayKey/siteId                                                            |
| `subpagesByHour`  | existing                                 | scan handler         | prune handler        | filtered per hourKey/siteId                                                           |
| `settings`        | `{ pruneThresholdSeconds: number, ... }` | storage-pruning page | storage-pruning page | new key, bag of user preferences (extensible). `pruneThresholdSeconds` defaults to 30 |


A record is **insignificant** when `activeMs < threshold AND audioMs < threshold`. Both conditions must hold.

After any prune, background invalidates the analytics read cache via the same path used by `invalidateAnalyticsCache`.

## Edge cases

- A site/path is in multiple buckets (e.g. daily and hourly): each bucket is evaluated independently. Pruning the hourly record does not affect the daily one.
- Threshold input is empty or non-numeric: scan button stays disabled.
- All scope checkboxes unchecked: scan button stays disabled.
- Empty stores: page loads, scan returns zero results, empty state shown.
- Deletion leaves an empty inner object (e.g. a dayKey whose every site was pruned): the outer key is also removed to keep storage clean.
- First-time visit (no `settings` key yet): page initialises with default `pruneThresholdSeconds: 30`.

## Out of scope (v1)

- Date-based retention pruning (delete by age). Tracked separately in `STORAGE_PRUNING_MANUAL.md`.
- Storage-size monitoring / alerts when approaching the 10 MB quota.
- Undo / restore after deletion.
- Bulk select-all / deselect-all in the results list.
- Sync of the threshold setting across devices.
- Migration to seed the `settings` key for existing installs (handled separately per project rules).

