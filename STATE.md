# STATE

Now: feature/cloud-sync — cloud-sync host landed: v2 log schema, WASM engine in the service worker, sync alarm; proven by the two-profile smoke. No UI yet.

## Recent (newest first, keep last 5)
- 2026-09-05: cloud-sync host / intervalLog v2, syncStorage.js, background/sync.js, CSP for wasm, vendored core / smoke 15 checks in real service workers.
- 2026-09-05: split / server + sync docs moved out of this repo / this repo is the extension only.
- 2026-09-04: rename CoralClock → Reeflect / 32 files / manifest 1.3.0 + changelog entry.

## Handoff
- Stopped at: sync host uncommitted; smoke 15/15 against a local Worker.
- Next step: user commits; then the account UI (create with phrase confirmation, link, unlock, devices, status) and a MINOR version bump.
- Verify on resume: `node scripts/os/sync-smoke.mjs` with `wrangler dev` up in ../reeflect-sync/server.

## Open questions
- none
