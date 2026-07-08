# Targeted deletion

This app's pruning today is global — it removes records by insignificance across
all sites at once. This feature adds a date-range deletion section on the
storage-pruning page that removes every record within an arbitrary datetime window,
optionally scoped to a single site. A navigation button on `site.html` links there
with the site pre-filled.

## User stories

- As a user, I want to delete all data for a specific site so that I can remove
  sensitive browsing history without wiping everything else.
- As a user, I want to delete all records within a date range so that I can shed
  an arbitrary window of history without touching other dates.

## Acceptance criteria

- [ ] `site.html` has a "Delete data…" button in `#header-right` that navigates
      to `storage-pruning.html?site=<siteId>`, hidden on the merged site view.
- [ ] The storage-pruning page has a "Delete by date range" section below the
      existing threshold-scan section.
- [ ] The section has an optional site filter input pre-filled from the `?site`
      URL parameter; the user can clear or change it.
- [ ] When arriving via `?site`, the page scrolls the range-delete section into view.
- [ ] The range-delete form has a "Repeat daily" toggle. When off (default): a
      single contiguous datetime range — "From" and "To" controls, each with a date
      input and an hour selector (0–23). When on: separate date-range inputs
      (From date / To date) and separate hour-window inputs (From hour / To hour),
      with the hour window applied independently to each day in the date range.
- [ ] The delete button is disabled until both date fields are filled and the from
      datetime is not later than the to datetime. In repeat mode an additional
      check applies: from-hour must be ≤ to-hour (a backwards hour window would
      match nothing regardless of the date span).
- [ ] Clicking the delete button shows a confirmation dialog (using the existing
      `confirmDialog`) naming the scope (date range and/or site) before proceeding.
- [ ] Confirming range deletion:
      - deletes hourly buckets whose `YYYY-MM-DDTHH` key falls within
        `[fromHourKey, toHourKey]`, filtered to the specified `siteId` if one is set
      - reduces (not deletes) the corresponding daily buckets by the exact
        `activeMs`/`audioMs`/`overlapMs`/`idleMs` amounts removed from the
        hourly store (`visits` is left unchanged in the daily store);
        a daily entry is only removed if it reaches zero
      - for each day where all 24 hours (T00–T23) fall within the range, the
        daily entry is deleted outright rather than reduced (the whole day bucket
        if no site filter is set; only the siteId entry within it if one is set);
        partial days at the start or end of a multi-day range still use the
        reduce path
- [ ] When a site filter is active, a "Delete all data for [site]" button is shown
      independently of the date range controls. It shows its own confirmation dialog
      and deletes all entries for that siteId across all time from all four stores.
- [ ] After any deletion, `invalidateSitesCache` is called and the storage bar
      refreshes.
- [ ] After any deletion, a `showNotification` message shows the size of data freed
      (formatted bytes, computed via `getBytesInUse` before and after, same as the
      existing prune flow).

## Scope

### Surfaces involved

| Surface | Role |
|---|---|
| `site.html` | Navigation button in `#header-right` linking to storage-pruning with `?site=` |
| `site.js` | Wire the button via `navButton` |
| `storage-pruning.html` | New `<section id="range-delete">` after `#results-section` |
| `storage-pruning.js` | Read `?site` param; wire site filter, range inputs, and delete button |
| `prune.js` | Unchanged |
| `targetedDelete.js` (new) | Six exports: four range helpers + `deleteSiteAllTime`, `deleteSubpageSiteAllTime` |

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

## Edge cases

- **Merged site view** (`?ids=…`): the navigation button is hidden, same as
  "Limit this site" today.
- **Range with no matching data**: delete runs against empty buckets;
  `showNotification` fires with "0 bytes freed."
- **From datetime > To datetime**: delete button stays disabled.
- **Partial-day hour range on daily stores**: if the user deletes e.g.
  `2026-05-01 T09` to `2026-05-01 T17`, the `2026-05-01` daily bucket is
  *reduced* by the sum of the removed hourly values, not deleted. The daily
  aggregate stays accurate for the hours outside the range.
- **Repeat mode, single day (fromDate === toDate)**: equivalent to a normal
  partial-day range deletion on that one day.
- **Repeat mode, hour window 00–23**: equivalent to full-day deletion for each
  day in the range; the full-day shortcut (delete outright) still applies.
- **"Delete all data for site" with no site filter active**: button is not shown;
  a siteId is required for this action.
- **Store inconsistency / negative values**: if hourly and daily stores are
  slightly out of sync (e.g. hourly data was partially pruned earlier), subtracting
  hourly sums from daily values could underflow. All reduced fields are clamped to
  ≥ 0 before writing back.
- **Site currently being tracked**: deletion removes persisted records only;
  the in-memory snapshot is unaffected. The next flush writes fresh data from
  that point forward.

## Out of scope (v1)

- Undo / restore after deletion.
- Preview of affected records before confirming range deletion.

## Housekeeping

Before or after implementing, rename `src/data/prune.js` →
`src/data/insignificantPrune.js` for clarity now that `targetedDelete.js` sits
alongside it. The storage-pruning page keeps its name — it is the single home for
all storage management tools and will grow further.
