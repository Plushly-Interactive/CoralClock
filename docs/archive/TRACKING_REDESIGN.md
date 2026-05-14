# Time Tracking Redesign

## Problems with the current implementation

- Only one `activeVisit` object — tracks a single tab at a time
- Switching between browser windows is not detected (no `onFocusChanged` listener)
- No audio tracking

---

## Design decisions

### Track all non-minimized windows simultaneously

Instead of one `activeVisit`, track every window's active tab in parallel. A window contributes to active tracking if its state is not `minimized`.

**Why not focus?** `chrome.windows.onFocusChanged` fires with the window that *gained* focus, or `WINDOW_ID_NONE` when no Chrome window has focus. It cannot distinguish "this window is behind another app on the same monitor" from "this window is still visible on another monitor." A browser window in a split-screen arrangement is visible and counts — focus being elsewhere is irrelevant. Minimize is the only per-window signal that reliably means the user has put a window away.

Minimize/restore has no dedicated Chrome API event. It is detected on the minute alarm by re-querying all windows' states and reconciling (up to 1 minute delay, acceptable at our tracking granularity).

> **Issue #7** — non-http active tabs (new-tab page, `chrome://`, `file://`) must be excluded from `activeWindowIds`.  
> **Issue #9** — on `windows.onCreated` the active tab may still be `about:blank`; the real hostname arrives via the later `onUpdated` (status=complete) event.  
> **Issue #16** — picture-in-picture windows appear as normal windows and will be tracked; decide if intentional.  
> **Issue #17** — incognito windows are invisible to `windows.getAll` without the incognito permission; behaviour is undefined.  
> See `REDESIGN_ISSUES.md` for details.

### Track audio independently

Any tab producing audio (`tab.audible === true`) is tracked regardless of window state, focus, or whether it is the active tab. This is handled by a separate set of tab IDs.

Audio tracking is driven by `chrome.tabs.onUpdated` with `changeInfo.audible`.

The original idea of an "audible exception" for minimized windows (track minimized windows if their active tab is audible) was dropped — audio tracking covers this case without special-casing active tracking.

> **Issue #2** — a tab navigating between sites while already audible does not fire `changeInfo.audible`; it stays attributed to the wrong site until something else evicts it. Requires a `tabId → hostname` reverse map.  
> **Issue #3** — the minute alarm re-queries window states but not audible tabs; stale entries survive service worker restarts.  
> **Issue #8** — `tab.audible` can be `true` while `mutedInfo.muted` is also `true`; decide whether user-muted tabs count.  
> See `REDESIGN_ISSUES.md` for details.

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


| wasActive | wasAudible | Adds elapsed to                      |
| --------- | ---------- | ------------------------------------ |
| true      | false      | `activeMs` only                      |
| false     | true       | `audioMs` only                       |
| true      | true       | `activeMs`, `audioMs`, `overlapMs`   |
| false     | false      | nothing (site was not being tracked) |


### Three accumulators per site

From `activeMs`, `audioMs`, `overlapMs`, all future blocking modes are derivable:


| Blocking mode                           | Formula                          |
| --------------------------------------- | -------------------------------- |
| Active only                             | `activeMs`                       |
| Audio only                              | `audioMs`                        |
| Active + audio (union, no double-count) | `activeMs + audioMs - overlapMs` |


---

## Data structures

### `siteStates` (in-memory only, not persisted)

```js
Map<hostname, { activeWindowIds, audibleTabIds, startedAt, wasActive, wasAudible }>
```

Rebuilt on service worker startup by querying all windows and all audible tabs.

> **Issue #6** — the hostname key is unspecified: raw URL hostname vs. rule-resolved hostname. Audio events see the raw URL; active tracking currently uses the resolved one.  
> **Issue #11** — `siteStates` is in-memory only; when the service worker is killed (~30s idle) elapsed time since `startedAt` is silently lost for all tracked sites. Consider flushing on `chrome.runtime.onSuspend` or persisting `startedAt`.  
> **Issues #12, #13** — every set change triggers a `storage.local.set`; concurrent flush calls race on a non-atomic read-modify-write. Use an in-memory accumulator as source of truth and write only on alarm and on suspend.  
> See `REDESIGN_ISSUES.md` for details.

### `analyticsByDay` / `analyticsByHour` (persisted, long-term)

```js
{ [dayKey]:  { [siteId]: { activeMs, audioMs, overlapMs, visits } } }
{ [hourKey]: { [siteId]: { activeMs, audioMs, overlapMs, visits } } }
```

`activeMs` = time with a non-minimized window open (including overlap). `audioMs` = time with an audible tab (including overlap). `overlapMs` = both simultaneously. `visits` = navigation count plus first audio entry if no window was open.

---

## Event sources


| Event                                                 | Action                                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Startup                                               | Query all windows → populate `activeWindowIds`; query all audible tabs → populate `audibleTabIds`                                 |
| `chrome.tabs.onActivated`                             | Update `activeWindowIds` for that window (remove old hostname, add new)                                                           |
| `chrome.tabs.onUpdated` (status=complete, tab.active) | Same as onActivated for that window                                                                                               |
| `chrome.tabs.onUpdated` (changeInfo.audible)          | Add/remove tab from `audibleTabIds` for its hostname                                                                              |
| `chrome.tabs.onRemoved`                               | Remove tab from `audibleTabIds` if present                                                                                        |
| `chrome.windows.onCreated`                            | Query new window's active tab, add to `activeWindowIds`                                                                           |
| `chrome.windows.onRemoved`                            | Remove window from all `activeWindowIds`                                                                                          |
| Minute alarm                                          | Flush all sites, re-query all windows to detect minimize/restore, re-query audible tabs to evict stale entries                    |


`chrome.windows.onFocusChanged` is **not used** — focus is irrelevant to tracking decisions.

---

## Storage pruning

No `unlimitedStorage` manifest permission. Retention defaults TBD — see `STORAGE_SIMULATION.md` for size projections.

- `analyticsByHour`: prune entries older than N months
- `analyticsByDay`: prune entries older than N years