# Time Tracking Redesign

## Problems with the current implementation

- Only one `activeVisit` object — tracks a single tab at a time
- Switching between browser windows is not detected (no `onFocusChanged` listener)
- Time keeps accumulating even when the browser is in the background (another app has focus)
- No audio tracking

---

## Design decisions

### Track all non-minimized windows simultaneously

Instead of one `activeVisit`, track every window's active tab in parallel. A window contributes to active tracking if its state is not `minimized`. Focus is irrelevant — a visible window on a secondary monitor counts even if another app has focus on the main monitor.

Minimize/restore has no dedicated Chrome API event. It is detected on the minute alarm by re-querying all windows' states and reconciling (up to 1 minute delay, acceptable at our tracking granularity).

### Track audio independently

Any tab producing audio (`tab.audible === true`) is tracked regardless of window state, focus, or whether it is the active tab. This is handled by a separate set of tab IDs.

Audio tracking is driven by `chrome.tabs.onUpdated` with `changeInfo.audible`.

The original idea of an "audible exception" for minimized windows (track minimized windows if their active tab is audible) was dropped — audio tracking covers this case without special-casing active tracking.

### Per-site state machine

Rather than two independent elapsed-time maps (which cannot cleanly dedup overlap), tracking is modelled as a state machine keyed by hostname.

```
siteStates: Map<hostname, {
  activeWindowIds: Set<windowId>,  // non-minimized windows with this site as active tab
  audibleTabIds:   Set<tabId>,     // tabs on this site currently producing audio
  startedAt:       timestamp,      // when current state began
  wasActive:       bool,
  wasAudible:      bool
}>
```

When either set changes for a site, elapsed time since `startedAt` is flushed into the correct accumulators based on the *previous* `wasActive`/`wasAudible` state, then the state is updated and `startedAt` is reset.

| wasActive | wasAudible | Adds elapsed to |
|---|---|---|
| true | false | `activeMs` only |
| false | true | `audioMs` only |
| true | true | `activeMs`, `audioMs`, `overlapMs` |
| false | false | nothing (site was not being tracked) |

### Three accumulators per site

From `activeMs`, `audioMs`, `overlapMs`, all future blocking modes are derivable:

| Blocking mode | Formula |
|---|---|
| Active only | `activeMs` |
| Audio only | `audioMs` |
| Active + audio (union, no double-count) | `activeMs + audioMs - overlapMs` |

---

## Data structures

### `siteStates` (in-memory only, not persisted)

```js
Map<hostname, { activeWindowIds, audibleTabIds, startedAt, wasActive, wasAudible }>
```

Rebuilt on service worker startup by querying all windows and all audible tabs.

### `timeRecords` (persisted, reset each period)

```js
{ [hostname]: { ms, audioMs, overlapMs } }
```

Used for limit checking. Reset by period alarms (hour/day/week) as today.

### `analyticsByDay` / `analyticsByHour` (persisted, long-term)

```js
{ [dayKey]:  { [siteId]: { ms, audioMs, overlapMs, visits } } }
{ [hourKey]: { [siteId]: { ms, audioMs, overlapMs, visits } } }
```

`ms` = active time (including overlap). `audioMs` = audio time (including overlap). `overlapMs` = both simultaneously. `visits` = navigation count (unchanged).

---

## Event sources

| Event | Action |
|---|---|
| Startup | Query all windows → populate `activeWindowIds`; query all audible tabs → populate `audibleTabIds` |
| `chrome.tabs.onActivated` | Update `activeWindowIds` for that window (remove old hostname, add new) |
| `chrome.tabs.onUpdated` (status=complete, tab.active) | Same as onActivated for that window |
| `chrome.tabs.onUpdated` (changeInfo.audible) | Add/remove tab from `audibleTabIds` for its hostname |
| `chrome.tabs.onRemoved` | Remove tab from `audibleTabIds` if present |
| `chrome.windows.onCreated` | Query new window's active tab, add to `activeWindowIds` |
| `chrome.windows.onRemoved` | Remove window from all `activeWindowIds` |
| Minute alarm | Flush all sites, re-query all windows to detect minimize/restore, restart |

`chrome.windows.onFocusChanged` is **not used** — focus is irrelevant to tracking decisions.

---

## Storage pruning

No `unlimitedStorage` manifest permission. Pruning runs on the daily reset alarm.

- `analyticsByHour`: prune entries older than N months (default TBD)
- `analyticsByDay`: prune entries older than N years (default TBD)

Retention defaults to be decided. See `STORAGE_SIMULATION.md` for size projections.
