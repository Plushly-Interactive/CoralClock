# Targeted deletion — implementation detail

TL;DR: the per-file changes, storage matrix and the `src/data/targetedDelete.js` helper API, cut from `docs/features/storage-targeted-deletion.md`. Reference only.

### Files likely to change

| File | Change |
|---|---|
| `src/pages/site/site.html` | Add `#delete-data-btn` to `#header-right` |
| `src/pages/site/site.js` | Wire `#delete-data-btn` via `navButton` to storage-pruning |
| `src/pages/site/site.css` | Style `#delete-data-btn` alongside `#limit-btn` |
| `src/pages/storage-pruning/storage-pruning.html` | Add `#range-delete` section; import `confirmDialog.css` |
| `src/pages/storage-pruning/storage-pruning.js` | Range delete wiring; import from `targetedDelete.js` and `confirmDialog.js` |
| `src/data/targetedDelete.js` (new file) | Six exports: the four range helpers plus `deleteSiteAllTime` and `deleteSubpageSiteAllTime` |

### Storage / tracking

No new keys. The delete path mutates the four existing stores and calls
`MSG_INVALIDATE_SITES_CACHE` after writing.

### New helpers (`src/data/targetedDelete.js`)

The site and subpage stores have different nesting shapes, mirroring the existing
`applySiteDeletions` / `applySubpageDeletions` split in `prune.js`. Two pairs are
needed:

**Site stores** (`sitesByDay` / `sitesByHour`) — flat shape: `dateKey → siteId → record`

`applySiteHourlyRangeDeletion(hourlyStore, fromKey, toKey, siteId?)` — deletes
matching hourly entries and returns a reductions map
`{ [dayKey]: { [siteId]: { activeMs, audioMs, overlapMs, idleMs } } }`.
`fromKey`/`toKey` are `YYYY-MM-DD` or `YYYY-MM-DDTHH`; day-only inputs are padded
to `T00`/`T23`. If `siteId` is provided, only that site's entries are removed.

`applySiteDailyReductions(dailyStore, reductions)` — subtracts `activeMs`,
`audioMs`, `overlapMs`, and `idleMs` from each matching daily entry; values are
clamped to 0. `visits` is not touched. Removes a site entry if all four time
fields reach zero; removes the day bucket if it becomes empty.

**Subpage stores** (`subpagesByDay` / `subpagesByHour`) — nested shape: `dateKey → siteId → path → record`

`applySubpageHourlyRangeDeletion(hourlyStore, fromKey, toKey, siteId?)` — same
range logic as the site variant, but deletes at the `siteId` level within each
hour bucket (removing all paths for that site in that hour). Returns a reductions
map `{ [dayKey]: { [siteId]: { [path]: { activeMs, audioMs, overlapMs, idleMs } } } }`.

`applySubpageDailyReductions(dailyStore, reductions)` — subtracts `activeMs`,
`audioMs`, `overlapMs`, and `idleMs` from each matching `siteId → path` entry;
values are clamped to 0. `visits` is not touched. Removes a path entry if all
four time fields reach zero; removes the siteId and day bucket levels when they
become empty.

**All-time site deletion**

`deleteSiteAllTime(store, siteId)` — iterates every dateKey in a site store,
deletes the siteId entry, prunes empty day buckets. Used by "Delete all data for
site" across `sitesByDay` and `sitesByHour`.

`deleteSubpageSiteAllTime(store, siteId)` — same for subpage stores: deletes
`store[dateKey][siteId]` for every dateKey, prunes empty buckets.
