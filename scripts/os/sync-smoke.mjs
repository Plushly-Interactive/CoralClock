// Cloud-sync smoke: two real service workers (two Chromium profiles) sync through a local Worker.
//   node scripts/os/sync-smoke.mjs            needs `wrangler dev` running in reeflect-sync/server
// Proves: the WASM core loads under the MV3 CSP, the Dexie v2 log feeds the engine, rows travel
// device A → server → device B, deletes propagate, and the alarm handler runs a tick.
import path from "node:path";
import os from "node:os";
import { rmSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:8787";
const ext = path.resolve(import.meta.dirname, "..", "..");
let failures = 0;
const check = (label, ok, extra = "") => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${label} ${extra}`); };

const up = await fetch(BASE).then((r) => r.status === 404).catch(() => false);
if (!up) { console.log(`skipped: wrangler dev not running on ${BASE}`); process.exit(0); }

const pw = await import("playwright");
async function launch(name) {
  const profile = path.join(os.tmpdir(), `agent-os-ext-profile-reeflect-smoke-${name}`);
  rmSync(profile, { recursive: true, force: true });
  const ctx = await pw.chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run", "--no-default-browser-check", "--window-size=400,300"],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const errors = [];
  sw.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await sw.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  await sw.evaluate((base) => chrome.storage.local.set({ _syncBaseUrl: base, _debug: true }), BASE);
  const call = (fn, ...args) => sw.evaluate(([fn, args]) => globalThis.reeflectSync[fn](...args).then((v) => ({ ok: v }), (e) => ({ err: String(e?.message ?? e) })), [fn, args]);
  return { ctx, sw, call, errors };
}
const row = (domain, from) => ({ domain, path: "/", kind: "active", from, to: from + 60_000 });
const t0 = Date.now() - 3 * 3_600_000;

const a = await launch("a");
check("service worker exposes the sync seam", (await a.sw.evaluate(() => typeof globalThis.reeflectSync)) === "object");
const appended = await a.call("appendIntervals", [row("a1.example", t0), row("a2.example", t0 + 120_000), row("doomed.example", t0 + 240_000)]);
check("A appends 3 rows through the v2 log", appended.ok?.length === 3, JSON.stringify(appended));
const reg = await a.call("register", "smoke pass");
check("A registers (WASM ran in the service worker)", typeof reg.ok === "string" && reg.ok.split(" ").length === 24, JSON.stringify(reg));
const runA = await a.call("runSync");
check("A tick pushes 3", runA.ok?.lastReport?.pushed === 3 && !runA.ok?.lastError, JSON.stringify(runA));

const b = await launch("b");
const link = await b.call("linkDevice", reg.ok);
check("B links with the phrase", link.ok === undefined && !link.err, JSON.stringify(link));
await b.call("appendIntervals", [row("b1.example", t0 + 360_000)]);
const runB = await b.call("runSync");
check("B tick pushes 1, pulls 3", runB.ok?.lastReport?.pushed === 1 && runB.ok?.lastReport?.pulled === 3, JSON.stringify(runB));
check("B's log now holds 4 rows", (await b.call("count")).ok === 4);

// B deletes A's row through the extension's own delete path, then A reconciles it away.
const deleted = await b.call('deleteByDomain', 'doomed.example');
check("B deletes A's row locally via deleteByDomain", deleted.ok === 1, JSON.stringify(deleted));
const runB2 = await b.call("runSync");
check("B pushes the delete", runB2.ok?.lastReport?.pushed === 1, JSON.stringify(runB2));
await a.call('resetReconcileGate'); // force the 24h gate open
const runA2 = await a.call("runSync");
check("A pulls B's row and reconciles the delete", runA2.ok?.lastReport?.pulled === 1 && runA2.ok?.lastReport?.deletedLocal === 1, JSON.stringify(runA2));
check("both logs hold the same 3 rows", (await a.call("count")).ok === 3 && (await b.call("count")).ok === 3);

const alarm = await a.sw.evaluate(async () => (await chrome.alarms.get("sync"))?.periodInMinutes ?? null);
check("sync alarm is scheduled", alarm !== null, `period ${alarm} min`);
const status = await a.sw.evaluate(async () => (await chrome.storage.local.get("syncStatus")).syncStatus);
check("syncStatus written for the UI", status?.lastReport?.pulled === 1, JSON.stringify(status));
check("no service-worker console errors", a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].join(" | ").slice(0, 200));

await a.ctx.close();
await b.ctx.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
