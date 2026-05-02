# Ideas / Backlog

- Enforce rule uniqueness: no two rules with the same hostname + period should coexist
- Allow subdomain matching (e.g. blocking all of **.reddit.com) and/or subpages (e.g. reddit.com/**)
- Dynamically constrain the limit unit dropdown based on the selected period (e.g. period=hour → only minutes allowed)
- Validate the target format before saving a rule (e.g. reject invalid URLs/hostnames, ideally test that the target is reachable)
- Handle empty rules list with a nice "No rules"-like message
- Block url/page title keywords
- analytics site page: daily/weekly average, time and visits
- browsing trends algorithms, user habits, improvement sugegstions, etc.
- Groups, labels, etc. (can serve as filters in analytics)
- Three blocking rule modes (per-rule choice):
  - Active browsing mode: counts time based on window visibility / active tab (current approach, refactored)
  - Audio mode: counts time any tab on that site is producing audio, regardless of focus/minimize/window state
  - Active + audio mode: counts time when the site is either active OR audible (union of both)
  - Analytics to track both `ms` (active) and `audioMs` (audio) per site per hour/day