# Ideas / Backlog

---

## Analytics & insights

- Browsing trends algorithms: audio vs active, user habits, improvement suggestions, etc. For browsing trends algorithms: if audio played on a website and other sites were browsed during the same time slots, assume the audio-playing website was not actively browsed but just an audio background/side window.
- Groups, labels, etc. (can serve as filters of tracking data) — user-defined groups, separate from the existing dashboard name groups / subdomains merging.
- **Today vs. same-weekday comparison** — compare today against the average of the last N same weekdays (Mondays vs Mondays), not a flat all-days average. Browsing is weekly-cyclical, so a same-weekday baseline is a more honest "is today unusual" signal.
- **Goal / target line on charts** — overlay a user-set total budget (e.g. "< X min/day across all sites") on the dashboard charts, with progress coloring. A global self-imposed budget that complements the per-site enforcement rules.
- **CSV export** — only JSON import/export exists today. Add a per-day-per-site CSV export so the data can be opened in a spreadsheet. Low effort given the existing data shape.

# Drills

- Add a "week" level in the drills, compatible with keyboard navigation.

## Popup

- **Live "spent vs limit" progress bars** — the popup lists enabled rules read-only but shows no current usage. Add a per-rule mini progress bar (e.g. "8m / 10m this hour"), reusing the tracking data the background already holds in memory, so the popup is glanceable and actionable.
- **Current-tab quick stats** — show time spent today on the active tab's site, plus a one-click "Limit this site" without leaving the popup.

## Notifications & awareness

- **Browser notifications** — use `chrome.notifications` for "approaching limit" and "blocked" events. There is no notification surface today; everything is passive until a hard block.
- **Toolbar badge** — show today's total active time, or the closest-to-limit rule's percentage, on the extension icon badge for always-visible ambient feedback.

## Onboarding

- **Empty-state guidance on first install** — beyond the guided tour, the dashboard and rules pages with zero data could show a "here's how to add your first limit" call-to-action.

## Quotes

- **Quote philosophy page** — an in-app page (e.g. accessible from the blocked page or options) that explains the values behind the quote system to users: what makes a quote eligible, why authors are vetted, the mascot characters, and the curation philosophy. Based on the curation doc, keeping only end-user-relevant information (no sourcing rules, no JS field specs).

## Settings & configuration

- Settings: look for fixed, hardcoded values across the whole codebase that could be user-defined in settings.
- **Incognito / private-window handling policy** — an explicit decision and setting for whether private windows are tracked at all (likely excluded by default). Not currently addressed in the tracking docs.
- **Pause tracking** — a temporary "pause for 1h / until tomorrow" toggle for legitimate non-leisure browsing (e.g. work research). Tracking is always-on today with no off switch.

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
- **Schedule-aware rules** — limits that only apply during chosen windows (work hours, weekdays) or are stricter at certain times. Every rule is 24/7 today. Distinct from `period` (hour/day/week), which sizes the budget rather than scheduling when it applies.
- **Allowance / whitelist carve-outs under a blocked scope** — e.g. block `*.reddit.com` but always allow `reddit.com/r/programming`. Scopes only stack as more blocks today, never as exceptions.
- **Soft "nudge" mode (warn, don't block)** — a rule that shows a toast/badge at e.g. 80% of the limit instead of (or before) hard-blocking. Enforcement is all-or-nothing today.

## Enforcement / Blocked page

- **Blocked today** — how many times the block triggered on this rule today. Slightly sobering, shows the pattern of coming back repeatedly.
- **"↑ 2× usual" comparison sub-value** — a small secondary value beneath "Spent today" showing how today compares to the user's average. More insightful on spent time than on block count: "spent 2× your usual" reveals whether today is an outlier, whereas "blocked 2× more" is just a consequence of the limit. Worth revisiting once enough history exists to compute a meaningful average.
- **Grace period / "5 more minutes" snooze** — a one-tap, rate-limited reprieve on the blocked page (e.g. one 5-min extension per day per rule). The current block is binary; a friction-with-escape-hatch model is more sustainable and reduces "disable the whole extension" rage-quits.
- **Block-event log / history page** — `blocksByDay` exists for stats but there is no per-event timeline ("blocked old.reddit.com at 14:32"). Useful for understanding patterns.

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