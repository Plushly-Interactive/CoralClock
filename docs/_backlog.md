# Ideas / Backlog

---

## Analytics & insights

- Browsing trends algorithms: audio vs active, user habits, improvement suggestions, etc. For browsing trends algorithms: if audio played on a website and other sites were browsed during the same time slots, assume the audio-playing website was not actively browsed but just an audio background/side window.
- Groups, labels, etc. (can serve as filters in analytics) — user-defined groups, separate from the existing dashboard name groups / subdomains merging.

# Drills

- Add a "week" level in the drills, compatible with keyboard navigation.

## Quotes

- **Quote philosophy page** — an in-app page (e.g. accessible from the blocked page or options) that explains the values behind the quote system to users: what makes a quote eligible, why authors are vetted, the mascot characters, and the curation philosophy. Based on the curation doc, keeping only end-user-relevant information (no sourcing rules, no JS field specs).

## Settings & configuration

- Settings: look for fixed, hardcoded values across the whole codebase that could be user-defined in settings.

## i18n

- Implement 12h time format for the UIs
- Translate UI texts, add a language selector
- Translate guided tour, language should match the selected language
- Translate quotes, or curate new quotes in new languages

---

## Out of scope (v1) / Future

### Enforcement / Rules

- **User-supplied regex matching** — users can't enter arbitrary regex patterns; only the three structural scopes (host/subdomain/path) are offered. "Regex" tab in the add card is a stub ("coming soon").
- **Keyword / page-title blocking** — rules match by host/subdomain/path only. Blocking by URL or page-title keyword is a future idea. "Keyword" tab in the add card is a stub ("coming soon").
- **Rolling-7-day window** — `week` is a calendar week (Monday-start, resets at boundary), not a rolling 7-day window. Calendar semantics are intentional.
- **Week-start user setting** — Monday is hardcoded; a user setting for Monday vs Sunday is not planned.
- **Streak** — e.g. "4 / 7 days under limit this week". Motivational, pattern-oriented. Requires per-day limit compliance history.

## Enforcement / Blocked page

- **Blocked today** — how many times the block triggered on this rule today. Slightly sobering, shows the pattern of coming back repeatedly.
- **"↑ 2× usual" comparison sub-value** — a small secondary value beneath "Spent today" showing how today compares to the user's average. More insightful on spent time than on block count: "spent 2× your usual" reveals whether today is an outlier, whereas "blocked 2× more" is just a consequence of the limit. Worth revisiting once enough history exists to compute a meaningful average.

### Tour

- Step-order audit (open question: sequence has rough edges; dashboard "Time range" step 1 comes before seeing charts, modal + popup detour breaks dashboard flow, etc.).

## Tracking

- Track side panels?
- **Subpage opt-out toggle** — per-site "Track subpages: on/off" toggle on `site.html`. Default = on.
- **Per-site path patterns** — user-defined rules like `reddit.com` → keep `/r/<sub>` only, `youtube.com` → keep `?v=<id>` only. Could replace or complement raw path storage.
- **Purge non-human-readable paths** — regular cleanup of paths dominated by random characters / hashes / long IDs to reduce storage noise.
- **Switch to hour-only-for-today** — if `subpagesByHour` grows too large, keep `subpagesByDay` indefinitely; drop hour buckets older than X days.

### Storage & pruning

- Date-based retention pruning (delete by age).
- Storage-size monitoring / alerts when approaching the 10 MB quota.

### Site page stats

- **% of browsing** — this site's active time as a share of all sites combined for the selected range.
- **First seen** — earliest day in `byDayCache` that has data for this site.
- **Streak** — longest run of consecutive days with any activity for this site.