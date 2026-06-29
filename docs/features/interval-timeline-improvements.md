# Interval timeline: deferred improvements

Backlog of enhancements for the timeline page (`src/pages/interval-timeline/`),
considered but not built yet. Captured 2026-06-27.

## 1. Site filter

A small search/filter box to narrow the visible rows to one or a few domains.
Now that the timeline shows **all** sites for the period (the old top-N coverage
selector was removed), a long period can render many rows; a filter lets you focus.

- Filter `top` (the sorted domains) by a substring match on the domain / label
  before rendering rows.
- Persist the query in `sessionStorage` (per-tab, ephemeral) like the other view
  state. Place the input on the controls row (left, near "Trim empty time").

## 2. Period summary

A small header stat showing the **total browsing time for the visible period**,
optionally split active / audio. Quick "how much today / this week" without
scanning the per-row durations in the gutter.

- Sum `active + audio - overlap` across the rendered sites for the current window
  (respecting the trim toggle), show in the controls/header area.
- Reuse `formatMs`. Could also show the period's distinct-site count.

## 3. Sort toggle

A seg-control to order rows by **time (current default) / name / most-recent**.
Handy when scanning a long list.

- Time: current `total` desc.
- Name: `formatHostnameLabel` / domain ascending.
- Most-recent: by each domain's latest `to` within the window.
- Persist the choice in `sessionStorage`; place beside the (future) site filter.

---

Not in this list but discussed: skip-empty-periods navigation, row emphasis on
hover, today/weekend shading, show-hide-idle toggle, month-level density minimap,
export-PNG. (Skip-empty-periods was rated the highest-value of the full set.)
