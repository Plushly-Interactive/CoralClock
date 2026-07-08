# Bucket → interval tracking migration

Collapse the **two parallel tracking systems** into one. Today the scalar tracker
(`siteTracking` + `subpageTracking` → scalar **buckets** in `chrome.storage.local`)
and the interval tracker (`intervalTracker` → the **interval log** in IndexedDB)
both capture live in the same service worker — double listeners, two snapshots,
two flush alarms. This migration **promotes the interval log to the single
authoritative tracker**, **freezes the buckets as read-only legacy** (so
pre-interval history isn't lost), and makes the existing dashboards read intervals
— stitching old bucket history underneath transparently.

This retires the "removable experiment" framing of
[interval-storage.md](interval-storage.md): the interval log stops being a
side-experiment and becomes *the* tracker. **Scope is the whole app, not just
capture** — now that interval tracking is proven, this makes intervals first-class
everywhere: tracking, every dashboard/drilldown, **all user data actions**
(export, import, prune, "forget this site", storage health), and **enforcement**.
Whatever the buckets back today, intervals must back tomorrow.

**This migration is a prerequisite for
[cloud sync](cloud-sync/cloud-sync.md)** — sync replicates the interval log, which
only makes sense once intervals are the real data, not an experiment running
beside the real one.

## Why now

- Two trackers double-capture: wasted CPU/wakeups, two snapshot/flush lifecycles,
  two sources of truth to reason about.
- Cloud sync assumes intervals are authoritative. Building sync on an experiment
  that runs *beside* the live system is the wrong foundation.
- Parity is validated: across 15 days of testing the interval log reproduces the
  scalar active/audio/visit numbers within a seconds-to-a-minute gap — exactly the
  "≤ one flush interval" skew [interval-storage.md](interval-storage.md) predicts
  from two independent 1-min flush clocks. After cutover there is only one tracker,
  so even that skew disappears going forward.

## User stories

- As a user, my dashboards keep working unchanged across the switch — same
  numbers, same history, no visible break between old and new data.
- As an existing user, my pre-interval history stays visible (it lives in the
  frozen buckets, stitched in under the interval data).
- As the developer, one tracker captures, one store is authoritative, and the
  service worker stops doing the work twice.

## Acceptance criteria

- [ ] The main dashboard, site page, and path page render entirely from the
      interval log for days that have interval data, and from buckets for days
      before interval tracking began — presented as one continuous history.
- [ ] Path/site **drilldowns** show interval-derived data (not the scalar pages
      they currently link to).
- [ ] The scalar `siteTracking` / `subpageTracking` listeners are removed from
      `background.js`; no scalar bucket is written after cutover.
- [ ] Buckets remain **readable** (legacy history) but frozen — no native writes.
- [ ] Only one tracking stack runs in the service worker (one set of listeners,
      one snapshot, one flush alarm).
- [ ] No data loss: pre-interval days still display; interval days are unchanged.
- [ ] **Every user data action operates on the interval log:** BiteGuard
      export/import carries interval rows; CSV export is interval-derived; prune,
      "forget this site" / targeted delete, and storage-health all cover intervals.
- [ ] **External (Time Tracker) import lands in a separate bucket tier**, and the
      import UI states it is a distinct dataset that won't merge with native
      interval tracking.
- [ ] **Enforcement runs off interval-derived usage.** `computeOverage` (already
      built, pure, takes the four bucket shapes) is fed interval-derived shapes
      instead; the overage matches the bucket-based result side-by-side before
      cutover. No enforcement logic changes — only its data source.

## Scope

### Current state (two stacks)

| Stack | Files | Store | Read by |
|---|---|---|---|
| Scalar (live) | `siteTracking.js`, `subpageTracking.js`, `trackingUtils.js`, driven by `background.js` listeners | `sitesByDay/Hour`, `subpagesByDay/Hour` in `chrome.storage.local` | main dashboard, site, path (via background message API) |
| Interval (live, experiment) | `intervalTracker.js`, `intervalTrackingUtils.js`, `intervalPageTracking.js`, `intervalLog.js`, `intervalAggregates.js` | `browsing-intervals` IndexedDB | interval-dashboard only (page-side) |

### Target state (one stack)

- **Interval tracker is the only live capturer.** Scalar listeners removed.
- **Buckets frozen** — read-only legacy, no new writes.
- **Dashboards read intervals**, stitching buckets underneath for pre-interval
  days. The separate interval-dashboard is folded into / replaced by the main
  dashboard and removed.

### The stitch rule

Per day: **prefer interval data; fall back to buckets only for days before
interval tracking began** (earliest interval row's day). No seam-marker stored —
the boundary is data presence. During the overlap window (both stacks captured),
interval days win (authoritative). Removing the scalar tracker only stops the
redundant writes; it does not move the display boundary.

### Read architecture

Intervals are read **page-side** from IndexedDB via `intervalAggregates` (as the
interval-dashboard already does). Buckets are read via the existing **background
message API** (`getSitesByDay`, etc.). So a migrated page is a **mixed reader**:
interval page-reads for recent days, stitched with bucket message-reads for legacy
days.

### Files

| File | Change |
|---|---|
| `src/data/intervalAggregates.js` | **Emit the four aggregate shapes** (site day/hour + subpage day/hour) — feeds dashboards, drilldowns, and `computeOverage`. See task 1. |
| `src/pages/dashboard/dashboard.js` | Read `intervalAggregates`, stitch legacy buckets for pre-interval days. |
| `src/pages/site/*`, `src/pages/path/*` | Same: interval-derived, with drilldowns reading intervals. |
| `src/background/background.js` | Remove `siteTracking`/`subpageTracking` imports + their listeners. Keep the message API serving buckets read-only for legacy days. |
| `src/background/siteTracking.js`, `subpageTracking.js`, `trackingUtils.js` | Capture path removed/retired (legacy read helpers may remain if needed). |
| `src/pages/interval-dashboard/*` | Folded into the main dashboard, then removed. |
| `src/data/importData.js` | BiteGuard export/import carries interval rows; CSV export interval-derived; external (TT) import routed to the separate bucket tier with a UI notice. |
| `src/data/prune.js` | Prune the interval log (today buckets only). |
| `src/data/targetedDelete.js` | "Forget this site" deletes that site's interval rows (today buckets only). |
| `src/data/healthCheck.js` | Report interval-DB size/health alongside bucket health. |

## Plan — two phases, two branches

Split by **risk profile**: Phase A is **additive** (scalar untouched, interval tier
built out in parallel, validated side-by-side via the separate interval surfaces),
Phase B is the **destructive cutover** (repoint the primary surfaces, delete
scalar, freeze buckets). Phase A keeps the "removable experiment" property and is
independently shippable; isolating Phase B on its own branch lets the irreversible
flip be reviewed/reverted as one unit.

```
Branch A (feature/interval-tracking)  →  Branch B (off A)  →  cloud sync
        Phase A                              Phase B
```

### Phase A — additive interval completeness (Branch A)

Scalar stays live and authoritative. New interval capability lands beside it,
validated by comparing the separate interval surfaces against the scalar ones.
Where a surface is shared UI (data-management), add interval actions as
**separate/guarded controls** so the bucket path is undisturbed.

1. **Full interval aggregate shapes (FIRST — gates everything).** Extend
   `intervalAggregates` to emit the **four shapes** the app consumes — site
   `byDay`/`byHour` (site-by-day exists today) and subpage `byDay`/`byHour`
   (domain → path → `{activeMs, audioMs, visits}`, prefix-level rollups for
   `reddit.com/news`-style). Mirror how `getSitesByDay` unions ranges, keyed at
   `domain+path`. Unlocks all three consumers below.
2. **Interval drilldowns** in the interval dashboard (today its rows link to the
   scalar site/path pages — build interval-backed drilldowns instead).
3. **Interval data-management** as additive controls — see
   [Data-management parity](#data-management-parity) (interval export/import,
   prune, "forget this site", storage health).
4. **Interval enforcement, validated side-by-side.** Feed the four interval shapes
   into the existing pure `computeOverage`; diff its overage against the
   bucket-based result. No live redirect path changes yet — this is a parity check.

Parity of the underlying capture is already accepted (15-day validation); an
optional rigorous spot-check can precede Phase B.

### Phase B — cutover (Branch B, off A)

Flip intervals to authoritative, remove the parallelism.

1. **Repoint the primary surfaces** — main dashboard + site/path pages + the
   **live** enforcement data source — to interval data, **stitching buckets for
   pre-interval days** (the stitch rule).
2. **Remove scalar capture** from `background.js`; freeze buckets read-only.
3. **Fold + remove the interval-dashboard** (the main dashboard now shows
   intervals); retire the "removable experiment" framing in
   [interval-storage.md](interval-storage.md).

## Data-management parity

Making intervals authoritative means **every user action that operates on buckets
today must operate on the interval log.** [interval-storage.md](interval-storage.md)
deliberately deferred *all* of this ("export/import, settings, a clear control,
and 'forget this site' all leave the interval log alone"); finishing the
interval-based app is where that debt is paid. Two tiers now coexist — **interval
(native)** and **bucket (frozen legacy + external imports)** — and several actions
span both.

| Action | Today (buckets) | After migration |
|---|---|---|
| BiteGuard export | dumps bucket maps + rules + prefs | **also exports the interval log** (raw rows) |
| BiteGuard import | restores buckets | **also restores interval rows** |
| CSV export | from buckets | **interval-derived** (via `intervalAggregates`), with legacy bucket days stitched |
| TT (external) export | from `sitesByDay` | interval-derived daily site aggregates |
| **TT (external) import** | writes `sitesByDay` | **lands in the separate bucket tier** — see below |
| Prune | `prune.js` over buckets | prune interval rows |
| Forget this site / targeted delete | `targetedDelete.js` over buckets | delete that site's interval rows |
| Storage health / size | `healthCheck.js` over buckets | report interval-DB size/health too |
| **Enforcement** | live; pure `computeOverage` over the four bucket shapes | same function fed interval-derived shapes — a data-source swap, logic unchanged |

### External imports create a separate bucket of data

External tools (Time Tracker) export **coarse daily site aggregates** (focus +
visits) — the raw `from/to` ranges the interval log needs were never captured, so
**an external import cannot become interval rows.** It lands in the **bucket
tier**, kept separate from native interval tracking. Where an imported day overlaps
a day that also has interval data, the stitch rule (prefer intervals) would shadow
the import. So the import UI must **explicitly tell the user** this creates a
**separate dataset** that may not appear alongside — or merge with — native
tracking for overlapping days. (BiteGuard's own export/import is unaffected: it
round-trips both tiers natively.)

## Edge cases

- **Boundary day (first interval day).** Interval tracking began mid-day on its
  first day, so that day's interval data may be slightly low vs the bucket it
  replaces. Accept a one-time small discrepancy on the boundary day; everything
  before it reads from buckets, everything after is full interval days.
- **Visit-count divergence.** Interval visits are presence-based and **audio-free**
  by design (see interval-storage.md); for media sites they differ from the scalar
  bucket's audio-start visits. Expected — intervals are now the source of truth.
- **Aggregation memory.** `intervalAggregates` loads the whole log via `toArray()`.
  Fine at current scale; the cloud-sync spec already tracks this ceiling.
- **Legacy data management.** Export / prune / "forget this site" continue to
  operate on buckets for legacy days; they do **not** touch the interval log (that
  integration is cloud-sync's concern, not this migration's).

## Follow-ups (deferred, post-cutover)

- **Unify the merged reader's two access paths.** ✅ Done, and went further: the
  page↔SW data message API was removed entirely. `mergeDataSources` now calls two
  plain page-side functions: `intervalFetch` (IndexedDB) and `bucketFetch`
  (`src/data/bucketProvider.js`, reading `chrome.storage.local` directly).
  `bucketProvider` mirrors the old background bucket handlers, which post-cutover
  were already plain `chrome.storage.local` reads (the live scalar snapshot was
  dropped at cutover) — so this is a relocation of identical reads, not a behavioral
  change. With the merged reader off
  the message API, no consumer was left using it — storage-management and CSV/TT
  export already read interval aggregates / storage directly — so the six
  `MSG_GET_*` handlers, the in-memory bucket caches, and `invalidateSitesCache` (plus
  every `MSG_INVALIDATE_SITES_CACHE` sender) were deleted. `background.js` no longer
  registers `chrome.runtime.onMessage`; the only remaining event surfaces are the
  chrome.* lifecycle listeners that capture and enforce. The six `MSG_GET_*`
  constants survive in `msgTypes.js` as the dispatch tags shared by the provider/merge
  layer (no longer actual runtime messages).

## Out of scope

- **Cloud sync** — separate spec; this migration is its prerequisite. The *sync*
  of deletes (tombstones), the E2E export, and cross-device combined enforcement
  are cloud-sync's layer on top of the **local** actions defined here.
- **Rebuilding enforcement** — it is already built and working
  ([enforcement.js](../../src/background/enforcement.js)). This migration only
  swaps its data source (bucket shapes → interval-derived shapes); `computeOverage`
  and the DNR publisher are untouched. Cross-device *combined* enforcement is
  cloud-sync's layer, not this migration's.
- **Backfilling buckets → intervals.** Impossible — buckets are coarse aggregates;
  the raw `from/to` ranges were never stored. Hence the stitch (and the separate
  bucket tier for external imports) instead of migrating old data.
- **Automatic retention / auto-pruning of the interval log.** Manual prune tooling
  is in scope (above); a time-based auto-retention policy is not (deferred, no
  schema change needed to add later).
