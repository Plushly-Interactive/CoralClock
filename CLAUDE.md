# BiteGuard – Project Rules

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
- Every interactive DOM element must have an `id`. Always select with `querySelector('#id')` in JavaScript, never `getElementById`.
- Use classes for CSS styling (shared styles across elements). Use ids for JS selection. An element can have both.
- Never duplicate CSS code, use existing shared classes as much as possible.
- Always prefix unused parameters with _.
- SVG <title> tooltips are unreliable in Chromium, never use them.
- Never duplicate JS code, use existing functions as much as possible, extract functions that get new use cases in a separate shared file when relevant.
- When reusing logic across 2+ pages, extract it to `src/shared/`. When extracting data/storage logic (migrations, import, pruning), put it in `src/data/`. When the logic requires service-worker APIs (alarms, DNR, tab/window tracking), put it in `src/background/`.
- For dynamic JS-driven visibility toggling, use `element.style.display = 'none'` / `''` (empty string restores the CSS-declared display value). Use the `hidden` attribute only for static initial hidden states declared in HTML (e.g. `<div id="modal" hidden>`), and clear it via `element.removeAttribute('hidden')` or by setting `style.display` once before toggling further.
- Pages access `chrome.storage.local` directly — there is no requirement to proxy reads or writes through `background.js`. Background message passing is for data the service worker tracks in memory (e.g. live analytics cache).
- For `<button>` elements that navigate to another page, use `navButton(el, url)` from `src/shared/utils.js` — it handles same-tab, middle-click, and ctrl/cmd-click correctly.

## Page layout
- Every full-page view reuses the shared header in `theme.css` (75px height, three-column grid). Don't redefine `header` per page. Exception: the popup has its own fixed-width header layout and is exempt.
- For "back to dashboard" navigation, use the icon-back pattern: an `<a id="back-btn">` wrapping the BiteGuard logo image, placed in `#header-left`. Never add a text "Back to dashboard" button.

## Communication
- Explain each step as if I'm learning, not just following along.
- Explain each new function, listener or code block you add.
- Short answers. No walls of text.
- If I push back on something, reconsider — don't just justify the original choice.
