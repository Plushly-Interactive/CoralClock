# Ideas / Backlog

- Enforce rule uniqueness: no two rules with the same hostname + period should coexist
- Allow subdomain matching (e.g. blocking all of **.reddit.com) and/or subpages (e.g. reddit.com/**)
- Dynamically constrain the limit unit dropdown based on the selected period (e.g. period=hour → only minutes allowed)
- Validate the target format before saving a rule (e.g. reject invalid URLs/hostnames, ideally test that the target is reachable)
- Handle empty rules list with a nice "No rules"-like message
