# Interval storage for precise overlap merging

Store raw browsing **presence intervals** (`{site, kind, from, to}`) in an
append-only IndexedDB log so the extension can answer per-site temporal
overlap questions — "while twitch played in the background, what was I
actively browsing, and for how long" — which the shipped `wallClockByHour`
scalar can't, because it pre-merges every site into one per-hour total and
discards which sites overlapped.

Built as a **self-contained sidecar**: its own capture listeners, its own
IndexedDB database, its own retention pruning, its own UI page. It shares
**nothing** with the existing tracking code and writes **nothing** the existing
code reads. The single integration point is one `import` line in
`background.js` (unavoidable — MV3 allows exactly one service-worker entry).
This is deliberate: it's an experiment, and ditching it later is deleting a few
files and one line (see [How to remove](#how-to-remove)).

This feature is **independent of**
[Migrate tracking aggregates to IndexedDB](storage-management/aggregates-indexeddb.md):
it does not migrate, read, or touch the scalar aggregates
(`sitesByDay`/`sitesByHour`/`wallClockByHour`/subpages); it stands up a separate
database alongside them.

## User stories

- As a user, I want a page that shows which other sites I was browsing *at the
  same time* as a given site, and for how long, so I can tell genuine focused
  use from background noise.
- As a user, I want to distinguish a site that was playing audio in the
  background from one I was actively using, so "time spent" reflects reality.
- As the developer, I want this to be a bolt-on I can remove cleanly if it
  doesn't earn its keep, without having unpicked it from the tracking core.

## Acceptance criteria

- [ ] The overlap page, for a chosen site, lists other sites browsed in
      overlapping wall-clock windows with an overlap duration each.
- [ ] Background-audio overlap (site A `audio` while site B `active`) is
      reported distinctly from foreground-parallel overlap (A `active` while
      B `active`).
- [ ] No existing surface (popup, dashboard, site, path, rules, blocked,
      storage-management) reads from or writes to the interval database; all
      current stats render exactly as before.
- [ ] The existing unified export, retention prune, and "forget this site"
      flows are unchanged and do not act on interval data.
- [ ] The sidecar prunes its own rows older than its retention window on a
      self-scheduled alarm.
- [ ] Periods that predate the log show "overlap data available since `<date>`"
      rather than empty/zero results.
- [ ] Removing the sidecar (delete its files + the one `import` line) leaves
      every other file byte-for-byte unchanged and the extension fully
      functional.

## Scope

### Surfaces involved

| Surface | Role in this feature |
|---|---|
| background | A **separate** tracker module with its own tab/window/audible listeners and state, writing presence intervals + pruning on its own alarm. Reached by one `import` in `background.js`. |
| overlap page | Standalone page that queries the interval DB and renders the per-site "browsed alongside" view. |

### Files

**New (all the feature's logic lives here):**

| File | Role |
|---|---|
| `src/background/intervalTracker.js` | Self-registers its own `chrome.tabs`/`chrome.windows` listeners on import; maintains its own active-site-per-window + audible-tabs state; closes/opens presence ranges and appends them to the log; owns a `chrome.alarms` retention-prune alarm. Imports nothing from the existing trackers. |
| `src/data/intervalLog.js` | Owns the `biteguard-intervals` IndexedDB (open + `onupgradeneeded`); `append`, `queryRange`, `queryBySite`, `pruneOlderThan`. `DEFAULT_INTERVAL_RETENTION_DAYS` colocated here. |
| `src/pages/overlap/overlap.{html,css,js}` | Standalone overlap view (reuses the shared header per `theme.css`; icon-back to dashboard). |

**Modified (the only existing-file change):**

| File | Change |
|---|---|
| `src/background/background.js` | **One** additive top-level line: `import './intervalTracker.js';` (the module self-registers its listeners on import). Nothing else in this file changes. |

No change to `trackingUtils.js`, `siteTracking.js`, `subpageTracking.js`,
`migrations.js`, `prune.js`, `targetedDelete.js`, `importData.js`,
`seedTestData.js`, `healthCheck.js`, `prefKeys.js`, or any existing page.

### Capture mechanism (how it works without touching the tracker)

`intervalTracker.js` re-derives presence from the same Chrome signals the
existing tracker uses, but with its **own** minimal state — it does not read the
tracker's maps:

- Tracks the active tab's site per window (via `tabs.onActivated`,
  `tabs.onUpdated`, `windows.onRemoved`) and the set of audible, unmuted tabs
  (via `tabs.onUpdated`'s `audible`/`mutedInfo`).
- On any state change it closes the affected site's open presence range
  `[openedAt, now]` and appends it as a row, then opens a fresh one. A site's
  back-to-back ranges are coalesced before the row is written.
- `kind` is `active` (site is a foreground active tab) or `audio` (site has an
  audible unmuted tab) — a site can contribute both.

This duplicates a modest amount of active-tab/audible detection. Accepted: the
log is approximate analysis and need not match the scalar tracker exactly, and
isolation is the explicit goal.

### Storage

| Store | Shape | Read by | Written by | Notes |
|---|---|---|---|---|
| `intervals` (IndexedDB **`biteguard-intervals`**, own version) | one row per closed presence session: `{ id (auto), site, kind: 'active'\|'audio', from, to }` (epoch ms) | overlap page | `intervalTracker.js` | **separate database**, not the `biteguard` DB |

Indexes on `intervals`:
- `by_to` (`to`) — retention prune via `IDBKeyRange.upperBound(cutoff)`.
- `by_site_from` (`[site, from]`) — per-site ordered reads.
- `by_from` (`from`) — overlap range query over a day/range.

The sidecar calls `navigator.storage.persist()` once on first open. Retention
window is a const default in `intervalLog.js` for v1 (no settings-page touch —
surfacing it as a pref is deferred to keep the sidecar isolated).

### Why an append-only log (not cell-keyed scalar replacement)

Decided across the full operation lifecycle:

- **Write** — capture is a pure `add()` of closed ranges; no read-modify-write,
  cost independent of total history.
- **Read** — only the overlap page touches the DB; everything else is untouched.
- **Delete** — retention is one range delete on `by_to`.
- **Migration** — the decisive constraint: intervals **cannot be backfilled**
  from existing scalars (the boundaries were discarded), so intervals can only
  ever accrue going forward. The log starts empty and overlap covers only
  periods since it began — the same precedent as wall-clock and subpage
  tracking being younger than the data.

Footprint is not the deciding factor: on the exported 40-day dataset the log
holds ~2,000 site-level intervals (~0.1 MB), worst case ~42k (~1.2 MB JSON /
0.65 MB IndexedDB) — comfortably bounded, especially with retention.

#### Footprint estimate (method)

The exact interval count can't be recovered from existing data — aggregation
into the ms scalars discarded the boundaries. It was bracketed from a
`biteguard` export, counting only the `*ByHour` cells (day buckets are derived,
so they hold no intervals), with three data-grounded numbers per non-zero
metric cell:

- **floor** = 1 (a non-zero metric needs ≥ 1 interval) — the realistic site
  count, because a site stays one continuous foreground interval while you
  navigate within it (`visits` counts navigations, not activations).
- **visit-proxy** = `max(1, visits)` — loose upper estimate (overcounts the
  site tracker for the reason above).
- **flush-cap** = `min(60, ceil(metricMs / 60000))` — physical worst case
  (≤ one interval per flush-minute a cell spans); only full-hour audio cells
  approach 60.

Byte cost ≈ 30 B/interval-pair (storage.local JSON, 13-digit timestamps) or
16 B/pair (IndexedDB doubles), plus shared structural overhead. Re-run against
a fresh export to re-check as history grows.

### Sessions are stored whole (no hour-clipping)

A presence session that crosses an hour boundary is stored as one row. Precise
overlap needs true session boundaries; clipping would fragment sessions and
force stitching.

## How to remove

The feature is designed to be ditched cleanly:

1. Delete `src/background/intervalTracker.js`, `src/data/intervalLog.js`, and
   `src/pages/overlap/`.
2. Delete the single `import './intervalTracker.js';` line in `background.js`.
3. (Optional) drop the `biteguard-intervals` IndexedDB once
   (`indexedDB.deleteDatabase('biteguard-intervals')`), or leave it orphaned.

Nothing else needs unpicking — no tracking, storage, prune, export, or page
code was ever touched.

## Edge cases

- **Pre-log history**: periods before the log started have no rows; the overlap
  page surfaces "overlap data available since `<date>`".
- **Hour-crossing session**: stored as a single row, not split.
- **Foreground-parallel vs background**: `active` ∩ `active` (multi-window real
  parallel use) reported separately from `audio` ∩ `active` via the `kind` tag.
- **SW suspend**: an open range whose `openedAt` is stale on the next SW
  lifecycle is closed at a clamped time (sidecar keeps its own lightweight
  snapshot, or simply drops the in-flight range — exactness isn't required).
- **IndexedDB unavailable / quota exceeded**: the sidecar degrades off; nothing
  else is affected.
- **Coalescing**: a site's back-to-back ranges are merged before the row is
  written.

## Out of scope (v1)

- Any integration into the existing unified export, retention pruner,
  "forget this site", settings page, or storage-management usage bar — staying
  out of them is the point. Integrate only if the feature is later promoted.
- Replacing or deriving the scalar aggregates — additive sidecar only.
- Subpage-level overlap — the log keys on site, not path.
- `idle` intervals — only `active` and `audio` kinds.
- A dashboard-wide "parallel browsing" aggregate view.

## Open questions

- Default retention window (7 / 14 / 30 days?).
- How the overlap page is reached during the experiment — opened directly by
  `chrome-extension://…/overlap.html` (zero-touch), vs. accepting one
  `navButton` link from an existing page when ready for discoverability.
- Whether to later promote the sidecar (integrate export/prune/settings) or
  keep it standalone.
