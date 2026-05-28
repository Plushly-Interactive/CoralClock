# Tracking Data Storage Simulation

## Entry structure

Current:
```
"youtube.com":{"ms":3600000,"visits":5}
```
~39 bytes per entry

New (with audio tracking):
```
"youtube.com":{"ms":3600000,"audioMs":1800000,"overlapMs":900000,"visits":5}
```
~77 bytes per entry (~2× increase, driven by JSON key name overhead not value sizes)

---

## Storage structure

- `sitesByDay`: one entry per site per day (independent of hours visited)
- `sitesByHour`: one entry per site per **hour-slot** visited (e.g. visiting a site across 3 different hours = 3 entries)

`sitesByHour` is the expensive store — up to 24× more entries per day than `sitesByDay`.

---

## Pruning strategy

Keep hourly data for N months, daily data for longer. Pruning hourly data aggressively has the largest impact.

---

## Steady-state simulations

Steady-state = storage once pruning windows are full.
"Sites/day" = distinct sites visited per day. "Hour-slots/site/day" = how many different hours of the day a site is visited.

### Light user — 5 sites/day, 1 hour-slot/site/day

| Hourly retention | Daily retention | Steady-state |
|---|---|---|
| None | 1 year | ~140 KB |
| None | 2 years | ~280 KB |
| None | 5 years | ~700 KB |
| 1 month | 1 year | ~160 KB |
| 3 months | 2 years | ~330 KB |
| 6 months | 5 years | ~800 KB |
| 5 years | 5 years | ~1.4 MB |

### Medium user — 15 sites/day, 2 hour-slots/site/day

| Hourly retention | Daily retention | Steady-state |
|---|---|---|
| None | 1 year | ~420 KB |
| None | 2 years | ~840 KB |
| None | 5 years | ~2.1 MB |
| 1 month | 1 year | ~510 KB |
| 3 months | 2 years | ~1.1 MB |
| 6 months | 5 years | ~2.6 MB |
| 5 years | 5 years | ~6.3 MB |

### Heavy user — 30 sites/day, 3 hour-slots/site/day

| Hourly retention | Daily retention | Steady-state |
|---|---|---|
| None | 1 year | ~840 KB |
| None | 2 years | ~1.7 MB |
| None | 5 years | ~4.2 MB |
| 1 month | 1 year | ~1.1 MB |
| 3 months | 2 years | ~2.4 MB |
| 6 months | 5 years | ~5.7 MB |
| 5 years | 5 years | ~16.9 MB ⚠️ |

Most scenarios stay under Chrome's default `storage.local` quota of 10 MB. Exception: heavy user with 5-year hourly retention (~16.9 MB) — would require the `unlimitedStorage` manifest permission.

---

## Detailed breakdown — heavy user, 6 months hourly / 5 years daily

**Parameters:** 30 sites/day, 3 hour-slots/site/day

### `sitesByHour` (6 months = 180 days)
- Entries: 30 × 3 × 180 = **16,200**
- Size: 16,200 × 77 bytes = **~1.26 MB**

### `sitesByDay` (5 years = 1,825 days)
- Entries: 30 × 1,825 = **54,750**
- Size: 54,750 × 77 bytes = **~4.18 MB**

### Total: ~5.44 MB

`sitesByDay` dominates (77% of total) despite being cheaper per day — it is retained 10× longer.

**Note:** this is a ceiling. It assumes all 30 sites are visited every day across exactly 3 hour-slots each. Real usage is spottier; expect 40–60% of this in practice (~2–3 MB).

---

## `unlimitedStorage` permission

### Pros
- No quota to manage — no pruning logic needed, simpler code
- No risk of storage writes silently failing if quota is exceeded
- User never loses historical data

### Cons
- Must be declared in `manifest.json` upfront — Chrome shows it as a permission during install, which can reduce trust and installs
- No safeguard against runaway writes (e.g. a bug could fill the user's disk)
- No forcing function for data hygiene

### Can it be made opt-in via extension settings?

No — `unlimitedStorage` is a manifest permission declared at install time. It cannot be requested conditionally at runtime based on a user preference. A toggle in settings can control whether pruning runs, but the permission itself is always on or always off.

### Options

| Option | Permission prompt | Behaviour |
|---|---|---|
| Always declare `unlimitedStorage` | Always shown | Pruning behaviour controlled by user setting |
| Never declare it | Never shown | Pruning always enforced, 10 MB hard cap |
| Declare it, prune by default | Always shown | "Keep forever" toggle available but only matters for heavy long-term users |

**Recommendation:** option 2 (no `unlimitedStorage`, always prune). Only a heavy user with very long retention actually hits the 10 MB limit, and pruning is a small amount of code. Avoiding the permission prompt is worth it for a public extension.
