// Cloud-sync smoke: two real Chromium profiles sync through a local Worker, driven through the
// actual sync page UI for setup and the service worker for rows and ticks.
//   node scripts/os/sync-smoke.mjs            needs `wrangler dev` running in reeflect-sync/server
// Proves: the WASM core loads under the MV3 CSP, the setup UI works (phrase + 3-word confirmation),
// the Dexie v2 log feeds the engine, rows travel A → server → B, deletes propagate, sign-out is real.
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
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run", "--no-default-browser-check", "--window-size=900,700"],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const errors = [];
  sw.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`sw ${m.type()}: ${m.text()}`); });
  await sw.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
  await sw.evaluate((base) => chrome.storage.local.set({ _syncBaseUrl: base, _debug: true }), BASE);
  const id = new URL(sw.url()).host;
  const call = (fn, ...args) => sw.evaluate(([fn, args]) => globalThis.reeflectSync[fn](...args).then((v) => ({ ok: v }), (e) => ({ err: String(e?.message ?? e) })), [fn, args]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`page: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`page ${m.type()}: ${m.text()}`); });
  const openSync = async () => {
    await page.goto(`chrome-extension://${id}/src/pages/sync/sync.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("#card-off")?.style.display !== undefined);
  };
  return { ctx, sw, page, call, errors, openSync };
}
const visible = (page, sel) => page.$eval(sel, (el) => el.style.display !== "none");
const row = (domain, from) => ({ domain, path: "/", kind: "active", from, to: from + 60_000 });
const t0 = Date.now() - 3 * 3_600_000;

// ---------- device A: start syncing through the UI ----------

const a = await launch("a");
await a.call("appendIntervals", [row("a1.example", t0), row("a2.example", t0 + 120_000), row("doomed.example", t0 + 240_000)]);
await a.openSync();
check("sync page opens in the off state", await visible(a.page, "#card-off"));
await a.page.click("#start-btn");
await a.page.waitForSelector("#phrase-words li", { timeout: 30000 });
const words = await a.page.$$eval("#phrase-words li", (els) => els.map((e) => e.textContent));
check("start syncing shows 24 words (WASM ran in the page)", words.length === 24, words.slice(0, 3).join(" ") + " …");

await a.page.click("#phrase-next");
check("confirmation asks for 3 words", (await a.page.$$("#confirm-fields input")).length === 3);
// a wrong answer must be refused
const fieldIds = await a.page.$$eval("#confirm-fields input", (els) => els.map((e) => e.id));
await a.page.fill(`#${fieldIds[0]}`, "definitelywrong");
await a.page.click("#confirm-submit");
check("a wrong word is refused", await a.page.$eval("#confirm-error", (el) => !el.hasAttribute("hidden")) && await visible(a.page, "#card-confirm"));
for (const id of fieldIds) {
  const index = Number(id.replace("confirm-word-", ""));
  await a.page.fill(`#${id}`, words[index]);
}
await a.page.click("#confirm-submit");
await a.page.waitForFunction(() => document.querySelector("#card-on")?.style.display === "", null, { timeout: 30000 });
check("correct words switch the page to the on state", await visible(a.page, "#card-on"));
check("A's rows pushed on the first sync", (await a.page.textContent("#sync-status")).includes("Sent 3"), await a.page.textContent("#sync-status"));

const phrase = words.join(" ");
await a.page.waitForSelector(".device-row", { timeout: 30000 });
const devicesA = await a.page.$$eval(".device-row", (els) => els.length);
check("device list shows this device", devicesA === 1);

// ---------- device B: link through the UI ----------

const b = await launch("b");
await b.call("appendIntervals", [row("b1.example", t0 + 360_000)]);
await b.openSync();
await b.page.click("#link-open-btn");
await b.page.fill("#link-input", "not a real phrase at all");
await b.page.click("#link-submit");
check("a phrase that is not 24 words is refused", await b.page.$eval("#link-error", (el) => !el.hasAttribute("hidden")));
await b.page.fill("#link-input", phrase);
await b.page.click("#link-submit");
await b.page.waitForFunction(() => document.querySelector("#card-on")?.style.display === "", null, { timeout: 60000 });
check("B links with the phrase and syncs", (await b.page.textContent("#sync-status")).includes("received 3"), await b.page.textContent("#sync-status"));
check("B's log holds all 4 rows", (await b.call("count")).ok === 4);
await b.page.waitForSelector(".device-row:nth-child(2)");
check("B sees both devices", (await b.page.$$eval(".device-row", (els) => els.length)) === 2);

// ---------- rename, delete propagation, sign-out ----------

const rows = await b.page.$$(".device-row");
const meRow = (await b.page.$$eval(".device-row", (els) => els.findIndex((e) => e.textContent.includes("This device")))) + 1;
await b.page.click(`.device-row:nth-child(${meRow}) .device-actions button:first-child`);
await b.page.fill(".device-name-input", "Work laptop");
await b.page.click(`.device-row:nth-child(${meRow}) .device-actions button:first-child`);
await b.page.waitForFunction(() => document.body.textContent.includes("Work laptop"));
check("renaming a device sticks", (await b.page.textContent("#devices-list")).includes("Work laptop"), `${rows.length} rows`);
await a.openSync();
await a.page.waitForSelector(".device-row");
check("A sees the name B set (decrypted with the shared key)", (await a.page.textContent("#devices-list")).includes("Work laptop"));

check("B deletes A's row locally", (await b.call("deleteByDomain", "doomed.example")).ok === 1);
check("B pushes the delete", (await b.call("runSync")).ok?.lastReport?.pushed === 1);
await a.call("resetReconcileGate");
const runA2 = (await a.call("runSync")).ok;
check("A pulls B's row and reconciles the delete away", runA2?.lastReport?.pulled === 1 && runA2?.lastReport?.deletedLocal === 1, JSON.stringify(runA2));
check("both logs hold the same 3 rows", (await a.call("count")).ok === 3 && (await b.call("count")).ok === 3);

// A signs B out; B must fall back to the signed-out state and keep its rows.
await a.openSync();
await a.page.waitForSelector(".device-row");
const bRow = (await a.page.$$eval(".device-row", (els) => els.findIndex((e) => !e.textContent.includes("This device")))) + 1;
await a.page.click(`.device-row:nth-child(${bRow}) .device-actions button:nth-child(2)`);
await a.page.click("#confirm-dialog-ok");
await a.page.waitForFunction(() => document.getElementById("devices-list").textContent.includes("Signed out"), null, { timeout: 15000 });
check("A's registry shows B signed out", (await a.page.textContent("#devices-list")).includes("Signed out"));
check("B's tick reports the sign-out", (await b.call("runSync")).ok?.lastError === "NeedsReauth");
await b.openSync();
check("B's page shows the signed-out state", await visible(b.page, "#card-signed-out"));
check("B kept its rows after the sign-out", (await b.call("count")).ok === 3);

// ---------- alarm and errors ----------

const alarm = await a.sw.evaluate(async () => (await chrome.alarms.get("sync"))?.periodInMinutes ?? null);
check("sync alarm is scheduled", alarm !== null, `period ${alarm} min`);
check("no page or service-worker errors or warnings", a.errors.length === 0 && b.errors.length === 0, [...a.errors, ...b.errors].join(" | ").slice(0, 300));

await a.ctx.close();
await b.ctx.close();
console.log(failures ? `\n${failures} FAILED` : "\nall passed");
process.exit(failures ? 1 : 0);
