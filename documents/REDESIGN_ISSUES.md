# Tracking Redesign – Open Issues

Issues identified against the design in `TRACKING_REDESIGN.md`. Where relevant, a corresponding note is inline in that doc.

---

## Correctness

### #1 – Tracking while another app has focus (resolved by design choice)
A non-minimized window with focus on another app is **intentionally tracked**. There is no Chrome API for per-window occlusion. Minimize is the only reliable per-window visibility signal. This was removed from the problems list in TRACKING_REDESIGN.md.

### #2 – Audible tab navigating between sites goes undetected ✓ Resolved
When a tab plays audio and then navigates from site A to site B without going silent, `changeInfo.audible` does not fire (audible state didn't change). The tab stays in site A's `audibleTabIds` indefinitely.

**Resolution:** `audibleTabToSite` reverse map (tabId → siteId) maintained in `tracking.js`. On `onUpdated` with `status: complete`, `background.js` checks `tab.audible` and calls `addAudibleTab(tab.id, newSiteId)`, which detects the siteId change, removes from old site, and adds to new site.

### #3 – Audible tabs not re-verified on minute alarm ✓ Resolved
The minute alarm re-queries all windows to reconcile minimize state but does not re-query audible tabs. If an `audible: false` event fires while the service worker is asleep, the event is dropped and the tab stays in `audibleTabIds` until something else evicts it.

**Resolution:** `reconcileWindows()` now also calls `chrome.tabs.query({ audible: true })`, diffs the result against `audibleTabToSite`, removes stale entries, and adds any missing ones.

### #4 – `timeRecords` shape change not reflected in existing code ✓ Resolved
The redesign changes `timeRecords[hostname]` from a plain number to `{ ms, audioMs, overlapMs }`. `checkAndBlock` and `resetPeriod` in background.js currently read it as a number. Both must be updated.

**Resolution:** Moot — `timeRecords`, `checkAndBlock`, and `resetPeriod` were all removed with the rule/blocking system.

### #5 – `checkAndBlock` is never called for non-foreground tracked sites ✓ Resolved
`checkAndBlock` is only invoked from `handleTabChange`. With N sites tracking in parallel, a site active in a background window can cross its limit between navigations and never trigger a block.

**Fix:** The minute alarm flush must call `checkAndBlock` for every currently tracked site, not just the one that was most recently navigated to.

**Resolution:** Moot — `checkAndBlock` and the rule/blocking system have been removed pending a full rework. `siteStates` is private to `tracking.js`.

---

## Under-specified

### #6 – Hostname key: raw vs. rule-resolved ✓ Resolved
The current code applies rule-based hostname rewriting (subdomain → `rule.target`). The design does not say whether `siteStates` is keyed by the raw hostname or the resolved one. Audio events see the raw URL on the tab; active tracking currently uses the resolved hostname. Needs a decision before implementation.

**Resolution:** Decided to use `siteId` from `resolveSite()` (eTLD+1 via tldts) — the same key analytics uses. All of `siteStates`, `timeRecords`, `dailyRecords`, and `pendingVisits` are now keyed by `siteId`.

### #7 – Non-http active tabs must be excluded ✓ Resolved
A window's active tab might be the new-tab page, `chrome://`, `about:`, or `file://`. `activeWindowIds` should only contribute when the active tab is an http(s) URL. Not stated in the design.

**Resolution:** `siteIdFromUrl(url)` returns `null` for any non-http(s) URL. `setWindowSite(windowId, null)` removes the window from tracking without adding it to any site.

### #8 – Audible-but-muted tabs ✓ Resolved
`tab.audible` can be `true` while `tab.mutedInfo.muted` is also `true` (tab producing audio that the user silenced via the speaker icon). The design says "any tab producing audio (`tab.audible === true`) is tracked." Decide whether explicitly muted tabs should count.

**Resolution:** Decided not to track muted tabs. Audio tracking will check `tab.mutedInfo.muted` and skip the tab if true.

### #9 – `windows.onCreated` race with URL load ✓ Resolved
When a window is created, the active tab may still be `about:blank`. The event table says "query new window's active tab" on `onCreated`, but there is no hostname yet. The subsequent `onUpdated` (status=complete, tab.active) event on that tab must handle the initial population.

**Resolution:** The `windows.onCreated` handler calls `setWindowSite(window.id, siteIdFromUrl(tab?.url))`. If the tab is still `about:blank` or non-http, `siteIdFromUrl` returns null and the window is not tracked. When the real URL loads, `tabs.onUpdated` (status=complete + tab.active) fires and registers the window correctly.

### #10 – Hour/day boundary crossing on flush ✓ Resolved
Flush uses `localHourKey(Date.now())` at the moment of flushing and attributes the entire elapsed slice to that key. A site active across midnight, flushed by the minute alarm at 00:00:30, has all its elapsed time credited to the new day. Decide: split at boundary, or accept ≤1-minute skew and document it.

**Resolution:** Implemented exact boundary splitting. `pending` now stores time ranges `[from, to]` instead of ms totals. `recordElapsed` and `recoverFromSnapshot` push ranges; `flushToStorage` splits each range at hour boundaries via `splitByHour` and credits each segment to the correct hour/day key. No skew.

---

## Operational

### #11 – Service worker restart silently drops in-flight elapsed time ✓ Resolved
`siteStates` is in-memory only. The service worker idle-timeout is ~30 seconds; the minute alarm wakes it back up. Time elapsed between the last `startedAt` and the kill is lost with no indication. In the new design this affects N sites simultaneously instead of one.

**Resolution:** After each flush the alarm handler saves a snapshot `{ sites, at }` to storage. On the next alarm wake, if `siteStates` is empty (SW was killed), the handler attributes `Date.now() - snap.at` to each snapshotted site before reconciling. All active `startedAt`s are reset to approximately the same value during `flushToStorage`, so a single `at` timestamp covers all sites. See #19 for a known edge case.

### #19 – Snapshot over-counts if a tab closes while the SW is dead
When the SW is killed after saving a snapshot and a tracked tab is closed before the next alarm: the tab-close event wakes the SW, but `siteStates` is empty so `removeWindowSite` is a no-op. On the next alarm, `recoverFromSnapshot` attributes the full interval since the snapshot to that site, even though it was only open for part of it. The error is bounded by one alarm cycle (~60s). Accepted — same class of skew as Issue #10.

### #12 – Non-atomic storage read-modify-write ✓ Resolved
Every flush does `storage.local.get` → mutate → `storage.local.set`. Concurrent flushes (e.g., `onActivated` fires while the minute alarm is mid-flush) can read the same stale value and one write silently overwrites the other.

**Fix:** Keep an in-memory accumulator as the single source of truth; persist to storage in batches (on alarm and on `onSuspend`).

**Resolution:** `pending` and `pendingVisits` are in-memory accumulators. Tab/window events only write to them; storage is only touched once per minute by `flushToStorage`. The residual alarm-vs-alarm race is tracked separately as #18.

### #13 – Storage write thrashing ✓ Resolved
Every set change triggers a flush and a `storage.local.set`. Audio pause/play/ad-break events can fire many times per minute. With the in-memory accumulator from #12, this is resolved — writes only happen on alarm and on suspend.

**Resolution:** Implemented with #12. Tab/window events and visit increments are accumulated in-memory; a single `storage.local.set` happens per minute.

### #18 – `flushToStorage` / `resetPeriod` concurrent alarm race ✓ Resolved
`flushToStorage` (flush alarm) and `resetPeriod` (reset-hour/day/week alarm) can fire in the same minute. Both are async and interleave at `await` points. If `resetPeriod`'s terminal `pending.clear()` runs between `flushToStorage`'s synchronous `recordElapsed` loop and its iterate-then-drain block, the accumulated data is silently dropped.

**Resolution:** Moot — `resetPeriod` and `timeRecords` were removed with the rule/blocking system. `flushToStorage` is the only writer to the pending maps.

### #14 – Spurious flushes when set size changes but tracking state does not ✓ Resolved
If two windows are showing the same site and one closes, `activeWindowIds` changes (2 → 1) but `wasActive` remains true. A flush still runs, adds zero useful data, and resets `startedAt`. Consider flushing only when the boolean `wasActive` or `wasAudible` actually transitions, not on every set-size change.

**Resolution:** `recordElapsed` in `removeWindowSite` is only called when `activeWindowIds` reaches zero and `wasActive` is true. A window leaving a multi-window site does not trigger any accumulation or `startedAt` reset.

---

## UX / Analytics

### #15 – Visits decouple from audio time ✓ Resolved
`visits` is incremented only on navigation. A site that only ever plays audio in a background tab will accumulate `audioMs` with `visits = 0`. The top-sites bar chart will under-represent audio-heavy sites. Decide: increment visits on first audio entry per session, or document the semantic difference.

**Resolution:** `addAudibleTab` increments `pendingVisits` when the site transitions from completely untracked to audible (`!wasActive && !wasAudible`). If a window is already open for the site, no visit is added — the window navigation already counted it.

### #16 – Picture-in-picture windows are treated as regular windows ✓ Resolved
Chrome exposes PiP as a normal window; it will be included in `activeWindowIds`. This is probably desirable (user is watching something) but should be an explicit decision.

**Resolution:** Decided to track PiP windows — intentional.

### #17 – Incognito windows ✓ Resolved
`chrome.windows.getAll` does not include incognito windows unless the extension is allowed in incognito. Tracking behaviour in incognito is currently undefined — decide whether to support it and update the manifest accordingly.

**Resolution:** Decided out of scope. Incognito windows are not tracked; manifest unchanged.
