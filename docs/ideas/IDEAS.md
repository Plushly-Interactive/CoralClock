# Ideas / Backlog

Organized by feature area. Within each area, items are grouped by status: **Done**, **In design** (scoped in a feature doc), and **Backlog**.

## Tracking

- Track side panels?

## Analytics & insights

- Analytics site page: daily/weekly average, time and visits.
- Browsing trends algorithms: audio vs active, user habits, improvement suggestions, etc.
- For browsing trends: if audio played on a website and other sites were browsed during the same time slots, assume the audio-playing website was not actively browsed but just an audio background/side window.
- Groups, labels, etc. (can serve as filters in analytics) — user-defined groups, separate from the existing dashboard group-by-eTLD+1 toggle.

## UX / UI

- Apply the `navButton` helper (`src/shared/utils.js`) to all navigation `<button class="btn">`s so they support middle-click / ctrl-cmd-click → open in a new tab (the affordance lost by using `<button>` instead of `<a>`). Currently wired only on the dashboard `#rules-btn` and the blocked page `#manage-link`; audit other header/nav buttons (e.g. popup `#dashboard-btn`, `#manage-btn`).
- Dynamically constrain the limit unit dropdown based on the selected period (e.g. period=hour → only minutes allowed).
- Add a "Tutorial": guided app tour that explains each UI button/user action step by step with a popup for each step — see [guided-tour.md](../features/guided-tour.md)
- Add a "week" level in the drills, compatible with keyboard navigation.

## Quotes

- **Quote philosophy page** — an in-app page (e.g. accessible from the blocked page or options) that explains the values behind the quote system to users: what makes a quote eligible, why authors are vetted, the mascot characters, and the curation philosophy. Based on the curation doc, keeping only end-user-relevant information (no sourcing rules, no JS field specs).

## Enforcement / Blocked page

Stats currently shown: **Spent today · Limit · Visits today · Unlocks in**

- **Blocked today** — how many times the block triggered on this rule today. Slightly sobering, shows the pattern of coming back repeatedly.
- **"↑ 2× usual" comparison sub-value** — a small secondary value beneath "Spent today" showing how today compares to the user's average. More insightful on spent time than on block count: "spent 2× your usual" reveals whether today is an outlier, whereas "blocked 2× more" is just a consequence of the limit. Worth revisiting once enough history exists to compute a meaningful average.
- **Streak** — e.g. "4 / 7 days under limit this week". Motivational, pattern-oriented. Requires per-day limit compliance history.

## Settings & configuration

- Settings: look for currently fixed, hardcoded values in code that could be user-defined in settings.

## i18n

- Implement 12h time format for the UIs
- Translate UI texts, add a language selector
- Translate guided tour, language should match the selected language