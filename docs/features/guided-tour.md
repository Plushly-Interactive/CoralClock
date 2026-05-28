# Guided feature tour

A user-triggered walkthrough that introduces BiteGuard's main
surfaces — dashboard, popup, site detail, path detail, storage
pruning — using a spotlight overlay and stepped tooltips. The tour
runs automatically the first time the extension is opened after
install and can be replayed at any time from a `?` button in the
dashboard header.

## User stories

- As a new user, I want a guided tour to start automatically the
first time I open BiteGuard so I understand what each surface does
without reading documentation.
- As a returning user, I want to replay the tour from a visible
button so I can refresh my memory or show someone else.
- As any user, I want to interrupt the tour at any point so I'm not
forced through it if I already know the product.
- As a new user with no browsing history yet, I want the dashboard
to show example data during the tour so I can see what each
chart will look like once I've used the extension for a while.

## Acceptance criteria

- On first install (and on extension reload during development),
the dashboard opens automatically in a new tab with the tour
already running on its first step.
- A `?` icon button (`square-btn` class) appears in the dashboard
header; clicking it starts the tour from step one. The button
label does not change after completion; the icon always reads `?`.
- Each step dims the page, highlights one element with a spotlight
cutout, and shows a tooltip with the step text plus `Previous` and
`Next` controls. A close-tour `✕` icon button sits at the top-left
of the overlay.
- `Previous` is disabled on step one; `Next` on the final step
reads `Finish` and closes the tour, marking it completed.
- Clicking the `✕` close button shows a centered confirmation
dialog ("Are you sure you want to interrupt the guided tour?").
Confirming closes the tour, marks it completed, clears mock-data
state, and the per-surface `onClose` re-renders against real
storage so no mock-data residue remains on screen.
- Keyboard navigation: `ArrowRight` / `Enter` advance, `ArrowLeft`
goes back. Keyboard advance is suppressed on steps that require a
specific user action (handoff steps and steps with
`advanceOn: 'click'`). Keys are also ignored when focus is in an
`input`, `textarea`, or `select`.
- Pressing `Esc` does **not** close the tour.
- The tour visits the dashboard, popup, site detail, path detail,
and storage-pruning surfaces, including an import/export modal
sub-flow on the dashboard. When a step targets a different
surface, the tour relies on a natural user action (clicking the
toolbar icon, a table row, the Storage pruning button) and
resumes on the destination via stored `inProgress`.
- The import/export modal sub-flow opens the modal via `openModal`
on the first modal step's `onEnter`, highlights its primary
sections (`#io-section-bg`, `#io-section-tt`), and closes the
modal when the user advances past the last modal step (the engine
fires a `tour:modal-step-leave` event listened to by
`importData.js`). While `body.tour-modal-step` is set, the
modal's own dismiss paths (`✕` button, backdrop click, `Esc`)
are blocked, and non-target `.io-section` siblings are dimmed and
made unclickable so the user can only interact with the
highlighted section.
- The site and path tours include a drill sub-flow: a "Drill into
a day" step (`advanceOn: 'click'` on `#time-chart-container`)
opens drill mode, three drill-internal steps describe the daily
detail / navigation controls / back button, and a final
`advanceOn: 'click'` step on `#nav-close` exits drill mode and
advances past it. While `body.tour-drill-step` is set, drill's
own keyboard shortcuts (arrow keys, space, Esc) are muted so the
tour controls the flow.
- If the highlighted element is missing on a page (e.g. empty
state, no data yet), that step is skipped automatically, in the
direction of travel (forward on Next, backward on Previous).
- When the tour starts and storage holds no tracking data, the
tour activates mock-data mode and renders an in-memory fixture
covering **every surface the tour visits**: the dashboard charts
and table, the site detail page for each mock site (every site
has at least one subpage), the path detail page for any
subpage under any site, and at least one insignificant entry on
the storage-pruning page so its scan-results step has something
to show. The fixture is never written to `chrome.storage.local`;
the only storage write is the boolean `useMockData` flag inside
the `tour` key, which is cleared on tour completion.
- During the storage-pruning steps the tour clicks Scan
naturally (`advanceOn: 'click'`) so real scan results render from
the mock fixture. The Delete-selected step is informational only
— even if the user clicks Delete in mock mode, `runDelete` is
guarded against writing to storage.

## Scope

### Surfaces involved


| Surface              | Role in this feature                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| background           | Detects install / update via `chrome.runtime.onInstalled` and opens the dashboard with a `?tour=1` query param                        |
| dashboard            | Hosts the `?` button; runs the dashboard portion of the tour, is the auto-start surface, and coordinates the focus-existing-tab logic |
| popup                | Runs the popup portion of the tour only when `inProgress.surface === 'popup'`; otherwise stays silent                                 |
| site page            | Runs the site-detail portion of the tour including the drill sub-flow                                                                 |
| path page            | Runs the path-detail portion of the tour including the drill sub-flow                                                                 |
| storage-pruning page | Runs the pruning-page portion of the tour                                                                                             |
| import/export modal  | Sub-flow inside the dashboard tour: tour opens the modal, highlights its controls, then closes it via a custom DOM event              |


