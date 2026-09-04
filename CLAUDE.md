# Project Rules

## Project context
- Browser extension targeting Vivaldi (Chromium, Manifest V3)
- Goal: collect browsing data and block websites once a configurable time limit (per hour / day / week) is reached

## How we work together
- Work incrementally. One step at a time, in natural order.
- Before creating or deleting any file, say what you're about to do and why. Wait for confirmation.
- Before introducing a new tool or dependency, explain what it does and why we need it now.
- When something can be done in multiple ways, present the options and let me choose.
- When answering technical questions, always cite your sources.

## Code style
- Minimal. Only write what is needed for the current step.
- No comments unless the logic is genuinely non-obvious.
- No abstractions or helpers until there is a concrete reason for them.
- Do not write migration code along with functional code. Suggest it after you're done with the functional code.

## JavaScript / HTML / CSS
- Every interactive DOM element must have an `id`. Always select with `querySelector('#id')` in JavaScript, never `getElementById`. Exception: elements generated in a loop (dropdown options, table rows) never get an id — select them via closure, `dataset`, or `event.currentTarget` instead.
- Use classes for CSS styling (shared styles across elements). Use ids for JS selection. An element can have both.
- Never duplicate CSS code, use existing shared classes as much as possible.
- Always prefix unused parameters with _.
- SVG `<title>` tooltips are unreliable in Chromium, never use them.
- Never use a native `<select>` or `<input type="date">` — use the custom-dropdown pattern (`shared/dropdown.js`) and `shared/datePicker.js` respectively. Native `<input type="number">` is fine but must be paired with `enhanceNumberInput()` from `shared/numberInput.js` to replace the native spinner with the custom stepper.
- For a close/clear "×" glyph, always use the `&times;` HTML entity, never the literal `×` character or the numeric `&#215;` entity. This works even when set via JS, as long as it's assigned through `innerHTML` (entities parse there); `textContent` never parses entities, so if a toggle needs to swap the glyph, use `innerHTML` for that assignment too.
- Never duplicate JS code, use existing functions as much as possible, extract functions that get new use cases in a separate shared file when relevant.
- When reusing logic across 2+ pages, extract it to `src/shared/`. When extracting data/storage logic (migrations, import, pruning), put it in `src/data/`. When the logic requires service-worker APIs (alarms, DNR, tab/window tracking), put it in `src/background/`.
- For dynamic JS-driven visibility toggling, use `element.style.display = 'none'` / `''` (empty string restores the CSS-declared display value). Use the `hidden` attribute only for static initial hidden states declared in HTML (e.g. `<div id="modal" hidden>`), and clear it via `element.removeAttribute('hidden')` or by setting `style.display` once before toggling further.
- Pages access `chrome.storage.local` directly — there is no requirement to proxy reads or writes through `background.js`.
- For `<button>` elements that navigate to another page, use `navButton(el, url)` from `src/shared/utils.js` — it handles same-tab, middle-click, and ctrl/cmd-click correctly.
- Background debug logging goes through `dbg()` from `src/background/trackingDebug.js`, gated on the `_debug` flag in `chrome.storage.local`. Don't use bare `console.log` in background code, and don't log user URLs unless behind `dbg()`. Any new tracking feature must add `dbg()` calls at its decision points (visit counted / not counted, state transitions, flushes) so the trace stays usable for diagnosing overcounting and similar bugs. Exception: the service-worker startup banner (`SERVICE WORKER STARTED`) is logged unconditionally because it runs at module load before `initDebug()` reads the flag, and it carries no URL data.
- Named string constants for `chrome.storage.local` preference keys and `sessionStorage` view-state keys go in `src/shared/prefKeys.js`. Read-query dispatch tags (the page-side provider `type` selectors) go in `src/shared/queryTypes.js`. Both follow the same rule: add a constant *only when used by more than one file*. A key used in a single file stays as a local string literal in that file — no constant, no shared-module entry. Promote to a shared constant the moment a second file needs it. Same rule for any future "named string" of this kind.
- Two distinct storage tiers, do not conflate them:
  - **Persistent user settings** (e.g. `idleThresholdSec`, `weekStart`) live in `chrome.storage.local`, are surfaced on the settings page, and have a `DEFAULT_*` constant colocated with the module that owns the setting's meaning. Defaults are imported, never re-declared at the call site.
  - **Per-tab view-state** (e.g. `hideBrief`, `mergeMode`, `groupMode`, `subpagesStripParams`, `timeRange`) lives in `sessionStorage`, is intentionally per-tab and ephemeral, and does NOT belong on the settings page. Defaults are encoded in the read pattern (`!== 'false'` / `=== 'true'`).

