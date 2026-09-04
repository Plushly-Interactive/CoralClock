# Data health — implementation detail

TL;DR: the per-file changes and store read/write matrix cut from `docs/features/storage-management/data-health.md`. Reference only.

### Files likely to change

| File | Change |
|---|---|
| `src/data/healthCheck.js` (new) | `checkHealth(stores)` → `{ issues }` ; `applyRepairs(stores, issues)` → mutated stores |
| `src/pages/storage-management/storage-management.js` | Page-load check wiring; repair overlay; post-repair notification |

### Storage / tracking

| Key | Read by | Written by | Notes |
|---|---|---|---|
| `sitesByDay` | `healthCheck.js` | `healthCheck.js` | daily values overwritten during drift/orphan repair |
| `sitesByHour` | `healthCheck.js` | — | source of truth for repair; never written |
| `subpagesByDay` | `healthCheck.js` | `healthCheck.js` | same as sites daily |
| `subpagesByHour` | `healthCheck.js` | — | source of truth; never written |
