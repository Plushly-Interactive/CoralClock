# Skill ideas

Personal Claude Code skills to build for this project. Skills already
shipped live in `~/.claude/skills/`.

## Workflow

- `/release` — merge `develop` into `main`, bump version in
  `manifest.json`, create a git tag (e.g. `v1.2.0`), push the tag.
- `/changelog` — generate or append `CHANGELOG.md` entries from
  commits since the last tag, grouped by Conventional Commits type
  (Features / Fixes / Internal).
- `/recap` — at session start, summarize what changed since last
  session: recent commits, branch status, uncommitted work, open PRs.
  Helps context-switch in.
- `/checkpoint` — save the current decision or plan into a dated note
  in `docs/decisions/` so context isn't lost across sessions.

## Coding & collaboration

- `/explain <file-or-symbol>` — walk through a file or function in
  teaching mode, citing line numbers, tracing data flow, calling out
  non-obvious bits.
- `/why <file:line>` — git blame + commit message + linked PR + any
  related CLAUDE.md rule for a specific line. Answers "why is this
  here?"
- `/rubber-duck <problem>` — ask clarifying questions before
  suggesting solutions, to avoid jumping straight to code.

## Code hygiene

- `/check-debug` — find stray `console.log`, `debugger`, `TODO`
  markers, commented-out code blocks before a commit or PR.

## Extension-specific

- `/manifest-audit` — check `manifest.json`: are all declared
  permissions actually used in code? Any code paths that need a
  permission that isn't declared? Useful before a Chrome Web Store
  submission.

## Planning

- `/scope <feature>` — given a feature idea, list the files likely to
  need changes, surfaces involved (popup / options / background /
  content script), and any tracking data implications. Read-only.
- `/feature <idea>` — structured intake: clarifying questions → user
  stories → acceptance criteria → edge cases → out-of-scope. Outputs
  a markdown spec in `docs/features/<slug>.md`.
- `/user-flow <feature>` — write step-by-step user journeys (happy
  path + 2–3 edge paths) as numbered scenarios. Read-only output.
- `/edge-cases <feature-or-file>` — enumerate edge cases, error
  conditions, and "what if the user does X" scenarios for a feature
  or piece of code.
- `/competitor-scan <feature>` — websearch how other tools (StayFocusd,
  LeechBlock, Cold Turkey) handle a given UX problem, summarize
  approaches and tradeoffs.

## Architecture & documentation

Diagrams use **Mermaid** (fenced code blocks in `.md` files — renders
on GitHub and in VSCode with the Markdown Preview Mermaid Support
extension, no CLI needed).

- `/arch-map` — generate or refresh `docs/architecture.md`: surfaces,
  data flow, storage schema, message-passing routes. Derived from
  actual code. Includes a Mermaid flowchart of the surface topology.
- `/data-flow <feature>` — trace how data moves for one feature: which
  script reads it, which writes it, where it's persisted, what
  messages cross contexts. Output as a Mermaid sequence diagram.
- `/storage-schema` — document the current `chrome.storage` schema
  (keys, shapes, owners) from code. Flags keys read-but-never-written
  and vice versa. Output as a Mermaid ER diagram.
- `/adr <decision>` — Architecture Decision Record: prompts for
  context / options / decision / consequences, writes a numbered ADR
  in `docs/adr/`.
- `/dep-graph` — list internal JS module dependencies and flag cycles
  or orphan files. Output as a Mermaid graph.
  _(Later: explore Graphviz DOT for richer layout when the graph grows
  large — needs the Graphviz CLI.)_

## UI & visual sketching

- `/wireframe <page>` — ASCII wireframe of a popup / options / subpage
  layout. Fast iteration before HTML/CSS.
- `/mock-html <description>` — generate a throwaway static HTML + CSS
  mock (no JS, no extension wiring) in `mocks/` to preview a UI idea
  in a browser.
- `/component-sketch <name>` — propose 2–3 visual variants of a UI
  component as ASCII previews so you can pick one.
- `/css-audit <selector-or-page>` — list every rule affecting a given
  element, flag dead or duplicated styles. Complements
  `/check-duplicates`.
- `/a11y-check` — scan changed HTML for accessibility issues: missing
  labels, keyboard traps, ARIA misuse.
