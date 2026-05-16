# Skill ideas

Personal Claude Code skills to build for this project. Skills already
shipped live in `~/.claude/skills/`.

## Shipped

- `/pr` — create a GitHub PR with a grouped description (intro, New
features, Minor changes, Bug fixes) and labels picked from the repo.
- `/com` — stage and commit with a Conventional Commits message  
drafted from the diff.

## Workflow

- `/sync` — fetch and rebase or merge current branch onto latest
`develop`. Pick rebase vs. merge based on whether the branch is
shared and pushed.
- `/release` — merge `develop` into `main`, bump version in
`manifest.json`, create a git tag (e.g. `v1.2.0`), push the tag.
- `/changelog` — generate or append `CHANGELOG.md` entries from
commits since the last tag, grouped by Conventional Commits type
(Features / Fixes / Internal).
- `/new-branch <name>` — fetch, create a branch off the latest
`origin/develop`, switch to it.

## Code hygiene

- `/check-duplicates` — scan for duplicated CSS rules and JS logic
that could share a class or be extracted. Enforces the CLAUDE.md
rule against duplication.
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

## Documentation

- `/update-claude-md` — review CLAUDE.md against current code reality
and propose updates (new conventions that have emerged, rules
drifted from). Run periodically.

