# Browser-specific idle

> **Status: NOT RETAINED.** Scoped and spec'd, then rejected during review. The OR-combination of `chrome.idle` and a content-script input signal would correctly catch "background tab while user works in another app" (e.g. Twitch playing audio while user types in IDE) — but it would mis-classify the dominant case of attentive reading: long articles, code review, PR diffs, Notion docs, muted videos. Any tab the user reads without scrolling would falsely accrue `idleMs` after 60s of no input, because no page-level event distinguishes "user is reading" from "user has walked away." The feature trades one inaccuracy (false-active on background tabs) for a worse one (false-idle on attentive reading), with no signal available to disambiguate. Kept here as a record of the decision; not implemented.
>
> Rest of the document is the spec as drafted before the decision.

---

Detect idleness based on input received by Chrome itself, not just OS-wide input. Combined with the existing `chrome.idle` signal as an OR: the user is considered idle if either no input has reached the browser for the threshold, or the OS reports idle. Closes the case where audio plays in a Chrome tab while the user actively works in another app — `chrome.idle` reports active (input goes to the IDE), but the browser has received nothing.

## User stories

- As a user, I want a tab playing audio in the background not to count as "active" when I'm working in another app, because I'm not paying attention to it.
- As a user, I want the idle behavior on `chrome://` settings pages and the Web Store to match what I'd expect — typing there should count as active.

## Acceptance criteria

- When the focused Chrome tab is a normal `http(s)` page and the user types in another app for ≥ 60s without touching Chrome, the focused tab's accrual switches to `idleMs` even though `chrome.idle` reports `active`.
- When the focused Chrome tab receives input (mouse, keyboard) and the previous browser-idle stretch ends, accrual returns to `activeMs` on the next flush.
- When the focused Chrome tab is a restricted URL (`chrome://`, `chrome-extension://`, Web Store, PDFs) and the user is working in another app, the existing `chrome.idle` signal alone decides idleness for that tab. No false-idle from "we couldn't see input there."
- When the user is fully away (no input anywhere) for ≥ 60s, both signals agree and `idleMs` accrues, same as today.
- Content scripts on chatty pages (games, scroll-heavy sites) do not flood the background — each tab sends at most one ping per 5 seconds during continuous input.

## Scope

### Surfaces involved


| Surface    | Role in this feature                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| content    | Tiny script injected on every page, listens to `mousemove` / `keydown`, sends throttled ping to background.                                                            |
| background | Tracks `lastBrowserInputAt` per receipt; combines with `chrome.idle` state to decide effective idleness; reuses the existing `idleStartedAt` + `clipIfIdle` machinery. |


### Files likely to change


| File                           | Change                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifest.json`                | Add `content_scripts` entry matching `<all_urls>`, `run_at: document_idle`, `all_frames: false`, pointing to the new content script.                                                                                                                                                                                                                                                  |
| `src/content/idle-ping.js`     | New. Listens for `mousemove` and `keydown` on `document`; on input, if ≥ 5s since last ping, sends `{ type: MSG_BROWSER_INPUT_PING }` to the background.                                                                                                                                                                                                                              |
| `src/shared/msgTypes.js`       | Add `MSG_BROWSER_INPUT_PING = 'browserInputPing'`.                                                                                                                                                                                                                                                                                                                                    |
| `src/background/background.js` | New module-level `lastBrowserInputAt` timestamp. `onMessage` handler for `MSG_BROWSER_INPUT_PING` updates it to `Date.now()`. The existing `clipIfIdle` is replaced by an effective-idle check: the user is idle if `idleStartedAt !== null` OR (`lastBrowserInputAt !== null` AND `now - lastBrowserInputAt > 60_000`). The earlier of the two timestamps is used as the clip point. |


### Storage / tracking

No new persistent storage. `lastBrowserInputAt` is in-memory only, same pattern as `idleStartedAt`. Lost on service-worker restart; re-seeded by the first ping after restart (or stays unset until a ping arrives — equivalent to "we haven't observed input yet, fall back to chrome.idle").

## Edge cases

- **Service-worker restart with no recent ping**: `lastBrowserInputAt` is `null`. The effective-idle check treats `null` as "no browser-input signal yet" — fall back to `chrome.idle` alone. As soon as any tab pings, the signal becomes active.
- **Focused tab is a restricted URL**: the content script never runs there, so no pings arrive from it. But pings can still arrive from *other* tabs in the background (e.g. an unfocused YouTube tab the user nudged with the mouse). To correctly fall back to `chrome.idle` for restricted focused tabs, the effective-idle check should consider `lastBrowserInputAt` as "did anything in Chrome see input recently" — which is correct for the restricted-tab case, because if the user was typing in another *Chrome* tab, that's still browser activity.
- **All Chrome windows minimized / no focused Chrome window**: same as today's tracker — `setWindow` removals stop active accrual. The browser-idle check is moot because no site is currently focused.
- **The user clicks the address bar or devtools (browser chrome, not page)**: no content script receives the input. `lastBrowserInputAt` doesn't update. After 60s, browser-idle trips. Acceptable — using the address bar without any page interaction for >60s is genuinely browser-idle from a page-attention standpoint.
- **Multi-window with one Chrome window in clamshell behind another app**: `chrome.idle` is OS-wide so it can't see this. Browser-idle catches it: if no input reaches the hidden Chrome window in 60s, the focused tab there accrues `idleMs`.