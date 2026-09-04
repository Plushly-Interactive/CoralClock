# Coding conventions — reasoning

TL;DR: why the rules in `docs/conventions.md` are what they are. Reference only; the rules themselves are binding, this file is not.

## The `&times;` entity
`textContent` never parses HTML entities, so a glyph assigned that way shows the literal text `&times;`. Assigning through `innerHTML` parses it. A toggle that swaps the glyph must therefore use `innerHTML` for that assignment too. The literal `×` character and the numeric `&#215;` entity are both banned so the codebase has one searchable form.

## `hidden` versus `style.display`
An empty string restores whatever display value the CSS declares, which is why JS toggling uses `style.display`. The `hidden` attribute is a static starting state only, because an id rule such as `#thing { display: flex }` outranks the browser's `[hidden] { display: none }` and the element stays visible.

## Background logging through `dbg()`
`dbg()` is gated on the `_debug` flag in `chrome.storage.local`, which keeps user URLs out of the console for normal users. New tracking features must log at their decision points — visit counted or not counted, state transitions, flushes — because that trace is the only practical way to diagnose overcounting. One exception: the `SERVICE WORKER STARTED` banner is logged unconditionally, since it runs at module load before `initDebug()` has read the flag, and it carries no URL data.

## Shared constants only on second use
A name used by one file stays a local string literal in that file. It becomes a shared constant in `prefKeys.js` or `queryTypes.js` the moment a second file needs it. This keeps the shared modules to names that genuinely cross file boundaries, and applies to any future "named string" of this kind.

## Storage tier defaults
Persistent settings import their `DEFAULT_*` constant from the module that owns the setting's meaning, never re-declaring it at the call site, so one edit changes the default everywhere. Per-tab view state is intentionally ephemeral and encodes its default in the read pattern instead (`!== 'false'` for on by default, `=== 'true'` for off).

## Positional substitution only
The custom locale override loader and the native `chrome.i18n.getMessage` both handle `$1` and `$2` identically. Named `$FOO$` placeholders behave differently between them, so messages would render correctly under one path and not the other.

## Changelog text outside `messages.json`
Per-release note text is one-off and never reused, so routing it through `messages.json` would grow that file forever with dead keys. Each changelog item carries its own `{ en, es, fr }` text, resolved at render time by `resolveLanguage()` in `i18n.js`. Only the per-release bullet text is exempt; the surrounding interface text (Dismiss, Close, category labels) follows the normal rule.
