# Quick add rule for a site

A one-click path from a site's analytics page (and possibly other surfaces) to
creating a blocking rule for that site, with the rules-page form pre-filled with
the site's host. Removes the friction of opening the rules page and retyping a
hostname the app already knows.

## User stories

- As a user looking at a site's stats and realizing I spend too long there, I
  want to add a limit for it without retyping the hostname, so acting on what I
  see is immediate.
- As a user, I want the rules page to open with the host already filled in (and
  scope/limit at sensible defaults) so I only choose the limit and save.

## Acceptance criteria

- [ ] The site analytics page (`src/pages/site/site.html`) has a button that opens the rules page pre-filled with that site's host.
- [ ] Opening the rules page with a prefill parameter fills the target field with the host and runs the live preview as if the user had typed it (scope/limit/period/mode at their defaults).
- [ ] The prefill never bypasses validation or dedupe: if an enabled rule already covers the host at the default scope+period, the prefilled preview shows the existing-rule notice and Add stays disabled, exactly as if typed.
- [ ] The button is absent (or disabled) on the merged/multi-site view, where there's no single host to target.
- [ ] Following the button is a normal navigation — middle-click / ctrl-click opens the rules page in a new tab (uses the shared `navButton` helper).

## Scope

### Surfaces involved

| Surface | Role in this feature |
|---|---|
| site page | New "Limit this site" button that links to the rules page with the host as a prefill param. |
| rules page | Reads the prefill param on load, fills `#form-target`, and runs the existing preview/validation path. |

### Files likely to change

| File | Change |
|---|---|
| `src/pages/site/site.html` | Add the button to the header (a `#header-right` slot, currently absent) or near the site title. |
| `src/pages/site/site.js` | Wire the button via `navButton` to `../rules/rules.html?target=<siteId>`; hide/disable it on the merged view (`isMerged`). |
| `src/pages/rules/rules.js` | On load, read `?target=`; if present, set `#form-target.value` and call `refreshPreview()` so the form behaves as if typed. |

### Storage / tracking

No new storage. The prefill is passed via a URL query param, not persisted.

## Open questions

- **Button placement** — three options, pick during design:
  - **Site page header-right** (mirrors the dashboard's "Rules" button position). Consistent with existing header-button placement.
  - **Next to the site title** (`#site-title`), as a small inline action. More contextual but adds header layout work.
  - **In the Overview stats card**, as a call-to-action under the numbers. Most contextual to "you spend too long here" but least discoverable.
- **Prefill param name & shape** — `?target=<host>` is simplest. Should it also accept a scope hint (e.g. always `subdomain` for a "whole site" quick-add) or always land on the form's default scope and let the user choose?
- **Other entry points** — the same prefill mechanism could power a popup "limit the current tab's site" button (the old popup add-form used to read the active tab's hostname; that affordance was dropped in the popup rework). Worth folding in here or keeping separate?
- **Button label** — "Limit this site" vs "Add a rule" vs "Block this site". "Limit" matches the app's framing (time limits, not hard blocks).
