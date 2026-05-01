# Tracking Redesign – Open Issues

Issues identified against the design in `TRACKING_REDESIGN.md`. Where relevant, a corresponding note is inline in that doc.

---

## Correctness

### #1 – Tracking while another app has focus (resolved by design choice)
A non-minimized window with focus on another app is **intentionally tracked**. There is no Chrome API for per-window occlusion. Minimize is the only reliable per-window visibility signal. This was removed from the problems list in TRACKING_REDESIGN.md.

### #2 – Audible tab navigating between sites goes undetected
When a tab plays audio and then navigates from site A to site B without going silent, `changeInfo.audible` does not fire (audible state didn't change). The tab stays in site A's `audibleTabIds` indefinitely.

**Fix:** Maintain a `tabId → hostname` reverse map. On `onUpdated` with `status: complete`, check whether the tab's hostname changed and move it between sets.

### #3 – Audible tabs not re-verified on minute alarm
The minute alarm re-queries all windows to reconcile minimize state but does not re-query audible tabs. If an `audible: false` event fires while the service worker is asleep, the event is dropped and the tab stays in `audibleTabIds` until something else evicts it.

**Fix:** Add `chrome.tabs.query({ audible: true })` to the minute reconciliation alongside the window state query.

### #4 – `timeRecords` shape change not reflected in existing code
The redesign changes `timeRecords[hostname]` from a plain number to `{ ms, audioMs, overlapMs }`. `checkAndBlock` and `resetPeriod` in background.js currently read it as a number. Both must be updated.

### #5 – `checkAndBlock` is never called for non-foreground tracked sites
`checkAndBlock` is only invoked from `handleTabChange`. With N sites tracking in parallel, a site active in a background window can cross its limit between navigations and never trigger a block.

**Fix:** The minute alarm flush must call `checkAndBlock` for every currently tracked site, not just the one that was most recently navigated to.

---

## Under-specified

### #6 – Hostname key: raw vs. rule-resolved
The current code applies rule-based hostname rewriting (subdomain → `rule.target`). The design does not say whether `siteStates` is keyed by the raw hostname or the resolved one. Audio events see the raw URL on the tab; active tracking currently uses the resolved hostname. Needs a decision before implementation.

### #7 – Non-http active tabs must be excluded
A window's active tab might be the new-tab page, `chrome://`, `about:`, or `file://`. `activeWindowIds` should only contribute when the active tab is an http(s) URL. Not stated in the design.

### #8 – Audible-but-muted tabs
`tab.audible` can be `true` while `tab.mutedInfo.muted` is also `true` (tab producing audio that the user silenced via the speaker icon). The design says "any tab producing audio (`tab.audible === true`) is tracked." Decide whether explicitly muted tabs should count.

### #9 – `windows.onCreated` race with URL load
When a window is created, the active tab may still be `about:blank`. The event table says "query new window's active tab" on `onCreated`, but there is no hostname yet. The subsequent `onUpdated` (status=complete, tab.active) event on that tab must handle the initial population.

### #10 – Hour/day boundary crossing on flush
Flush uses `localHourKey(Date.now())` at the moment of flushing and attributes the entire elapsed slice to that key. A site active across midnight, flushed by the minute alarm at 00:00:30, has all its elapsed time credited to the new day. Decide: split at boundary, or accept ≤1-minute skew and document it.

---

## Operational

### #11 – Service worker restart silently drops in-flight elapsed time
`siteStates` is in-memory only. The service worker idle-timeout is ~30 seconds; the minute alarm wakes it back up. Time elapsed between the last `startedAt` and the kill is lost with no indication. In the new design this affects N sites simultaneously instead of one.

Mitigations: persist `startedAt` per site to storage, or flush on `chrome.runtime.onSuspend`.

### #12 – Non-atomic storage read-modify-write
Every flush does `storage.local.get` → mutate → `storage.local.set`. Concurrent flushes (e.g., `onActivated` fires while the minute alarm is mid-flush) can read the same stale value and one write silently overwrites the other.

**Fix:** Keep an in-memory accumulator as the single source of truth; persist to storage in batches (on alarm and on `onSuspend`).

### #13 – Storage write thrashing
Every set change triggers a flush and a `storage.local.set`. Audio pause/play/ad-break events can fire many times per minute. With the in-memory accumulator from #12, this is resolved — writes only happen on alarm and on suspend.

### #14 – Spurious flushes when set size changes but tracking state does not
If two windows are showing the same site and one closes, `activeWindowIds` changes (2 → 1) but `wasActive` remains true. A flush still runs, adds zero useful data, and resets `startedAt`. Consider flushing only when the boolean `wasActive` or `wasAudible` actually transitions, not on every set-size change.

---

## UX / Analytics

### #15 – Visits decouple from audio time
`visits` is incremented only on navigation. A site that only ever plays audio in a background tab will accumulate `audioMs` with `visits = 0`. The top-sites bar chart will under-represent audio-heavy sites. Decide: increment visits on first audio entry per session, or document the semantic difference.

### #16 – Picture-in-picture windows are treated as regular windows
Chrome exposes PiP as a normal window; it will be included in `activeWindowIds`. This is probably desirable (user is watching something) but should be an explicit decision.

### #17 – Incognito windows
`chrome.windows.getAll` does not include incognito windows unless the extension is allowed in incognito. Tracking behaviour in incognito is currently undefined — decide whether to support it and update the manifest accordingly.