### Files likely to change


| File                                             | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/background/background.js`                   | Add `chrome.runtime.onInstalled` listener that opens `dashboard.html?tour=1` on `reason === 'install' || reason === 'update'`                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/shared/tour.js`                             | New shared module: step runner, spotlight overlay, clip-path dim hole, tooltip rendering, keyboard handling, completion-flag read/write serialized through a promise chain, cross-surface handoff via `inProgress` storage, close-tour button + confirm dialog                                                                                                                                                                                                                                                            |
| `src/shared/tour.css`                            | New stylesheet: overlay, spotlight, tooltip, arrow, close button, confirm dialog. Also `body.tour-modal-step` / `body.tour-drill-step` rules that gate the modal and drill UIs                                                                                                                                                                                                                                                                                                                                            |
| `src/shared/tourMockData.js`                     | New module: deterministic in-memory fixture, `fetchTrackingData(msg)` drop-in for `chrome.runtime.sendMessage` that returns fixture data when `useMockData` is set, `mockScanResults` for the storage-pruning scan, `clearMockModeCache()`                                                                                                                                                                                                                                                                                 |
| `src/data/importData.js`                         | Export `openModal` / `closeModal`. Gate the modal's existing dismiss paths (`✕`, backdrop, `Esc`) on `body.tour-modal-step`. Listen for the `tour:modal-step-leave` custom event and call `closeModal`                                                                                                                                                                                                                                                                                                                    |
| `src/shared/drill.js`                            | Mute the keydown handler entirely while `body.tour-drill-step` is set                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/pages/dashboard/dashboard.html`             | Add `<button id="tour-btn" class="square-btn" title="Take the tour">?</button>` to `#header-right`; link `tour.css`                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/pages/dashboard/dashboard.js`               | Define dashboard step list (welcome, range, top sites, table, import/export modal sub-flow, popup handoff, see site details handoff, open storage pruning handoff); wire `#tour-btn`; auto-start on `?tour=1`; resume on `inProgress.surface === 'dashboard'`; resume on `visibilitychange` and on `tourAdvanceRequest` storage change. Use `fetchTrackingData` instead of direct `sendMessage`; `maybeEnableMockMode` flips the flag if `sitesByDay` is empty; on replay, re-runs `loadAndRender` after enabling mock |
| `src/pages/popup/popup.html`                     | Link `tour.css`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/pages/popup/popup.js`                       | Define popup step list (brand, add a rule, back to dashboard handoff); only call `autoStartIfMatches` when `inProgress.surface === 'popup'`; `#dashboard-btn` handler closes the popup, focuses an existing dashboard tab during tour, and writes `tourAdvanceRequest` to nudge the dashboard                                                                                                                                                                                                                             |
| `src/pages/site/site.html`                       | Link `tour.css`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/pages/site/site.js`                         | Define site-page step list including the drill sub-flow; `ensureDrillOpen` opens drill at the latest day in `byDayCache` when entering a drill step; `loadAndRenderPromise.then(autoStartIfMatches)` so the data is loaded before resume. `onClose` re-renders against real storage on interrupt                                                                                                                                                                                                                          |
| `src/pages/path/path.html`                       | Link `tour.css`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/pages/path/path.js`                         | Define path-page step list including the drill sub-flow; same `ensureDrillOpen` + `loadAndRenderPromise.then(autoStartIfMatches)` + interrupt cleanup pattern as site                                                                                                                                                                                                                                                                                                                                                     |
| `src/pages/storage-pruning/storage-pruning.html` | Link `tour.css`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/pages/storage-pruning/storage-pruning.js`   | Define storage-pruning step list; `ensureScanRan` on Review and Delete steps; `runScan` branches to `mockScanResults` when mock mode is active; `runDelete` short-circuits in mock mode. `onClose` clears results on interrupt or navigates to dashboard on Finish                                                                                                                                                                                                                                                        |


### Storage / tracking


| Key                  | Shape                                                                                                                                 | Read by                                                          | Written by                      | Notes                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tour`               | `{ completed: boolean, completedAt: string | null, inProgress: { surface: string, stepIndex: number } | null, useMockData: boolean }` | dashboard, popup, site, path, storage-pruning, `tourMockData.js` | all five surfaces via `tour.js` | `completed` gates the auto-start; `inProgress` carries cross-surface handoff so the tour resumes on the destination page; `useMockData` enables fixture-driven rendering. All writes are serialized through a promise chain in `writeTourState` to avoid lost updates. |
| `tourAdvanceRequest` | `number` (timestamp)                                                                                                                  | dashboard                                                        | popup                           | Written by the popup's `#dashboard-btn` handler just before focusing the existing dashboard tab; the dashboard listens for changes to this key and either jumps the running tour to the wanted step or starts a new tour.                                              |


## Edge cases

