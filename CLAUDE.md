# BiteGuard – Project Rules

## Project context
- Browser extension targeting Vivaldi (Chromium, Manifest V3)
- Goal: block websites after a configurable time limit (per hour / day / week)

## How we work together
- Work incrementally. One step at a time, in natural order.
- Before creating or deleting any file, say what you're about to do and why. Wait for confirmation.
- Before introducing a new tool or dependency, explain what it does and why we need it now.
- When something can be done in multiple ways, present the options and let me choose.

## Code style
- Minimal. Only write what is needed for the current step.
- No comments unless the logic is genuinely non-obvious.
- No abstractions or helpers until there is a concrete reason for them.

## JavaScript / HTML
- Every interactive DOM element must have an `id`. Always select with `querySelector('#id')` in JavaScript, never `getElementById`.
- Use classes for CSS styling (shared styles across elements). Use ids for JS selection. An element can have both.

## Communication
- Explain each step as if I'm learning, not just following along.
- Short answers. No walls of text.
- If I push back on something, reconsider — don't just justify the original choice.
