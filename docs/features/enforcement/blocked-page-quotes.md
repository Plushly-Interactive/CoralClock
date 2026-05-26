# Blocked page quotes

A quote is displayed at the bottom of the blocked page card. Quotes are drawn from a mixed pool: time-of-day bucketed quotes, self-aware/light quotes, site-specific jokes, and user-defined custom quotes. The system favors quotes the user hasn't seen yet, cycling through the full pool before repeating.

## User stories

- As a user, I want to see a short quote when I'm blocked so the interruption feels intentional rather than punitive.
- As a user, I want the quotes to vary and eventually cycle so they don't feel stale.
- As a user, I want to add my own quotes so the feature reflects my own voice.

## Acceptance criteria

- [ ] A quote is displayed on every blocked page load.
- [ ] The quote is drawn from the unseen pool first; once all quotes have been shown, the seen list resets and cycling begins again.
- [ ] Time-of-day bucketing: morning (6–11), afternoon (11–17), evening (17–23), night (23–6) quotes are drawn preferentially from the matching bucket.
- [ ] If the blocked site matches a site-specific quote pool (rule target substring match), there is a 25% chance the quote is drawn from that pool instead.
- [ ] Custom quotes (defined in the quotes file) are included in the draw with equal weight to built-in quotes.
- [ ] If a quote has no author, only the quote text is shown (no "— " attribution line).
- [ ] Seen quote IDs are persisted in `chrome.storage.local` and survive service-worker restarts.

## Scope

### Surfaces involved

| Surface | Role |
|---|---|
| `src/pages/blocked/` | Renders the quote and runs the selection logic |
| `src/shared/quotes.js` | Quote pools (built-in + custom), selection function — new file |

### Files likely to change

| File | Change |
|---|---|
| `src/pages/blocked/blocked.html` | Add `#quote` and `#quote-author` elements |
| `src/pages/blocked/blocked.js` | Import and call quote selector, render result |
| `src/shared/quotes.js` | New file — all quote data and selection logic |

### Storage / tracking

| Key | Shape | Read by | Written by | Notes |
|---|---|---|---|---|
| `seenQuoteIds` | `string[]` | `quotes.js` | `quotes.js` | IDs of quotes shown at least once; reset to `[]` when all quotes have been seen |

### Quote file format

Each quote object in `src/shared/quotes.js`:

```js
{ id: 'string', text: 'string', author?: 'string', bucket?: 'morning'|'afternoon'|'evening'|'night', site?: 'string' }
```

- `id` — stable unique slug (used for seen-tracking). Never reuse or rename.
- `bucket` — if set, quote is drawn preferentially when the current hour falls in that range.
- `site` — if set, quote is eligible for site-specific draw when `rule.target` includes this string (e.g. `'youtube'`).
- Custom quotes live in the same file under a clearly marked `CUSTOM` section.

### Selection algorithm

1. Build the **eligible pool**: all quotes where `site` is absent or doesn't match the current target.
2. If the site matches a site-specific pool and `Math.random() < 0.25`, draw from that pool instead (also preferring unseen).
3. Within the eligible pool, filter to **unseen** quotes first. If none remain, reset `seenQuoteIds` to `[]` and use the full pool.
4. Among unseen eligible quotes, prefer those whose `bucket` matches the current hour. If none match, use all unseen eligible.
5. Draw one at random from the result. Save its `id` to `seenQuoteIds`.

## Edge cases

- No quotes defined: render nothing — `#quote` stays hidden.
- Storage read fails: fall back to a random draw from the full pool without tracking.
- All quotes are site-specific for the current site: the 75% general-pool draw still works because site quotes are excluded from the general pool.

## Out of scope (v1)

- UI for managing custom quotes (editing, reordering, toggling) — custom quotes are added by editing the file directly.
- Syncing seen quote state across devices.
- Per-rule quote overrides.
