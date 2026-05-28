# Manual Storage Pruning

Manual pruning flips the model: user controls retention, extension monitors size and alerts.

---

## Storage keys

Four persisted stores, each a single `chrome.storage.local` key:


| Key               | Structure                                                                           | Notes                                     |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- |
| `sitesByDay`  | `{ [dayKey]: { [siteId]: { activeMs, audioMs, overlapMs, visits } } }`              | One entry per site per day                |
| `sitesByHour` | `{ [hourKey]: { [siteId]: { activeMs, audioMs, overlapMs, visits } } }`             | One entry per site per hour-slot visited  |
| `subpagesByDay`   | `{ [dayKey]: { [siteId]: { [path]: { activeMs, audioMs, overlapMs, visits } } } }`  | One entry per path per site per day       |
| `subpagesByHour`  | `{ [hourKey]: { [siteId]: { [path]: { activeMs, audioMs, overlapMs, visits } } } }` | One entry per path per site per hour-slot |


`dayKey` = `"2026-05-03"`, `hourKey` = `"2026-05-03T14"`.

Subpages are the most expensive store — a site like YouTube can accumulate one path entry per video watched. Pruning subpages first has the largest impact on storage.

---

## Pruning strategies

### 1. Insignificant records (implemented)

Delete records where the tracked time is too low to be meaningful. This is the lowest-risk pruning — it doesn't discard real history, only noise.

**Defining "insignificant":**

A record is insignificant if its total tracked time is below a threshold. Best measure is `activeMs + audioMs - overlapMs` (union — the actual wall-clock time the user was present on the site/path). This is the value the UI already shows.

Candidate thresholds:


| Threshold | What it catches                                     |
| --------- | --------------------------------------------------- |
| < 5 s     | Accidental navigations, prefetches, instant bounces |
| < 30 s    | Brief tab openings, skimmed-over pages              |
| < 60 s    | Conservative; only catches very fast bounces        |


Subpages are the main target here — a YouTube video opened for 3 seconds creates a path record identical in structure to one watched for an hour. Sites are less likely to have truly insignificant records (if you visited a domain at all, something happened).

**Granularity:** insignificant pruning operates at the record level within a bucket, not the whole bucket. A day bucket with 20 sites keeps 19 of them after one insignificant site is pruned.

**Open question:** should insignificant pruning apply to:

- Subpages only (highest impact, lowest risk of surprising the user)
- Both sites and subpages
- Configurable per type

### 2. Date-based retention (later)

Keep hourly data for N months, daily data for N years. Deletes entire date-key buckets. This is the blunter tool for users who want to shed old data wholesale.

---

## Measuring storage

`chrome.storage.local.getBytesInUse()` is the authoritative method — it returns actual quota usage including metadata. Should be called per-key to show a breakdown:

```js
const [hourBytes, dayBytes, subHourBytes, subDayBytes] = await Promise.all([
  chrome.storage.local.getBytesInUse('sitesByHour'),
  chrome.storage.local.getBytesInUse('sitesByDay'),
  chrome.storage.local.getBytesInUse('subpagesByHour'),
  chrome.storage.local.getBytesInUse('subpagesByDay'),
]);
```

Chrome quota without `unlimitedStorage`: **10 MB**.

---

## Alerting thresholds


| Threshold    | Action                                             |
| ------------ | -------------------------------------------------- |
| 70% (7 MB)   | Show warning in options page                       |
| 95% (9.5 MB) | Show urgent warning, recommend pruning immediately |


---

## Manual pruning UI

### Where it lives

Options:

- A section in the main settings page
- A dedicated "Data & Storage" tab

### What the user controls

To be decided — see open questions below.

---

## Open questions

1. **Date retention UI model:** sliders, step-by-step delete, or safe-defaults + expert mode?
2. **UI location:** settings section or dedicated tab?
3. **Re-measurement frequency:** on startup only, or also after each flush?