## Internationalization (i18n)
- Any new user-facing string: add key to `_locales/en/messages.json` AND translate + add to every other `_locales/<lang>/messages.json` in same step. Never leave a key en-only.
- All user-facing strings go through `src/shared/i18n.js`: `t(key, subs)` for JS, `data-i18n`/`data-i18n-title`/`data-i18n-placeholder`/`data-i18n-aria` HTML attributes hydrated by `applyI18n(root)` for markup. Use `data-i18n-firstchild` instead of `data-i18n` when the element has non-text children after the label (e.g. an SVG dropdown arrow) — it replaces only the leading text node.
- Keys and English text live in `_locales/en/messages.json`. Messages use positional `$1`/`$2` substitution only — never named `$FOO$` placeholders — so the custom override loader and native `chrome.i18n.getMessage` behave identically.
- Every `messages.json` entry is a single inline line: `"key": { "message": "..." },`. Never pretty-print/multi-line an entry — matches the existing file's formatting.
- Translated locales (`_locales/<lang>/messages.json`) hold `{ "key": { "message": "..." } }` only — no `description` field, that's an English-only translator hint.
- The active language is `PREF_LANGUAGE` in `chrome.storage.local`, set via the Settings page language picker. Changing it reloads the page — there's no live re-render.
- Locale-culture-dependent strings (weekday/month names) use `Intl.DateTimeFormat`, never hardcoded arrays.
- Pluralization uses `_one`/`_other` key suffixes with manual dispatch — no ICU MessageFormat.
- Exception: changelog bullet content (`src/shared/changelogEntries.js`) does NOT go through `messages.json`. Per-release release-note prose would otherwise accumulate there forever, one-off and unreused. Each item instead carries its own `{ en, es, fr }` text inline, resolved at render time via `resolveLanguage()` in `i18n.js`. Static changelog UI chrome (Dismiss, Close, category labels, etc.) still follows the normal `messages.json` rule above — only the per-release bullet text is exempt.

## Page layout
- Each full-page view lives in `src/pages/<name>/` as a `<name>.{html,css,js}` triplet.
- Every full-page view reuses the shared header in `theme.css` (75px height, three-column grid). Don't redefine `header` per page. Exception: the popup has its own fixed-width header layout and is exempt.
- For "back to dashboard" navigation, use the icon-back pattern: an `<a id="back-btn">` wrapping the brand logo image (`BRAND_NAME` in `src/shared/brand.js`), placed in `#header-left`. Never add a text "Back to dashboard" button.
- `legacy-storage-management` has no own `.css` file; it intentionally reuses `storage-management.css` since the two pages share layout. Only break the triplet convention this way when a page is a near-duplicate of an existing one.

## Versioning and releases
- Semver on `manifest.json`. PATCH for bug fixes and internal work only. MINOR for any user-visible new capability or changed behaviour. MAJOR only for a breaking change to stored data or the removal of a feature users rely on.
- A version number is spent the moment it lands in `manifest.json`. Never reopen it to add work, even if it was never tagged or released — roll forward with a new PATCH instead.
- Every release gets a git tag `vX.Y.Z` on `main` and a matching GitHub release. Never reuse or re-cut a published tag.
- Author a changelog entry in `src/shared/changelogEntries.js` for any release a user would notice. Skip the entry for pure-internal patches.
- An entry's `version` must equal the `manifest.json` version it ships with. Bump both in the same commit so they cannot drift.
- Entries are append-only and ordered oldest to newest. Never insert an entry below the newest one — the seen-version comparison assumes nothing older is ever added.

## Communication
- Explain each step as if I'm learning, not just following along.
- Explain each new function, listener or code block you add.
- Short answers. No walls of text.
- If I push back on something, reconsider — don't just justify the original choice.

## Testing
- Never try to run the extension yourself (loading it in a browser, launching dev servers, etc). I test manually. State clearly that a change is code-complete but unverified by you, and tell me what to check.
