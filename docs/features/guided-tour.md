# Guided feature tour

A user-triggered walkthrough that introduces BiteGuard's main
surfaces — dashboard, popup, site detail, path detail — using a
spotlight overlay and stepped tooltips. The tour runs automatically
the first time the extension is opened after install and can be
replayed at any time from a button in the dashboard header.

## User stories

- As a new user, I want a guided tour to start automatically the
first time I open BiteGuard so I understand what each surface does
without reading documentation.
- As a returning user, I want to replay the tour from a visible
button so I can refresh my memory or show someone else.
- As any user, I want to skip the tour at any point so I'm not
forced through it if I already know the product.
- As a new user with no browsing history yet, I want the dashboard
to show example data during the tour so I can see what each
chart will look like once I've used the extension for a while.

## Acceptance criteria

- On first install, the dashboard opens automatically with the
tour already running on its first step.
- A `Tour` button appears in the dashboard header; clicking it
starts the tour from step one.
- Once completed (or skipped), the dashboard button label
changes to `Replay tour` and the tour does not auto-start on
subsequent extension opens.
- Each step dims the page, highlights one element with a
spotlight cutout, and shows a tooltip with the step text plus
`Previous`, `Next`, and `Skip` controls.
- `Previous` is disabled on step one; `Next` on the final step
reads `Finish` and closes the tour.
- `Skip` closes the tour immediately and marks it completed.
- Pressing `Esc` is equivalent to `Skip`.
- The tour visits the dashboard, popup, site detail, path detail,
and storage-pruning surfaces, including a step that opens the
import/export modal on the dashboard. When a step targets a
different surface, the tour prompts the user to open it (popup)
or navigates there (site / path / storage-pruning) and resumes
on the destination.
- The import/export modal step opens the modal (sets `#io-modal-overlay`
visible), highlights its primary controls, and closes the modal
when the user advances past the modal steps.
- If the highlighted element is missing on a page (e.g. empty
state, no data yet), that step is skipped automatically.
- When the tour starts and storage holds no analytics data, the
tour renders a temporary in-memory mock dataset that covers
**every surface the tour visits**: the dashboard charts and
table, the site detail page for at least one mock site, the path
detail page for at least one mock subpage under that site, and
at least one insignificant entry on the storage-pruning page so
its scan results step has something to show. The mock data is
discarded when the tour closes; nothing is written to
`chrome.storage.local`.

## Scope

### Surfaces involved


| Surface    | Role in this feature                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| background | Detects first install via `chrome.runtime.onInstalled` and opens the dashboard with a `?tour=1` query param   |
| dashboard  | Hosts the `Tour` / `Replay tour` button; runs the dashboard portion of the tour and is the auto-start surface |
| popup      | Runs the popup portion of the tour when invoked from the dashboard step                                       |
| site page  | Runs the site-detail portion of the tour                                                                      |
| path page  | Runs the path-detail portion of the tour                                                                      |
| storage-pruning page | Runs the pruning-page portion of the tour                                                           |
| import/export modal | Sub-flow inside the dashboard tour: tour opens the modal, highlights its controls, then closes it     |


### Files likely to change


