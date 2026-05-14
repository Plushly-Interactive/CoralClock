# Subpage tracking — deferred work

Items intentionally left out of the initial subpage-tracking implementation.

## UI

- Per-site **opt-out toggle** ("Track subpages: on/off"). Likely lives on `site.html`. Default = on.
- **Merge-by-depth** control in dashboard / drill / site views: collapse `twitch.tv/shroud/clips` and `twitch.tv/shroud/videos` into `twitch.tv/shroud` when depth = 1, etc.
- **Decode for display**: paths are stored URL-encoded (e.g. `/Just%20Chatting`); decode with `decodeURIComponent` only at render time.

## Path normalization

- **Per-site path patterns** (was option Q1C): user-defined rules like `reddit.com` → keep `/r/<sub>` only, `youtube.com` → keep `?v=<id>` only. Could replace or complement raw path storage.

## Storage

- **Switch to hour-only-for-today** (was option Q1C) if `subpagesByHour` grows too large. Keep `subpagesByDay` indefinitely; drop hour buckets older than today.
- **Purge non-human-readable paths** on a regular schedule: paths dominated by random characters / hashes / long IDs accumulate noise. Heuristic-based cleanup.

## Blocking

- Extend the rules system to allow **path-scoped limits** (e.g. limit `twitch.tv/directory` separately from `twitch.tv`). Will require moving from pure-domain `declarativeNetRequest` rules to URL-filter rules.
