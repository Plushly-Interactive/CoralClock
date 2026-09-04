# STATE

Now: develop — agent-os installed; manifest is at 1.2.1 with no matching tag yet.
Next:
- Fix the always-visible empty what's new bar (`display: flex` beats `hidden` in changelog.css).
- Decide whether 1.2.1 gets a tag and release.

## Recent (newest first, keep last 5)
- 2026-09-04: doc-diet across all docs / 24 files fixed, 13 moved to appendix / 58.8k to 23.4k tokens outside appendix.
- 2026-09-04: agent-os init / AGENTS.md + scripts/os + git hooks / capture works via Playwright, --seed fills data.
- 2026-09-04: popup height fix for Vivaldi 8.2 / src/pages/popup.

## Handoff
- Stopped at: nothing committed; the working tree holds all of it.
- Next step: user reviews and commits.
- Verify on resume: `node scripts/os/capture.mjs --view dashboard`

## Open questions
- none
