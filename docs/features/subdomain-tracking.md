# Subdomain tracking

Track and display browsing time at hostname granularity instead of eTLD+1. `mail.google.com` and `drive.google.com` become first-class entries in analytics; today they are silently merged under `google.com`. The eTLD+1 view is preserved as a UI-side roll-up so existing "all of google.com" totals remain available on demand.

## User stories

- As a user, I want `mail.google.com` and `drive.google.com` to be tracked separately so that I can see which property I actually spend time on.
- As a user, I want to optionally collapse all entries sharing the same eTLD+1 on the dashboard so that I can switch between a per-subdomain and a per-site view.
- As a user, I want subdomain-prefixed sites to be displayed in a readable, inverted form (e.g. `mail.google.com` → "Google Mail") so that the list reads like product names rather than URLs.
- As a user, I want my historical eTLD+1 data preserved through the upgrade so that I don't lose existing totals.

## Acceptance criteria

- `siteIdFromUrl(url)` returns the full hostname with a leading `www.` stripped (e.g. `https://www.example.com/x` → `example.com`; `https://mail.google.com/x` → `mail.google.com`).
- New visits to `mail.google.com` and `drive.google.com` produce distinct entries in `analyticsByDay`, `analyticsByHour`, `subpagesByDay`, and `subpagesByHour`.
- A migration runs once on upgrade that rewrites every existing `siteId` key in `analyticsByDay`, `analyticsByHour`, `subpagesByDay`, and `subpagesByHour`. Existing entries (already eTLD+1) are kept under their bare host form; cells that would collide after key rewriting are summed.
- The dashboard has a group-by-eTLD+1 toggle. Default state: **ungrouped** (one row per hostname). When toggled on, hostnames sharing the same eTLD+1 are summed into a single row labeled with the eTLD+1.
- In the ungrouped view, hostname labels are formatted as inverted title-case: `mail.google.com` → "Google Mail", `s3.amazonaws.com` → "Amazonaws S3", `example.com` → "Example". Bare-host entries (no subdomain) show only the eTLD+1 part title-cased.
- In the grouped view, labels are the eTLD+1 title-cased (e.g. "Google"). Clicking a grouped row navigates to the site detail page for that eTLD+1 (`?siteId=google.com`). The row's second line follows these rules, based on the counts of distinct eTLD+1s and hostnames folded into the row:
  - eTLD+1 count > 1 AND hostname count > 1 → `"N sites · M subdomains"` (e.g. `"2 sites · 3 subdomains"`).
  - eTLD+1 count > 1 AND hostname count = eTLD+1 count → `"N sites"` (existing name-grouping behavior; no extra subdomains).
  - eTLD+1 count = 1 AND hostname count > 1 → `"N subdomains"`.
  - eTLD+1 count = 1 AND hostname count = 1 → show the hostname (single entry, no grouping benefit).
- The site detail page accepts either an eTLD+1 (`?siteId=google.com`) or a single hostname (`?siteId=mail.google.com`).
  - When the param is an eTLD+1 with multiple matching hostnames in storage, the page renders **fully aggregated** across all of them: totals, hourly chart, subpage list, daily history, and the average-per-clock-hour view all sum across every `*.google.com` hostname. A new per-subdomain breakdown lists the matching hostnames with their individual totals.
  - When the param is a single hostname (or an eTLD+1 with only one matching hostname in storage), data is shown for that hostname alone; no per-subdomain breakdown.
- On the site detail page when viewing an aggregated eTLD+1, the header's second line reads `*.google.com` (i.e. `*.<eTLD+1>`). When viewing a single hostname, the second line shows the hostname as-is.
- The path/subpage view shows paths under their actual hostname (e.g. `mail.google.com/inbox` is distinct from a hypothetical `drive.google.com/inbox`).
- Existing analytics readers (dashboard, site, path, prune, importData) continue to function after the migration with no regressions in totals when grouped by eTLD+1.

## Scope

### Surfaces involved


| Surface         | Role in this feature                                           |
| --------------- | -------------------------------------------------------------- |
| background      | Emits hostname-keyed analytics; runs migration once on upgrade |
| dashboard       | New group-by-eTLD+1 toggle; uses inverted label formatter      |
| site detail     | Rolls up matching hostnames; adds subdomain breakdown          |
| path detail     | Paths are now keyed under hostname not eTLD+1                  |
| storage pruning | Operates on hostname-keyed identities                          |


### Files likely to change