| File                                 | Change                                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/background/background.js`       | Add `chrome.runtime.onInstalled` listener that opens `dashboard.html?tour=1` on `reason === 'install'`                                                    |
| `src/shared/tour.js`                 | New shared module: step runner, spotlight overlay, tooltip rendering, keyboard handling, completion-flag read/write, cross-surface handoff via URL params |
| `src/shared/tour.css`                | New stylesheet: overlay, cutout, tooltip, button styles using existing theme tokens                                                                       |
| `src/pages/dashboard/dashboard.html` | Add `<button id="tour-btn">` to `#header-right`; link `tour.css`; include `tour.js`                                                                       |
| `src/pages/dashboard/dashboard.js`   | Define dashboard step list; wire `#tour-btn`; auto-start when URL contains `?tour=1`                                                                      |
| `src/pages/popup/popup.html`         | Link `tour.css`; include `tour.js`                                                                                                                        |
| `src/pages/popup/popup.js`           | Define popup step list; auto-start when storage flag indicates an in-progress tour returning to the popup                                                 |
| `src/pages/site/site.html`           | Link `tour.css`; include `tour.js`                                                                                                                        |
| `src/pages/site/site.js`             | Define site-page step list; auto-start from in-progress tour                                                                                              |
| `src/pages/path/path.html`           | Link `tour.css`; include `tour.js`                                                                                                                        |
| `src/pages/path/path.js`             | Define path-page step list; auto-start from in-progress tour                                                                                              |
| `src/pages/storage-pruning/storage-pruning.html` | Link `tour.css`; include `tour.js`                                                                                                             |
| `src/pages/storage-pruning/storage-pruning.js`   | Define storage-pruning step list; auto-start from in-progress tour                                                                             |
| `src/pages/dashboard/dashboard.js`   | Within dashboard step list, add import/export modal sub-steps that programmatically open `#io-modal-overlay`, highlight its controls, then close it       |
| `src/shared/tour.js`                 | Expose a `tourMockData` mode flag and a fixed sample dataset covering `analyticsByDay`, `analyticsByHour`, `subpagesByDay`, and `subpagesByHour` shapes. The fixture is sized to exercise every surface: top-sites chart, hourly chart, site table, at least one drillable site with subpages, and at least one insignificant entry for the pruning scan. |
| `src/pages/dashboard/dashboard.js`, `src/pages/site/site.js`, `src/pages/path/path.js`, `src/pages/storage-pruning/storage-pruning.js` | When `tourMockData` mode is active, render charts, tables, and scan results from the mock dataset instead of the message-API responses. No new storage writes. |


### Storage / tracking


| Key    | Shape                                                                                                           | Read by                      | Written by                   | Notes                                                                                                                                                       |
| ------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tour` | `{ completed: boolean, completedAt: string | null, inProgress: { surface: string, stepIndex: number } | null }` | dashboard, popup, site, path | dashboard, popup, site, path | new key. `completed` gates the auto-start and the button label. `inProgress` carries the cross-surface handoff so the tour resumes on the destination page. |


## Edge cases

- **First install with no data**: the tour activates `tourMockData`
mode and renders all dashboard widgets from a fabricated in-memory
sample so steps about charts and tables are meaningful. Mock data
is never written to `chrome.storage.local` and is dropped when the
tour closes.
- **Mixed state — some real data, no mock needed**: if even one
day of real analytics exists, the tour uses real data; mock mode
stays off. Mock and real data are never mixed.
- **Schema changes**: the mock fixture lives in `tour.js` and
mirrors the real analytics schema. Any change to the shape of
`analyticsByDay` / `analyticsByHour` / `subpagesByDay` /
`subpagesByHour` requires updating the fixture, the same way it
requires updating migrations.
- **User reloads mid-tour**: `inProgress` lets the current page
resume at the stored step; if the page no longer matches the
recorded surface, the tour aborts cleanly and `inProgress` is
cleared.
- **User navigates away mid-tour using a non-tour link**: the next
page does not auto-start; the user must click `Replay tour` to
restart. `inProgress` is cleared on tour close.
- **Popup closes during a popup-step** (user clicks outside the
popup): the next popup open resumes from the same step while
`inProgress` is set.
- **Storage migration / fresh install after uninstall**: missing
`tour` key is treated as `{ completed: false }` — auto-start fires
on the next dashboard open following a fresh `onInstalled` event.

## Out of scope (v1)

- Translations / i18n of tour copy (English only).
- Per-step analytics (which steps users skip / complete).
- Animated transitions between steps beyond a basic fade.
- A "Don't show again" checkbox separate from `Skip` (Skip already
marks completed).

