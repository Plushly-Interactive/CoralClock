# DECISIONS

TL;DR: consequential choices, newest first, ≤5 lines each. Format: Date · Decision · Why · Rejected · Consequence.

2026-09-04 · Screenshots come from Playwright loading the unpacked extension
Why: the project has no dev server, so a browser launched by the capture script is the only way an agent can see a page.
Rejected: manual-only testing (agent cannot verify visual changes); a headless page served over http (extension APIs would be missing).
Consequence: adds a package.json and a ~115 MB Chromium download; every capture starts from an empty profile, so pages show "no data" unless seeded.

2026-09-04 · Capture setup steps live in capture.config.mjs, not in the backend
Why: suppressing first-run overlays and seeding data are project facts; keeping the backend generic lets agent-os sync it.
Rejected: a CoralClock-only backend (drifts from the shared one, never gets fixes).
Consequence: the backend file must stay identical to the agent-os copy; project setup goes in the config's prepare list.
