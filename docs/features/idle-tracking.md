# Idle tracking

Pause `activeMs` accrual while the user is idle (no keyboard/mouse input) or the screen is locked, and record the paused time as a separate `idleMs` counter. `activeMs` becomes "attended" time (focused + input); `idleMs` is "focused but no input"; the two are disjoint and sum to "presence". Audio time keeps counting in both states — a playing tab is real usage even if the user has stepped away.

**Scope limitation:** `chrome.idle` reports OS-wide input, not browser-specific input. If the user is actively working in another app (IDE, terminal, etc.) while a Chrome tab is focused in the background, the OS reports `active` and the focused Chrome tab keeps accruing `activeMs`. This feature catches "user away from the computer entirely" but does not catch "user working in another app with Chrome in the background." See [Deferred](#deferred) for the per-page content-script approach that would close this gap.

## User stories

- As a user, I want time to stop counting as "active" when I step away from the keyboard or mouse, so the dashboard reflects attention rather than wall clock with a focused window.
- As a user, I want time to stop counting as "active" when my screen is locked, so a long lunch break doesn't inflate a site's daily total.
- As a user, I want audio I left playing to keep counting while I'm idle or locked, because background music or a podcast is still real usage.
- As a user, I want to see how much of my "focused" time was actually idle, so I can tell the difference between attending a site and leaving it open.

## Acceptance criteria

- When the user has been idle (no input for ≥ 60s), `chrome.idle.onStateChanged` fires `idle` and the moment is recorded as `idleStartedAt`. The next flush splits the in-flight active range at that timestamp: the portion before is credited to `activeMs`, the portion after to `idleMs`. The two are disjoint.
- When the screen locks, behavior is identical to idle: the locked portion credits `idleMs`, not `activeMs`.
- While idle or locked, any audible tab continues to accrue `audioMs` normally.
- `idleMs` accrues only for the currently-focused site (no focused site → no `idleMs` accrual anywhere).
- When the user becomes active again, `chrome.idle.onStateChanged` fires `active`, `idleStartedAt` is cleared, and the next flush resumes crediting the focused site to `activeMs`. No duplicate visit is counted.
- No new visit is recorded for the resume — going idle and coming back does not look like leaving and returning to the site.
- `activeMs + idleMs` for a focused site over any interval equals the total focused time on that site, minus the inherent first-60s-per-stretch credited to `activeMs` while Chrome waits to confirm idleness before firing the event.

## Scope

### Surfaces involved


| Surface    | Role in this feature                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| background | Listens to `chrome.idle.onStateChanged` to record the exact moment the user goes idle/locked; the existing `flush` alarm handler clips in-flight active ranges at that timestamp. |


### Files likely to change


| File                                | Change                                                                                                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                     | Add `"idle"` to `permissions`.                                                                                                                                                                                                                                                                                        |
| `src/background/background.js`      | Module-level `idleStartedAt` variable, set by `chrome.idle.onStateChanged` on `idle`/`locked` and cleared on `active`. Bootstrap calls `chrome.idle.setDetectionInterval(60)` and seeds `idleStartedAt` via `queryState` so a service-worker restart mid-idle doesn't lose all state. The `flush` alarm handler calls `clipIfIdle(flushAt)` before `flushToStorage`, which splits the in-flight active range at `idleStartedAt`. Audio ranges are not touched. |
| `src/background/trackingUtils.js`   | Add `idleMs` to the cell shape returned by `getCell`. Add `idle` as a fourth field alongside `active` / `audio` / `overlap` in the pending range maps and the `addRanges` loop inside `flushToStorage`. Add `applyIdleClip(idleSince, now)` to the tracker, which splits the in-flight active+overlap ranges at `idleSince` and credits the post-split portion to `pendingIdle`.                          |
| `src/background/siteTracking.js`    | Update `getCell` to default `idleMs: 0` on new cells; re-export `applyIdleClip`.                                                                                                                                                                                                                                      |
| `src/background/subpageTracking.js` | Update `getCell` to default `idleMs: 0` on new subpage cells; re-export `applyIdleClipSubpages`.                                                                                                                                                                                                                      |
| `src/data/migrations.js`            | v5 → v6 migration backfills `idleMs: 0` on every existing cell across `sitesByDay`, `sitesByHour`, `subpagesByDay`, `subpagesByHour`.                                                                                                                                                                                 |


### Storage / tracking

Each cell in `sitesByDay`, `sitesByHour`, `subpagesByDay`, and `subpagesByHour` gains an `idleMs` field. Shape becomes `{ activeMs, audioMs, overlapMs, idleMs, visits }`. No new top-level storage keys. Existing cells are backfilled via the v5 → v6 migration.

The 60-second idle threshold is hardcoded in `background.js` for v1. Under the event-driven design, the threshold is purely a "how long Chrome waits before firing `idle`" knob:

- The threshold controls Chrome's detection latency, not the clip math.
- The first T seconds of every idle stretch are inherently credited to `activeMs` because Chrome can only confirm "idle for ≥ T" after T elapses. Once the event fires, all subsequent time credits correctly to `idleMs`.
- A future user-configurable threshold can use any value without the math bugs that a polling-based design would have.

## Deferred

- **Browser-specific idle via per-page content scripts.** Inject a tiny content script into every page that pings the background on `mousemove` / `keydown`. The background treats "no ping from any tab for ≥ threshold seconds" as browser-idle, separate from `chrome.idle`'s OS-wide signal. Closes the Twitch-while-working-in-IDE case (audio playing in Chrome while user types in another app). Trade-offs: content script on every page, gaps on `chrome://` pages and other restricted contexts, misses input to browser chrome itself (address bar, devtools).
- **Back-date `idleStartedAt` to claw back the head-loss.** On the `idle` event, set `idleStartedAt = Date.now() - T * 1000` instead of `Date.now()`. Chrome guarantees "idle for ≥ T" when firing the event, so this is exact when the event fires within the same flush window as the transition. Mostly-fine at T = 60 (event almost always fires before the next flush); edge cases at higher T may require rewriting already-committed storage cells.
- **User-configurable threshold.** Surface T as a setting once the dedicated settings page exists.
