# STATE

Now: feature/cloud-sync — app renamed to Reeflect, manifest 1.3.0; cloud-sync server and docs moved out of this repo.

## Recent (newest first, keep last 5)
- 2026-09-05: split / server + sync docs moved out of this repo / this repo is the extension only.
- 2026-09-04: rename CoralClock → Reeflect / 32 files / manifest 1.3.0 + changelog entry.
- 2026-09-04: what's new bar no longer shows empty / changelog.css + manifest 1.2.2.

## Handoff
- Stopped at: split committed locally, not pushed.
- Next step: user pushes, merges feature/cloud-sync into develop; extension client work waits on the Rust core, built elsewhere.
- Verify on resume: `node scripts/os/capture.mjs --view dashboard`

## Open questions
- none
