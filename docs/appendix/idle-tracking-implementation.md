# Idle tracking — implementation detail

TL;DR: the per-file changes and storage shapes cut from `docs/features/idle-tracking/idle-tracking.md`. Reference only.

### Files likely to change


| File                                | Change                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                     | Add `"idle"` to `permissions`.                                                                                                                                                                                                                                                                                        |
| `src/background/background.js`      | Module-level `idleStartedAt` variable, set by `chrome.idle.onStateChanged` on `idle`/`locked` and cleared on `active`. Bootstrap reads the threshold from `chrome.storage.local` (`PREF_IDLE_THRESHOLD_SEC`, default 300), calls `chrome.idle.setDetectionInterval(sec)` and seeds `idleStartedAt` via `queryState` so a service-worker restart mid-idle doesn't lose all state. A `chrome.storage.onChanged` listener re-calls `setDetectionInterval` when the pref changes, so the new threshold takes effect without an extension reload. The `flush` alarm handler calls `clipIfIdle(flushAt)` before `flushToStorage`, which splits the in-flight active range at `idleStartedAt`. Audio ranges are not touched. |
| `src/background/trackingUtils.js`   | Add `idleMs` to the cell shape returned by `getCell`. Add `idle` as a fourth field alongside `active` / `audio` / `overlap` in the pending range maps and the `addRanges` loop inside `flushToStorage`. Add `applyIdleClip(idleSince, now)` to the tracker, which splits the in-flight active+overlap ranges at `idleSince` and credits the post-split portion to `pendingIdle`.                          |
| `src/background/siteTracking.js`    | Update `getCell` to default `idleMs: 0` on new cells; re-export `applyIdleClip`.                                                                                                                                                                                                                                      |
| `src/background/subpageTracking.js` | Update `getCell` to default `idleMs: 0` on new subpage cells; re-export `applyIdleClipSubpages`.                                                                                                                                                                                                                      |
| `src/data/migrations.js`            | v5 → v6 migration backfills `idleMs: 0` on every existing cell across `sitesByDay`, `sitesByHour`, `subpagesByDay`, `subpagesByHour`.                                                                                                                                                                                 |


### Storage / tracking

Each cell in `sitesByDay`, `sitesByHour`, `subpagesByDay`, and `subpagesByHour` gains an `idleMs` field. Shape becomes `{ activeMs, audioMs, overlapMs, idleMs, visits }`. No new top-level storage keys. Existing cells are backfilled via the v5 → v6 migration.

The idle threshold is user-configurable on the settings page (`PREF_IDLE_THRESHOLD_SEC`, default 300 seconds / 5 minutes, minimum 1 minute — Chrome's `setDetectionInterval` requires ≥ 15 seconds). Under the event-driven design, the threshold is purely a "how long Chrome waits before firing `idle`" knob:

- The threshold controls Chrome's detection latency, not the clip math.
- The first T seconds of every idle stretch are inherently credited to `activeMs` because Chrome can only confirm "idle for ≥ T" after T elapses. Once the event fires, all subsequent time credits correctly to `idleMs`.
- The user can pick any value without the math bugs that a polling-based design would have.
