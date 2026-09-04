# DECISIONS

TL;DR: consequential choices, newest first, ≤5 lines each. Format: Date · Decision · Why · Rejected · Consequence.

2026-09-04 · The app is renamed CoralClock → Reeflect before cloud sync starts
Why: the name must be final before the crypto domain strings (`reeflect/…/v1`) and the server are built; renaming later would mean a key migration.
Rejected: keeping `coralclock/` in the crypto contract under the new name (confusing forever, no benefit); a partial rename leaving docs or the privacy policy on the old name.
Consequence: manifest 1.3.0 with a changelog entry; the settings changelog link points at github.com/Plushly-Interactive/Reeflect and breaks until the repo is renamed; logo artwork is unchanged.

2026-09-04 · Screenshots come from Playwright loading the unpacked extension
Why: the project has no dev server, so a browser launched by the capture script is the only way an agent can see a page.
Rejected: manual-only testing (agent cannot verify visual changes); a headless page served over http (extension APIs would be missing).
Consequence: adds a package.json and a ~115 MB Chromium download; every capture starts from an empty profile, so pages show "no data" unless seeded.

2026-09-04 · Capture setup steps live in capture.config.mjs, not in the backend
Why: suppressing first-run overlays and seeding data are project facts; keeping the backend generic lets agent-os sync it.
Rejected: a Reeflect-only backend (drifts from the shared one, never gets fixes).
Consequence: the backend file must stay identical to the agent-os copy; project setup goes in the config's prepare list.

2026-09-04 · Finished and rejected specs move to docs/appendix/ whole, live specs keep only their reference half
Why: 24 of 30 docs were over budget; most of the weight was build-order logs and per-file change tables nobody reads twice.
Rejected: raising the budgets (hides the cost); deleting the history (loses the reasoning).
Consequence: 58.8k tokens of docs became 23.4k outside the appendix, nothing deleted. docs/architecture/tracking-internals.md was found stale — it describes a deleted src/tracking.js — and is now marked as such in the appendix.
