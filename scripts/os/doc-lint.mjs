#!/usr/bin/env node
// doc-lint — enforces Writing Contract doc budgets at commit time (any agent, or no agent).
// Usage: node doc-lint.mjs --changed  (every .md changed vs HEAD, staged or not, plus untracked; used by pre-commit)
//        node doc-lint.mjs --all      (every tracked .md)
//        node doc-lint.mjs <files...> (explicit files)
// Override budgets: scripts/os/doc-budgets.json  e.g. {"STATE.md":20,"*":200,"exempt":["docs/appendix/"]}
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const DEFAULTS = {
  "STATE.md": 20, "AGENTS.md": 60, "README.md": 120, "LEDGER.md": 80,
  "DECISIONS.md": 200, "*": 120, // DECISIONS full? archive oldest half to docs/appendix/decisions-archive.md
};
// Token ceilings (est. chars/4): machine cost — catches long-line gaming that line counts miss.
// Always-loaded docs (AGENTS/STATE) get the tightest caps; override via doc-budgets.json "tokens".
const TOKEN_DEFAULTS = {
  "STATE.md": 300, "AGENTS.md": 900, "README.md": 1800, "LEDGER.md": 1200,
  "DECISIONS.md": 3000, "*": 1800,
};
const estTokens = (text) => Math.ceil(text.length / 4);
const MAX_PARAGRAPH = 4;   // consecutive prose lines before it counts as a wall
const TLDR_THRESHOLD = 30; // docs longer than this must open with a TL;DR

// Structural checks: returns violation strings (empty = clean).
// Skips fenced code blocks; bullets/tables/headings/quotes don't count as prose.
function structuralIssues(text) {
  const issues = [];
  const lines = text.split("\n");
  if (lines.length > TLDR_THRESHOLD && !lines.slice(0, 6).some((l) => /tl;?dr/i.test(l)))
    issues.push(`missing TL;DR in first lines (required for docs > ${TLDR_THRESHOLD} lines)`);
  let inCode = false, run = 0, runStart = 0;
  const isProse = (l) => l.trim() !== "" && !/^\s*([#>|\-*+]|\d+[.)]|```|<!--|---)/.test(l);
  for (let i = 0; i <= lines.length; i++) {
    const l = lines[i] ?? "";
    if (/^\s*```/.test(l)) { inCode = !inCode; run = 0; continue; }
    if (!inCode && isProse(l)) { if (run === 0) runStart = i + 1; run++; }
    else {
      if (run > MAX_PARAGRAPH) issues.push(`prose wall at line ${runStart}: ${run} consecutive lines (max ${MAX_PARAGRAPH}) — break into bullets, table, or headings`);
      run = 0;
    }
  }
  return issues;
}
// Single appendix location per repo: docs/appendix/ — nested appendix dirs are NOT exempt (user decision).
// Defaults carry ONLY universal conventions; repo-specific exemptions belong in that repo's doc-budgets.json.
const DEFAULT_EXEMPT = ["docs/appendix/", "node_modules/"];

function repoRoot() {
  try { return execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim(); }
  catch { return process.cwd(); }
}

function loadBudgets(root) {
  const p = path.join(root, "scripts", "os", "doc-budgets.json");
  if (!existsSync(p)) return { budgets: DEFAULTS, tokenBudgets: TOKEN_DEFAULTS, exempt: DEFAULT_EXEMPT };
  try {
    const cfg = JSON.parse(readFileSync(p, "utf8"));
    const { exempt, tokens, ...budgets } = cfg;
    return { budgets: { ...DEFAULTS, ...budgets }, tokenBudgets: { ...TOKEN_DEFAULTS, ...(tokens ?? {}) }, exempt: [...DEFAULT_EXEMPT, ...(exempt ?? [])] };
  } catch { return { budgets: DEFAULTS, tokenBudgets: TOKEN_DEFAULTS, exempt: DEFAULT_EXEMPT }; }
}

// Every changed .md — vs HEAD (staged or not) plus untracked. Nothing needs to be staged to be checked.
function changedMdFiles() {
  let diff = "";
  try { diff = execSync('git diff --name-only --diff-filter=ACMR HEAD -- "*.md"', { encoding: "utf8" }); }
  catch {} // no HEAD yet (fresh repo): everything shows up as untracked below
  const untracked = execSync('git ls-files --others --exclude-standard -- "*.md"', { encoding: "utf8" });
  return [...new Set((diff + "\n" + untracked).split("\n").map((f) => f.trim()).filter((f) => f.endsWith(".md")))];
}

function allMdFiles() {
  const out = execSync('git ls-files -- "*.md"', { encoding: "utf8" });
  return out.split("\n").filter((f) => f.trim().endsWith(".md"));
}

const root = repoRoot();
const { budgets, tokenBudgets, exempt } = loadBudgets(root);
const args = process.argv.slice(2);
const mode = args.includes("--all") ? "all" : args.includes("--changed") ? "changed" : "list";
const files = mode === "all" ? allMdFiles() : mode === "changed" ? changedMdFiles() : args.filter((a) => !a.startsWith("--"));
// A bare invocation checks nothing — that must never look like a clean pass (exit 2, not 0/1).
if (mode === "list" && files.length === 0) {
  console.error("doc-lint: no files given — NOTHING was checked. Use --changed, --all, or pass .md paths.");
  process.exit(2);
}

let failed = false;
let checked = 0;
for (const rel of files) {
  const norm = rel.replace(/\\/g, "/");
  // exempt entries match at path-segment boundaries: "appendix/" hits docs/x/appendix/ but not docs/myappendix/
  if (exempt.some((e) => norm === e || norm.startsWith(e) || norm.includes("/" + e))) continue;
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
  if (!existsSync(abs)) {
    failed = true;
    console.error(`doc-lint: ${rel} not found — a bad path must not pass as clean`);
    continue;
  }
  checked++;
  const text = readFileSync(abs, "utf8");
  const lines = text.split("\n").length;
  const base = path.basename(rel);
  const budget = budgets[base] ?? budgets["*"];
  if (lines > budget) {
    failed = true;
    console.error(`doc-lint: ${rel} is ${lines} lines (budget ${budget}) — trim, or move detail to docs/appendix/`);
  }
  const tokBudget = tokenBudgets[base] ?? tokenBudgets["*"];
  const tok = estTokens(text);
  if (tok > tokBudget) {
    failed = true;
    console.error(`doc-lint: ${rel} is ~${tok} tokens (budget ${tokBudget}) — this doc costs every session that loads it; densify or move to docs/appendix/`);
  }
  for (const issue of structuralIssues(text)) {
    failed = true;
    console.error(`doc-lint: ${rel} — ${issue}`);
  }
}
if (failed) {
  console.error("doc-lint: commit blocked. (Deliberate exception? Add path to scripts/os/doc-budgets.json exempt list.)");
  process.exit(1);
}
console.log(`doc-lint: ${checked} file(s) checked, clean`);
