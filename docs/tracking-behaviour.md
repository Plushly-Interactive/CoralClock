# Tracking behaviour

How BiteGuard counts time and visits across browser windows and tabs.

## What gets tracked

Three time metrics, per site, per hour:

- **Active time** — time the site is the active tab in at least one non-minimized window.
- **Audio time** — time at least one tab on the site is playing audio (and not muted).
- **Overlap time** — time the site is both active *and* playing audio.

Plus a **visit** counter per site.

A "site" is determined by the URL's hostname (via the public-suffix logic in `siteResolution.js`). All `reddit.com` paths resolve to a single site, so navigating between posts on Reddit does not switch sites.

## How a visit is counted

Visits are **session-based**: one visit is recorded each time a site goes from "not tracked at all" to "tracked".

A site is *tracked* whenever any of these is true:

- It is the active tab of any non-minimized window.
- A tab on that site is playing audio (and not muted).

A new visit is added the moment the site becomes tracked again *after* having been fully untracked. Switching tabs, opening additional windows on the same site, or starting/stopping audio while the site is already tracked does **not** add a visit.

### Example: same site across multiple windows

Open `reddit.com`, then Shift-click posts to open them in two more windows.

- Opening reddit → 1 visit.
- Each new window on reddit → 0 additional visits (reddit was already tracked).

### Example: same window, switching to another site and back

Open `reddit.com`, open a few post tabs in the same window, then open `facebook.com` in a new tab in that same window. After a few minutes, click back to a reddit tab.

- Opening reddit → 1 visit.
- Opening posts in background tabs → 0 visits.
- Opening facebook → 1 visit. Reddit becomes fully untracked at this moment.
- Clicking back to a reddit tab → 1 visit (new session).

Reddit ends up at 2 visits.

### Example: same as above, but a reddit tab is playing audio

Same scenario, except one of the reddit post tabs is playing audio in the background.

- Opening reddit → 1 visit.
- Opening posts → 0 visits.
- Opening facebook → 1 visit. Reddit is no longer the active tab anywhere, but the audible tab keeps it tracked.
- Clicking back to a reddit tab → 0 visits. The reddit session never ended.

Reddit stays at 1 visit. If the audio had stopped before you returned, reddit would have become fully untracked, and the return click would count as a new visit (back to 2).

## How time is counted

### Multiple windows on the same site

If reddit is the active tab in two or three windows at the same time, BiteGuard counts that as **one** stream of active time, not two or three. The metric is "is at least one window showing this site as active", not "how many windows are showing it".

### Multiple tabs playing audio on the same site

Same logic: audio time tracks "is at least one tab playing", not how many.

### Different sites in different windows simultaneously

Each site accrues time independently. If you have reddit active in window A and facebook active in window B at the same time, both will accrue active time for that period — even though you can only really look at one of them.

This is a deliberate design choice. BiteGuard does not track which window has OS-level focus. The reasoning:

- People working across multiple monitors often have several windows visible at once and genuinely use them in parallel.
- Treating only the OS-focused window as "active" would miss legitimate usage across monitors and would break whenever you focus another application (browser loses focus → no site is tracked at all).
- The trade-off is clear overcount in the rare case where you have two browser windows open on different sites and only look at one. We accept this in exchange for accurate multi-window/multi-monitor tracking.

If you want a site to stop counting, navigate that window away from it, close the tab, close or minimize the window.

### Minimized windows

Minimized windows don't count as active. There is up to roughly a one-minute lag between minimizing a window and the time stopping (BiteGuard reconciles state at approximately one-minute intervals).

## What stops time counting

For active time on a site:

- Switch the active tab in every window currently on that site to something else.
- Close every tab on the site.
- Minimize every window currently showing the site.

For audio time:

- Pause/stop audio in every tab on that site, or
- Mute every audible tab, or
- Close every audible tab.

