# Storage page — ideas

The storage-pruning page is outgrowing its name. Beyond pruning, targeted
deletion, and import/export, it should answer *what is eating my storage and how
fast is it growing*. These are the confirmed additions to build toward that.

Data available to compute all of these (no new tracking):
- Four stores: `sitesByDay`, `sitesByHour`, `subpagesByDay`, `subpagesByHour`.
- Each record: `activeMs`, `audioMs`, `overlapMs`, `idleMs`, `visits`.
- Date keys: `YYYY-MM-DD` (daily) or `YYYY-MM-DDTHH` (hourly).
- `chrome.storage.local.getBytesInUse([key])` for per-key byte sizes.

## Confirmed items

### 1. Counts at a glance
Top-line summary: total domains, total subpages, total records, and the data
span (oldest → newest date key). One compact row of numbers.

### 2. Per-store breakdown
Bytes per store (via `getBytesInUse` per key) as a stacked bar or donut. The
hourly and subpage stores usually dominate; this shows where to aim pruning.

### 3. Quota gauge + projection
Used vs `chrome.storage.local` quota, plus "at the current rate you'll reach the
cap in ~N days." Caveat: if the manifest has the `unlimitedStorage` permission
there is no hard cap — check before promising a quota number; fall back to a
plain growth rate if uncapped.

### 4. Hourly-redundancy hint (with fragmentation as a supporting metric)
Surface what % of storage the hourly stores cost vs daily, with a "drop hourly
older than N days" action (daily aggregates stay intact).

**Fragmentation** is the *diagnostic* for this panel, not a separate feature.
- It is **not** the same as insignificant pruning. Insignificant pruning keys
  off total magnitude (active + audio both below threshold) and deliberately
  keeps a site briefly opened many times that totals real time.
- Fragmentation keys off *spread*: an identity smeared across many tiny hourly
  buckets but holding real total time — exactly the case insignificant pruning
  protects. The time is real, so it can't be deleted; the remedy is collapsing
  hourly buckets into the daily aggregate, i.e. the hourly-drop action itself.
- Show it as: "X domains fragmented across Y hourly buckets → reclaim ~Z bytes
  by collapsing," making the hourly-drop concrete instead of abstract.

### 5. Consistency check
Verify hourly sums match their daily aggregates per site; flag orphaned records,
future-dated keys, and `NaN`/negative values. A "health" panel with a one-click
reconcile/repair. Matters specifically because targeted deletion reduces daily
buckets by hourly sums — drift will accumulate as deletion features grow.

### 6. Export-freshness nudge
"Last export was N days ago," shown near the export control. Cheap, and it pushes
users to back up before running a big prune or delete.

## Other ideas raised (parked, not in scope yet)
- Calendar heatmap (records/bytes per day) — strongest standalone visual.
- Treemap of storage (domains sized by bytes).
- Record-age histogram with a draggable retention cutoff.
- Stacked-area growth chart split by store.
- Hour-of-day density bar (leans toward usage insight, may overlap dashboard).
- Storage activity log / audit trail of prune/delete/import actions.
- Coverage stat (% of days in span with data, longest gap).
- Auto-prune / retention policy (alarm-driven).
