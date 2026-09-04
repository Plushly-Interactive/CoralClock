# Idle tracking

TL;DR: pause `activeMs` accrual while the user is idle (no keyboard/mouse input) or the screen is locked, and record the paused time as a separate `idleMs` counter. `activeMs` becomes "attended" time (focused + input); `idleMs` is "focused but no input"; the two are disjoint and sum to "presence". Audio time keeps counting in both states — a playing tab is real usage even if the user has stepped away.

**Scope limitation:** `chrome.idle` reports OS-wide input, not browser-specific input. If the user is actively working in another app (IDE, terminal, etc.) while a Chrome tab is focused in the background, the OS reports `active` and the focused Chrome tab keeps accruing `activeMs`. This feature catches "user away from the computer entirely" but does not catch "user working in another app with Chrome in the background." A content-script-based approach to close this gap was scoped and rejected — see [browser-specific-idle.md](../../appendix/idle-browser-specific-rejected.md) for the rationale

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


### Files and storage

Per-file changes and the storage read/write matrix: [appendix](../../appendix/idle-tracking-implementation.md).

## Deferred

- **Back-date `idleStartedAt` to claw back the head-loss.** On the `idle` event, set `idleStartedAt = Date.now() - T * 1000` instead of `Date.now()`. Chrome guarantees "idle for ≥ T" when firing the event, so this is exact when the event fires within the same flush window as the transition. Mostly-fine at T = 60 (event almost always fires before the next flush); edge cases at higher T may require rewriting already-committed storage cells.

## Rejected

- **Browser-specific idle via per-page content scripts.** See [browser-specific-idle.md](../../appendix/idle-browser-specific-rejected.md).
