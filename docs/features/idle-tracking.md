# Idle tracking

Pause `activeMs` accrual while the user is idle (no keyboard/mouse input) or the screen is locked, and record the paused time as a separate `idleMs` counter. `activeMs` becomes "attended" time (focused + input); `idleMs` is "focused but no input"; the two are disjoint and sum to "presence". Audio time keeps counting in both states — a playing tab is real usage even if the user has stepped away.

## User stories

- As a user, I want time to stop counting as "active" when I step away from the keyboard or mouse, so the dashboard reflects attention rather than wall clock with a focused window.
- As a user, I want time to stop counting as "active" when my screen is locked, so a long lunch break doesn't inflate a site's daily total.
- As a user, I want audio I left playing to keep counting while I'm idle or locked, because background music or a podcast is still real usage.
- As a user, I want to see how much of my "focused" time was actually idle, so I can tell the difference between attending a site and leaving it open.

## Acceptance criteria

- When the user has been idle (no input for ≥ 60s) at the moment of a flush tick, the in-flight active range is split: the portion before idle began is credited to `activeMs`, the portion within the idle window is credited to `idleMs`, and the two are disjoint.
- When the screen is locked at the moment of a flush tick, behavior is identical to idle: the locked portion credits `idleMs`, not `activeMs`.
- While idle or locked, any audible tab continues to accrue `audioMs` normally.
- `idleMs` accrues only for the currently-focused site (no focused site → no `idleMs` accrual anywhere).
- When the user becomes active again, `activeMs` resumes accruing on the currently-focused site without a duplicate visit being counted.
- No new visit is recorded for the resume — going idle and coming back does not look like leaving and returning to the site.
- `activeMs + idleMs` for a focused site over any interval equals the total focused time on that site (modulo the per-tick clip approximation of ~30s per transition).

## Scope

### Surfaces involved


| Surface    | Role in this feature                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| background | Polls `chrome.idle.queryState(60)` in the existing `flush` alarm handler; splits in-flight active ranges into `activeMs` and `idleMs` based on the queried state. |


### Files likely to change


| File                              | Change                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                   | Add `"idle"` to `permissions`.                                                                                                                                                                                                                                                                                        |
| `src/background/background.js`    | In the existing `flush` alarm handler, call `chrome.idle.queryState(60)` before `flushToStorage`. If `idle` or `locked`, split the in-flight active range on the focused-site key at `now - 60s`: push `[startedAt, now - 60s]` as `activeMs`, push `[now - 60s, now]` as `idleMs`. Audio ranges are not touched. |
| `src/background/trackingUtils.js` | Add `idleMs` to the cell shape returned by `getCell`. Add `idle` as a fourth field alongside `active` / `audio` / `overlap` in the pending range maps and the `addRanges` loop inside `flushToStorage`, so `idleMs` is committed to per-day / per-hour buckets the same way as the others.                          |
| `src/background/siteTracking.js`  | Update `getCell` to default `idleMs: 0` on new cells.                                                                                                                                                                                                                                                                 |
| `src/background/subpageTracking.js` | Update `getCell` to default `idleMs: 0` on new subpage cells.                                                                                                                                                                                                                                                       |


### Storage / tracking

Each cell in `sitesByDay`, `sitesByHour`, `subpagesByDay`, and `subpagesByHour` gains an `idleMs` field. Shape becomes `{ activeMs, audioMs, overlapMs, idleMs, visits }`. No new top-level storage keys.

Existing cells written before this feature have no `idleMs` field; readers should treat a missing `idleMs` as `0` (same defaulting pattern already used for other numeric fields on read).

The 60-second idle threshold is hardcoded in `background.js` for v1.