| File                                                | Change                                                                                                                                                                                  |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/background/siteResolution.js`                  | `siteIdFromUrl` returns hostname with `www.` stripped; new helper `eTLDPlus1(hostname)`; new helper `formatHostnameLabel(hostname)` for inverted title-case (or place in `src/shared/`) |
| `src/data/migrations.js`                            | New migration: rewrite keys in `analyticsByDay`, `analyticsByHour`, `subpagesByDay`, `subpagesByHour` from eTLD+1 to hostname form; collision-sum where needed                          |
| `src/pages/dashboard/dashboard.js`                  | Group-by-eTLD+1 toggle; default ungrouped; apply label formatter                                                                                                                        |
| `src/pages/dashboard/dashboard.html`                | Toggle control markup                                                                                                                                                                   |
| `src/pages/dashboard/dashboard.css`                 | Toggle styles (reuse shared classes where possible)                                                                                                                                     |
| `src/pages/site/site.js`                            | Roll up all hostnames matching `?siteId` (eTLD+1); add subdomain breakdown                                                                                                              |
| `src/pages/site/site.html`                          | Subdomain breakdown markup                                                                                                                                                              |
| `src/pages/path/path.js`                            | No logic change expected; keys are now hostname-based but the page already reads its `siteId` from query string                                                                         |
| `src/shared/utils.js` or new `src/shared/labels.js` | `formatHostnameLabel(hostname)` if shared across pages                                                                                                                                  |
| `src/data/importData.js`                            | Import path normalizes incoming hostnames the same way (strip `www.`); collision-sum on import                                                                                          |
| `src/pages/storage-pruning/storage-pruning.js`      | No logic change; identities are now hostnames but the page's notion of "identity" is whatever key is in storage                                                                         |


### Storage / tracking


| Key               | Shape                                                                             | Read by                                                    | Written by                         | Notes                                                     |
| ----------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `analyticsByDay`  | `{ dayKey → { hostname → { activeMs, audioMs } } }`                               | background, dashboard, site, importData, migrations, prune | background, importData, migrations | **Key change**: hostname (www stripped) instead of eTLD+1 |
| `analyticsByHour` | `{ hourKey → { hostname → { activeMs, audioMs } } }`                              | background, dashboard, site, importData, migrations, prune | background, importData, migrations | Same key change                                           |
| `subpagesByDay`   | `{ dayKey → { hostname → { path → { activeMs, audioMs, overlapMs, visits } } } }` | background, path, importData, prune                        | background, importData             | Outer site key changes from eTLD+1 to hostname            |
| `subpagesByHour`  | `{ hourKey → { hostname → { path → … } } }`                                       | background, path, importData                               | background, importData             | Same                                                      |
| `storageVersion`  | `{ version: number }`                                                             | migrations                                                 | migrations                         | Bumped by this migration                                  |


No new storage keys. All four analytics keys change semantics on their outer site dimension.

## Edge cases

- `**www.` stripping vs. real `www` subdomain:** `https://www.example.com` is normalized to `example.com`. We accept that any site using `www` as a meaningful, distinct subdomain (rare) will be merged with the bare host. This matches user mental model.
- **Hostnames with no usable eTLD+1 (IP addresses, localhost, intranet hosts):** today these already fall through `getDomain` and `siteIdFromUrl` returns the raw hostname. Continue to store them as-is. Group-by-eTLD+1 toggle treats them as their own group.
- **Migration key collisions:** if two pre-migration `siteId` values rewrite to the same hostname (shouldn't happen since pre-migration keys are already eTLD+1, but defensively), sum their `activeMs`/`audioMs`/`overlapMs`/`visits` rather than overwriting.
- **Import of legacy exports:** import data may still contain eTLD+1 keys from older exports. The import path normalizes them to hostname form (which is a no-op for true eTLD+1 strings) and collision-sums on merge.
- **Label formatter inputs:** for `example.com` (no subdomain part), output is `"Example"` (eTLD+1 only, title-cased). For `a.b.example.com`, output is `"Example B A"` (eTLD+1 first, then subdomain labels in reverse, space-joined). All title-cased.
- **Site detail page URL stability:** `/site?siteId=google.com` (eTLD+1) keeps working; the page enumerates matching hostnames internally. Linking by hostname (`?siteId=mail.google.com`) is also supported for future "open subdomain" links.

## Out of scope (v1)

- Known-brands override map for the label formatter (e.g. `amazonaws` → "AWS", `ycombinator` → "Hacker News"). Mechanical title-case only in v1; brand mapping is a future idea.
- Subdomain-level enforcement rules. Rules continue to target `siteId` (which is now a hostname), but no new rule-targeting UI is added. Enforcement is being rebuilt separately per `docs/enforcement.md`.
- Per-page (site, path) group-by-eTLD+1 toggles. Toggle exists only on the dashboard for v1.

## Open questions

- **Site detail page placement of the subdomain breakdown.** Options discussed:
  - New panel alongside the existing paths panel ("By subdomain" + "By path", both visible).
  - Toggle that switches the existing breakdown between paths and subdomains.
  - Subdomain as a top-level filter scoping the paths view (pick `mail`, then the paths panel shows only `mail.google.com` paths).
  Decision deferred until after the storage and dashboard changes land — easier to judge with real data on screen.
- **Default sort order of dashboard ungrouped view.** With more rows (one per hostname), the existing sort (by `activeMs` desc) may surface short bursts of subdomain noise. Possibly worth filtering rows under a small threshold by default. Revisit after migration on real data.

