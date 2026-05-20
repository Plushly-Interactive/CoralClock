# Ideas / Backlog

Organized by feature area. Within each area, items are grouped by status: **Done**, **In design** (scoped in a feature doc), and **Backlog**.

## Enforcement (blocking rules)

In design — see [enforcement.md](../features/enforcement.md):

- Three blocking rule modes (active / audio / active+audio). Tracking accumulators (`activeMs`, `audioMs`, `overlapMs`) already exist; rule `mode` field and enforcement pipeline not yet built.
- Enforce rule uniqueness: no two rules with the same hostname + period.
- Validate the target format before saving a rule (reject invalid URLs/hostnames, ideally test reachability).
- Subdomain-scoped blocking rules (e.g. `*.reddit.com`) and path-scoped blocking rules (e.g. `reddit.com/r/foo`).

Backlog:

- Block url/page title keywords.

## Tracking

- Track side panels?

## Analytics & insights

- Analytics site page: daily/weekly average, time and visits.
- Browsing trends algorithms: audio vs active, user habits, improvement suggestions, etc.
- For browsing trends: if audio played on a website and other sites were browsed during the same time slots, assume the audio-playing website was not actively browsed but just an audio background/side window.
- Groups, labels, etc. (can serve as filters in analytics) — user-defined groups, separate from the existing dashboard group-by-eTLD+1 toggle.

## UX / UI

- Dynamically constrain the limit unit dropdown based on the selected period (e.g. period=hour → only minutes allowed).
- Add a "Tutorial": guided app tour that explains each UI button/user action step by step with a popup for each step — see [guided-tour.md](../features/guided-tour.md)
- Add a "week" level in the drills, compatible with keyboard navigation.

## Settings & configuration

- Settings: look for currently fixed, hardcoded values in code that could be user-defined in settings.

## i18n

- Implement 12h time format for the UIs
- Translate UI texts, add a language selector
- Translate guided tour, language should match the selected language