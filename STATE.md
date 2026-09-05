# STATE

Now: feature/cloud-sync — sync is user-facing: the Sync page (start, link, devices, phrase, stop) and a settings card. Manifest 1.4.0. No passphrase; the key rests in storage.local.

## Recent (newest first, keep last 5)
- 2026-09-05: sync UI / src/pages/sync/ + settings card, 63 strings in 3 locales, manifest 1.4.0 / smoke 23 checks drive the real page.
- 2026-09-05: cloud-sync host / intervalLog v2, syncStorage.js, CSP for wasm, vendored core / smoke in real service workers.
- 2026-09-05: split / server + sync docs moved out of this repo / this repo is the extension only.
- 2026-09-04: rename CoralClock → Reeflect / 32 files / manifest 1.3.0 + changelog entry.

## Handoff
- Stopped at: sync UI uncommitted. Real profile verified: 53,486 rows upgraded to v2 and synced, queue drained.
- Next step: user commits; then deploy the Worker to Cloudflare so two real browsers can sync off localhost.
- Verify on resume: `node scripts/os/sync-smoke.mjs` with `wrangler dev` up in ../reeflect-sync/server; `node scripts/os/capture.mjs --view sync`.

## Open questions
- Remote D1 write limits for a ~50k-row first sync unchecked; push_all drains the queue in one tick.
