# Subpage tracking — deferred work

Items intentionally left out of the initial subpage-tracking implementation.

## UI

- Per-site **opt-out toggle** ("Track subpages: on/off"). Likely lives on `site.html`. Default = on.

## Path normalization

- **Per-site path patterns** (was option Q1C): user-defined rules like `reddit.com` → keep `/r/<sub>` only, `youtube.com` → keep `?v=<id>` only. Could replace or complement raw path storage.
- **Don't record transit-only visits.** Cross-domain redirects, short-lived intermediate URLs, and prerender hits currently produce subpage entries the user never actually viewed (e.g. `amazon.fr` → `amazon.co.jp` redirect briefly recording the JP path). Filter at tracking time so these never reach storage, instead of papering over on the display side. Candidate heuristic: only commit a path entry after it stays active for ≥ N ms or receives a real focus/interaction event.

## Storage

- **Switch to hour-only-for-today** (was option Q1C) if `subpagesByHour` grows too large. Keep `subpagesByDay` indefinitely; drop hour buckets older than today.
- **Purge non-human-readable paths** on a regular schedule: paths dominated by random characters / hashes / long IDs accumulate noise. Heuristic-based cleanup.

## Blocking

- Extend the rules system to allow **path-scoped limits** (e.g. limit `twitch.tv/directory` separately from `twitch.tv`). Will require moving from pure-domain `declarativeNetRequest` rules to URL-filter rules.

---

## Done

- **`mergePaths` helper** — pure function in `src/shared/paths.js` collapsing paths to N segments, summing colliding keys, flagging `truncated`.
- **`displayPath` helper** — `decodeURIComponent` with `try/catch` for malformed sequences. Used wherever paths are rendered, never for storage/lookup.
- **"Top pages" tile on `site.html`** — third column in the grid (spanning both rows), with depth segmented control (`1` to `min(5, actualMaxDepth - 1)`, then `Full`) and sort toggle (Time/Visits). Conditionally hidden when `subpagesByDay[siteId]` is empty; grid reverts to 2-col.
- **Row click handoff** — writes `{ siteIds, path, prefix }` to `sessionStorage.subpageDrill` and navigates to `path.html`. `prefix: true` for merged/truncated rows.
- **`path.html`** — mirrors `site.html` structure with breadcrumb subheader, 4-chart grid, drill view. Aggregates across the path (exact or prefix). Back button is context-aware (drill → exit drill; overview → site.html).
- **`drill.js` extracted to `src/shared/drill.js`** — accepts data-fetching callbacks (`getDayEntry`, `getHourEntriesForDay`, `getAvgPerClockHour`). Builds its own drill-view DOM on init so both pages share the same markup with no duplication.