- **First install with no data**: `maybeEnableMockMode()` checks
`sitesByDay`; if empty, sets `useMockData: true`. All four
data-driven surfaces (dashboard, site, path, storage-pruning)
fall through to fixture data via `fetchTrackingData` /
`mockScanResults`.
- **Mixed state — some real data, no mock needed**: if any
`sitesByDay` entry exists, mock mode stays off. Real data is
used. Mock and real are never mixed.
- **Schema changes**: the mock fixture in `tourMockData.js` mirrors
the real tracking data schema. Any change to the shape of
`sitesByDay` / `sitesByHour` / `subpagesByDay` /
`subpagesByHour` requires updating the fixture, the same way it
requires updating migrations.
- **User reloads mid-tour on a regular step**: `autoStartIfMatches`
sees `inProgress.surface === this surface` and resumes at the
saved step index.
- **User reloads mid-tour on a handoff step**: the engine wrote
`inProgress` pointing at the *handoff target*, not the current
surface. `autoStartIfMatches`'s fallback finds the step in this
surface's step list whose `handoff.nextSurface` matches the
pending surface and resumes there. Dashboard uses the same
pattern in its own resume logic.
- **User reloads on a drill step**: `ensureDrillOpen` in the
step's `onEnter` picks the latest day from `byDayCache` and calls
`enterDrill` if drill mode isn't already open. Site and path
defer `autoStartIfMatches` until `loadAndRenderPromise` resolves
so `byDayCache` is populated.
- **User reloads on a modal step**: each modal step's `onEnter`
calls `openModal`, so the modal reopens on resume.
- **User reloads on the storage-pruning Review or Delete step**:
each step's `onEnter` calls `ensureScanRan` which runs the scan
if results aren't yet rendered.
- **Popup closes during a popup-step** (user clicks outside the
popup): the next popup open resumes from the same step while
`inProgress.surface === 'popup'`. If the popup is opened on a
non-popup step, the popup module short-circuits before invoking
`autoStartIfMatches` so no stale tour appears.
- **Dashboard tab still open when popup hands off**: the popup
writes `tourAdvanceRequest`. The dashboard storage listener picks
this up, finds the wanted step, and either calls
`currentTourHandle.goto(N)` if the tour is still running locally
or `startDashboardTour(N)` otherwise. `visibilitychange` is a
fallback for the case where the user manually focuses the tab.
- **Concurrent storage writes** (e.g. `?tour=1` IIFE and the tour
starter IIFE both writing `useMockData`): `writeTourState` is
serialized through a promise chain, so reads always see the most
recent write before merging.
- **Storage migration / fresh install after uninstall**: missing
`tour` key is treated as `{ completed: false, useMockData: false, inProgress: null }` — auto-start fires on the next dashboard
open following a fresh `onInstalled` event.

## Adding new steps in a future version

When a feature ships and you want returning users to see new tour steps
automatically on extension reload, follow these steps:

1. **Bump `TOUR_VERSION`** in `src/shared/tour.js`.
2. **Mark each new step** with `newInVersion: TOUR_VERSION`:
  ```js
   {
     selector: '#my-new-element',
     title: 'New feature',
     body: 'Here is what it does.',
     newInVersion: 3,   // ← set to the new TOUR_VERSION value
   }
  ```
   Insert the marked steps *before* any existing handoff step on the
   same surface so that replay (full tour) includes them in order.
3. **Set `TOUR_UPDATE_ENTRY*`* in `src/background/background.js` to
  the HTML path of the first surface that has new steps, e.g.:
   On extension reload `onInstalled` opens this page automatically for
   users whose `completedVersion` is below the new `TOUR_VERSION`.
4. **Chain surfaces** (optional). If new steps span more than one
  navigable surface (rules → dashboard, dashboard → storage-pruning),
   pass `nextUpdateSurface` to `autoStartIfMatches` on the earlier
   surface so the update tour hands off automatically:
   `autoStartIfMatches` injects a "Continue →" handoff on the last new
   step and opens the next surface when the user clicks it.

**What happens automatically** (no extra work needed):

- `autoStartIfMatches` finds the first step where `newInVersion > completedVersion` and slices from there, so you never hardcode an
index.
- The dashboard does the same scan via `dashboardNewStepRange`, so
update-tour resume works correctly after a page reload mid-tour.
- Surfaces that cannot be opened directly (site, path, popup) cannot  
be the `TOUR_UPDATE_ENTRY` or a `nextUpdateSurface` target, but new  
steps added there are picked up automatically during full tour replay.

## Open questions

- **Step-order audit**: the current sequence works but has some
rough edges flagged in an internal audit:
  - Dashboard step 1 "Time range" comes before the user has seen
  any chart; consider moving it later.
  - The dashboard tour bounces back to the table (step 8 "See
  site details") after the modal + popup detour; consider
  grouping all on-dashboard steps before the popup handoff.
  - Site/path steps 1 ("Time spent") and 5 ("Drill into a day")
  both highlight `#time-chart-container`; consider merging or
  reordering so the drill detour sits next to the time-chart
  step rather than at the end.
  - "Back to overview" wording is action-oriented while
  surrounding drill steps ("Daily detail", "Navigate and switch
  metric") are descriptive nouns; consistency could be improved.
- `**onInstalled` trigger scope**: the listener fires on
`'install'` AND `'update'`, which means returning users see a
new tab every time the extension reloads (useful during
development, possibly annoying in production). Decide whether
to narrow to `'install'` only before shipping.

