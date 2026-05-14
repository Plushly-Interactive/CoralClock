# Subpage tracking — deferred work

Items intentionally left out of the initial subpage-tracking implementation.

## UI

- Per-site **opt-out toggle** ("Track subpages: on/off"). Likely lives on `site.html`. Default = on.
- **Merge-by-depth** control — see plan below.
- **Decode for display** — see plan below.
- **Conditional subpage tile**: hide the tile and its grid column entirely when a site has no entries in `subpagesByDay`. The grid reverts to 2-col. Check at render time by looking up `subpagesByDay[siteId]`; if missing or empty, skip the column.

## Path normalization

- **Per-site path patterns** (was option Q1C): user-defined rules like `reddit.com` → keep `/r/<sub>` only, `youtube.com` → keep `?v=<id>` only. Could replace or complement raw path storage.

## Storage

- **Switch to hour-only-for-today** (was option Q1C) if `subpagesByHour` grows too large. Keep `subpagesByDay` indefinitely; drop hour buckets older than today.
- **Purge non-human-readable paths** on a regular schedule: paths dominated by random characters / hashes / long IDs accumulate noise. Heuristic-based cleanup.

## Blocking

- Extend the rules system to allow **path-scoped limits** (e.g. limit `twitch.tv/directory` separately from `twitch.tv`). Will require moving from pure-domain `declarativeNetRequest` rules to URL-filter rules.

---

## Plan: site.html — "Top pages" tile

A new tile added as a third column in the grid, spanning both rows. Only rendered when `subpagesByDay[siteId]` has data; if absent, the grid stays 2-col.

**Controls (inside the tile header)**:
- Depth segmented control: `1 · 2 · … · Full`. Depth N = keep first N path segments. Buttons rendered dynamically: `1` to `min(5, actualMaxDepth - 1)`, then always `Full`. If the cap (5) equals `actualMaxDepth`, the `5` button is omitted (it would be identical to Full). Default: Full.
- Sort toggle: `Time · Visits`. Switches the displayed metric and re-sorts the list. Default: Time.

**List rows**:
- Path displayed with `decodeURIComponent` (see decode plan).
- When a row was produced by merging deeper paths, a dim `*` is appended to the displayed path (e.g. `/r/programming*`).
- Clicking a row writes `{ siteId, path, prefix }` to sessionStorage and navigates to `path.html`. `prefix: false` for exact rows; `prefix: true` for merged (truncated) rows.

---

## Plan: path.html

A new page showing analytics scoped to a single path (or path prefix).

**Entry**: reads `{ siteId, path, prefix }` from sessionStorage on load.

**Header**: same structure as `site.html` — domain name in center, range dropdown alongside it (synced via sessionStorage like `analyticsRange`).

**Breadcrumb subheader**: a slim bar below the header showing `[domain] / [path segments]`, where the domain is a link back to `site.html`. Path is decoded for display; no `*` suffix here.

**Body**: the same four-chart grid as `site.html` (Time / Overview / Visits / Hourly), but data is fetched from `subpagesByDay[siteId]` and `subpagesByHour[siteId]`.
- `prefix: false` — exact lookup of the single path key.
- `prefix: true` — aggregate all entries whose key starts with the stored path, summing `activeMs`, `audioMs`, `overlapMs`, and `visits`.

**Drill view**: same drill interaction as `site.html`. `drill.js` is extended to accept a data-fetching callback (`dataFn`) so it can be reused without duplicating logic. `path.html` passes a function that reads from `subpagesByDay/Hour[siteId]` filtered to the relevant path(s).

**Back button behaviour**:
- In overview (charts grid visible): navigates to `site.html`.
- In drill view: closes drill and returns to the path overview (does not navigate away).

---

## Plan: Merge-by-depth

**Depth definition**: depth N = keep the first N non-empty path segments. `/r/programming` is depth 2 (`r` + `programming`). `/r` is depth 1.

**What it does**: collapses paths to at most N segments. E.g. at depth 2, `/r/programming/comments/abc/title` → `/r/programming`. Paths with fewer or equal segments are left as-is. Entries that collapse to the same key have their `activeMs`, `audioMs`, `overlapMs`, and `visits` summed.

**Implementation**:
1. A pure function `mergePaths(paths, depth)`:
   - Input: `{ [path]: { activeMs, audioMs, overlapMs, visits } }`
   - Splits each path on `/`, filters empty segments, takes first `depth`, rejoins with `/`.
   - Accumulates colliding keys by summing all numeric fields; sets a `truncated` flag when any source path was longer than the result.
   - Returns an array of `{ path, activeMs, audioMs, overlapMs, visits, truncated }`.
2. Called after fetching raw `subpagesByDay[siteId]`, before rendering. No changes to storage.
3. Default depth: Full (no merge).

**Edge cases**:
- `/` (root, zero segments) stays `/` at any depth.
- Query strings are not stored (paths are pathname only), so no issue.

---

## Plan: Decode for display

**What it does**: renders stored URL-encoded paths (e.g. `/Just%20Chatting`) as human-readable strings (e.g. `/Just Chatting`). Storage is unchanged.

**Implementation**: a single helper used everywhere a path is rendered:

```js
function displayPath(path) {
  try { return decodeURIComponent(path); }
  catch (_) { return path; }
}
```

The `try/catch` handles malformed percent-sequences (e.g. `%GG`) that would otherwise throw. Applied in:
- The "Top pages" list on `site.html`
- The breadcrumb subheader and page title on `path.html`
- Any drill-view labels that show a path

**Not applied to**: storage keys, sessionStorage values, URL query params — anywhere the raw value is needed for lookup or comparison.
