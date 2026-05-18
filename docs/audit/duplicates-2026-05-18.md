# Duplicates audit — 2026-05-18

Findings from `/my-check-duplicates` run on `feature/subdomain-tracking` at commit `a9af769`. Read-only review — nothing fixed yet.

15 findings across 5 categories. Numbered for reference (e.g. "fix #3 and #7").

## CSS — identical property sets

1. `.seg-btn.active` and `.drill-toggle-btn.active` have the same 3 declarations — [site.css:115-119](../../src/pages/site/site.css#L115-L119) and [site.css:400-404](../../src/pages/site/site.css#L400-L404). Both apply `background: var(--color-accent); color: var(--color-button-text); font-weight: 600;`. Suggest: a shared `.is-active` class, or refactor `.drill-toggle-btn` to use `.seg-btn`.

## JS — repeated DOM lookups

2. `querySelector('#form-limit')` called twice in popup.js — [popup.js:28](../../src/pages/popup/popup.js#L28) and [popup.js:47](../../src/pages/popup/popup.js#L47). Cache at the top of the file like the other `#form-*` elements.

## JS — repeated string literals

3. `'invalidateAnalyticsCache'` — 5 occurrences: [importData.js:215](../../src/data/importData.js#L215), [importData.js:294](../../src/data/importData.js#L294), [seedTestData.js:96](../../src/data/seedTestData.js#L96), [storage-pruning.js:335](../../src/pages/storage-pruning/storage-pruning.js#L335), [background.js:73](../../src/background/background.js#L73). Suggest: export a message-type constant.

4. `'importcomplete'` — 3 occurrences: [importData.js:217, :296](../../src/data/importData.js#L217), [dashboard.js:233](../../src/pages/dashboard/dashboard.js#L233). Event name; suggest constant.

5. `'getAnalyticsByDay'` — 3 occurrences: [background.js:49](../../src/background/background.js#L49), [dashboard.js:221](../../src/pages/dashboard/dashboard.js#L221), [site.js:199](../../src/pages/site/site.js#L199). Suggest constant alongside #3.

6. `'getSubpagesByDay'` — 3 occurrences: [background.js:65](../../src/background/background.js#L65), [path.js:264](../../src/pages/path/path.js#L264), [site.js:200](../../src/pages/site/site.js#L200). Same suggestion.

7. `'getAvgPerClockHour'` — 3 occurrences: [background.js:57](../../src/background/background.js#L57), [dashboard.js:39](../../src/pages/dashboard/dashboard.js#L39), [site.js:152, :183](../../src/pages/site/site.js#L152). Same suggestion.

8. `'hideBrief'` (sessionStorage key) — 6 occurrences across [dashboard.js](../../src/pages/dashboard/dashboard.js) and [site.js](../../src/pages/site/site.js). Suggest: a constant per file at minimum, or a small shared `prefs.js` module.

9. `'mergeMode'`, `'groupMode'` — 4 occurrences each within dashboard.js (lines 46, 48, 184, 190, 209, 211). Per-file constants would catch typos at change time.

10. `'subpagesStripParams'` — 3 occurrences in [site.js:113, :118, :193](../../src/pages/site/site.js#L113). Same suggestion.

## HTML — repeated markup blocks

11. Time-chart block duplicated between site.html and path.html — [site.html:26-34](../../src/pages/site/site.html#L26-L34) and [path.html:36-44](../../src/pages/path/path.html#L36-L44). 9 identical lines. Candidate for a render helper or `<template>`.

12. Visits-chart block duplicated between site.html and path.html — [site.html:42-47](../../src/pages/site/site.html#L42-L47) and [path.html:51-56](../../src/pages/path/path.html#L51-L56). 6 identical lines.

13. Hourly-chart block duplicated between site.html and path.html — [site.html:74-79](../../src/pages/site/site.html#L74-L79) and [path.html:58-63](../../src/pages/path/path.html#L58-L63). 6 identical lines.

14. Stats-container block nearly duplicated — [site.html:36-40](../../src/pages/site/site.html#L36-L40) and [path.html:46-49](../../src/pages/path/path.html#L46-L49). Differs only by an extra `#peak-tooltip` line in site. 4 identical lines (below the 5-line threshold strictly, mentioned as adjacent context to #11–#13).

## JS — partial function-body overlap (soft)

15. `renderStats` partial duplication — [path.js:287-303](../../src/pages/path/path.js#L287-L303) is roughly a subset of [site.js:268-314](../../src/pages/site/site.js#L268-L314): same `totalMs/totalVisits/activeDays/avgMs` computation and the same `#stat-total-time`, `#stat-daily-avg`, `#stat-visits`, `#overview-subheading` updates. Not literal duplicates (site adds today/peak/avg-session). Soft candidate: extract the shared "base stats" piece to `src/shared/`.

## Summary

The biggest fish are the HTML chart-block duplication (#11–#13) and the cross-file message-type literals (#3–#7); both are real but each requires picking a refactor pattern (template helper / shared message-types module) that isn't drop-in. The CSS active-state and DOM-lookup ones (#1, #2) are small and trivial to act on.
