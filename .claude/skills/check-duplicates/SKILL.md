---
name: check-duplicates
description: Scan the project for duplicated CSS rules, JS function bodies, repeated string literals, repeated DOM lookups, duplicate HTML ids, and repeated HTML markup blocks. Reports findings only — does not edit.
model: sonnet
effort: medium
allowed-tools: Grep Glob Read
---

# Check duplicates

Scan the project for code duplication that should be deduplicated per
the CLAUDE.md rules. Read-only — report findings, do not edit.

## Scope (what to check)

### CSS (`src/**/*.css`)
1. **Identical property sets across different selectors** — two
   selectors with the exact same block of declarations. Candidate for
   sharing a class.
2. **Same selector defined twice** in the same file or across files.
   Usually an accidental duplicate.

### JS (`src/**/*.js`)
3. **Identical function bodies across files** — same function body
   appearing in two or more files. Candidate for extraction to
   `src/shared/`.
4. **Repeated string literals (3+ occurrences)** — same quoted string
   appearing 3+ times across the codebase. Candidate for a constant.
   Ignore trivial strings (`""`, single chars, pure whitespace, common
   words like `"px"`, `"none"`).
5. **Repeated `querySelector('#id')` calls within a single file** —
   the same id selected more than once in the same file. Cache the
   lookup at the top of the file or in `init`.

### HTML (`src/**/*.html`, `docs/**/*.html`)
6. **Duplicate `id` attributes** — same `id` value on more than one
   element in the same file. This is a bug per CLAUDE.md.
7. **Repeated markup blocks** — identical sequences of 5+ consecutive
   non-empty HTML lines across files. Candidate for templating.

## Steps

1. Use `Glob` to enumerate files in each category.
2. For each category, use `Grep` (with appropriate patterns and
   `output_mode: content` / `-n`) to gather what you need. Prefer
   broad single passes over many narrow searches.
3. For CSS rule comparison, normalize whitespace (collapse runs of
   spaces/newlines, strip leading/trailing whitespace per declaration)
   before comparing property blocks — formatting differences should
   not hide real duplicates.
4. For repeated string literals, build a count map keyed by the
   literal value; report entries with count ≥ 3 along with the
   locations.
5. For repeated `querySelector('#id')` lookups, group by `(file, id)`
   and report pairs with count ≥ 2.
6. For HTML duplicate ids, parse each file's `id="..."` attributes
   and report ids appearing more than once in the same file.
7. For repeated HTML markup blocks, compare 5-line sliding windows
   across HTML files. Skip windows that are only whitespace or
   closing tags.

## Output format

Report findings grouped by category, in this structure. Skip any
category with no findings — don't print empty headings.

**Number findings continuously across all categories**, starting at
1. Numbers must not reset per section — the user uses them to
reference specific findings (e.g. "fix #3 and #7").

```
## CSS — identical property sets
1. `src/pages/site/site.css:42` and `src/pages/path/path.css:18`
   share the same property set (5 declarations). Suggest: extract
   to a shared class in `src/shared/theme.css`.

## CSS — duplicate selectors
2. `.chart-axis-label` defined in `src/shared/theme.css:120`
   and again at `src/pages/dashboard/dashboard.css:55`.

## JS — identical function bodies
3. `formatDuration` in `src/pages/site/site.js:88` and
   `src/pages/path/path.js:42`. Suggest: move to
   `src/shared/timeUtils.js`.

## JS — repeated string literals
4. `"hideShort"` appears 4 times: `dashboard.js:30`, `site.js:55`,
   `path.js:67`, `drill.js:12`. Suggest: extract to a constant.

## JS — repeated DOM lookups
5. `querySelector('#chart-time')` called 3 times in
   `src/pages/site/site.js` (lines 22, 89, 145). Suggest: cache once.

## HTML — duplicate ids
6. `id="filter"` appears twice in `src/pages/dashboard/dashboard.html`
   (lines 30, 88).

## HTML — repeated markup blocks
7. 7-line block identical between `src/pages/site/site.html:40-46`
   and `src/pages/path/path.html:55-61`. Suggest: review if these
   can share a partial.
```

End the report with a one-line summary (e.g. "7 findings across 6
categories" or "No duplicates found"). Do NOT propose or perform
edits — the user reviews and decides which findings to act on.

## Notes

- Skip files under `docs/subpage-tracking/mockups/` for HTML markup
  comparison — those are mockups, repetition is expected.
- Skip `node_modules/`, `dist/`, `build/` if present.
- Do not flag duplication that exists inside `src/shared/` —
  shared modules are the destination for deduplication, not the
  source.
