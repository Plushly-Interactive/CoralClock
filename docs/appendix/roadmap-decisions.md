# Decision log

> **You should rarely need this.** The specs state *what*; this states *why*, with
> sources. Open it when you want to challenge or revisit a decision — not to build.

Each entry: the decision, what was rejected, and the evidence. Newest first.

---

## Core crate

### Core owns the sync loop (2026-08-01)

**Rejected:** a "sans-IO" core returning `Step` descriptions for the host to execute.

`async`/`await` in Rust **is** a compiler-generated state machine — sans-IO means
hand-writing one. The sync sequence has ~13 IO points (auth challenge, verify, token
store, read dirty, push, clear dirty, pull page, upsert mirror, advance cursor,
reconcile listing, read local listing, delete local, update `lastReconciledAt`) with two
pagination loops. Sans-IO turns each into a `Step` variant + a state-enum variant +
marshalling both ways, and the driver loop is written once per host. Owning the loop
turns each into one `.await`. Per-host database and HTTP adapters cost the same either
way, so that is the whole difference.

It also contradicts the premise of a shared core: a sequencing loop written per host is
per-host logic.

### AFIT + generics, never `dyn` (2026-08-01)

The worry was that async traits can't span WASM and native. They can, but only in this
shape:

| Fact | Source |
|---|---|
| `JsValue` holds `PhantomData<*mut u8>` ⇒ `!Send`, propagating to any future containing it. Every IndexedDB/`fetch` future is therefore `!Send`. | [wasm-bindgen #2753](https://github.com/wasm-bindgen/wasm-bindgen/issues/2753) |
| `tauri::async_runtime::spawn` requires `F: Future + Send + 'static`; no `spawn_local` exists. | [docs.rs/tauri](https://docs.rs/tauri/latest/tauri/async_runtime/index.html) |
| `wasm_bindgen_futures::spawn_local` requires only `Future<Output = ()> + 'static` — **no `Send`**. | [docs.rs](https://docs.rs/wasm-bindgen-futures/latest/wasm_bindgen_futures/fn.spawn_local.html) |
| AFIT (stable 1.75) puts **no implicit `Send` bound** on the returned future and infers none; each impl decides. Not object-safe. | [Rust blog](https://blog.rust-lang.org/2023/12/21/async-fn-rpit-in-traits/) |

Each target monomorphizes to exactly the `Send`-ness its launcher wants. No
`async_trait`, no `?Send`, no boxing, no
[`trait_variant`](https://docs.rs/trait-variant/latest/trait_variant/).

**Constraints this rests on:** generics only (AFIT isn't object-safe, and a trait object
forces a single baked-in `Send` choice); no `!Send` value held across an `await` in core
code; MSRV 1.75.

### The core builds `Time`; hosts write no time code (2026-08-01)

**Rejected:** hosts build `Time` themselves.

Rust std has no timezone support at all (`SystemTime` is UTC-only), so a tzdb is required
*somewhere*. In the core it is one ~10-line function; per-host it is JS offset-sampling
with a binary search for transitions **plus** the Rust equivalent — two places for DST to
diverge, for no benefit. jiff's `js` feature needs no host help: `Intl.DateTimeFormat`
for the zone, `Date.now()` for the time.

**The size objection did not survive measurement.** jiff's `tzdb-bundle-platform` is
forced on for WASM, but [`jiff-tzdb` is a ~240 kB package](https://docs.rs/crate/jiff-tzdb/latest)
against a **2 GB** Chrome Web Store limit and **200 MB** on AMO. An earlier draft
rejected bundling on "store-policed size" — a constraint that does not exist.

**Never `chrono::Local` or `time`'s `local-offset`.** Both call `localtime_r`, which
reads `TZ` without synchronisation and can segfault in multithreaded Unix programs
([RUSTSEC-2020-0159](https://rustsec.org/advisories/RUSTSEC-2020-0159.html),
[RUSTSEC-2020-0071](https://rustsec.org/advisories/RUSTSEC-2020-0071)); `time`'s
mitigation returns `None` on affected OSes. Tauri runs a multithreaded tokio runtime.

### `Time` is a struct, and `now_ms` lives inside it (2026-08-01)

A `Clock` trait was dropped — every use sat at tick entry, so a value does the same job
with one less trait and one less test fake.

`now_ms` is *inside* `Time` rather than beside it because the offsets are only valid for
a window anchored at an instant. Separate arguments allow a snapshot built at one time to
be paired with a much later `now_ms`; across a DST transition that silently yields the
wrong offset. Folding them makes the invalid pairing unrepresentable.

It stays a struct rather than an ambient lookup so golden vectors don't depend on the CI
runner's timezone.

### Aggregation splits at the correctness line (2026-08-01)

Enforcement-window aggregation (`usage_since`, `compute_overage`, `union_len`, `cell_ms`)
is in the core because a combined cross-device limit must reach the **same verdict** on
every device. Dashboard aggregation (`build()`, visits, `wallByHour`,
`getAvgPerClockHour`) stays in JS — every client runs the same web UI, so it is already
shared, and moving it is a read-path rewrite with no correctness payoff.

### Errors: outcomes vs failures (2026-08-01)

Split on "could the tick proceed?". Outcomes (including `undecryptable`, expected after a
DEK reset) go in `TickReport`; `CoreError` is only for "cannot proceed". Retry and
backoff are the core's, so `Transport` is informational — otherwise retry policy leaks
back into hosts as per-host logic.

### Per-tick engine construction in the extension (2026-08-01)

In MV3 the service worker's whole JS context is torn down when idle, so a "long-lived"
engine outlives nothing. The real cost is WASM module instantiation, paid on SW startup
by the import either way. Caching the engine in module scope buys a struct construction
and adds a stale-state failure mode. Under Tauri the process is long-lived, so one engine
in app state — same core code, no conditional.

---

## Cloud sync

### Never auto-prune (2026-08-01)

Deletion only on explicit user action. Matches the shipped product, which has no
automatic expiry either — its tools collapse detail (`dropPathsBefore`) or prune on a
user-reviewed scan, but never expire on a timer.

**Accepted consequence:** the row set grows without bound. Measured baseline **~600
rows/day/device** (29,314 rows over 7 weeks), so three devices over five years is ~3.3M
rows. That is why whole-log queries are paginated and reconciliation streams. Server cost
per user rises linearly with account age — a pricing question, not a mechanism gap.

### Reconciliation uses `/sync/ids` + a digest, not `/sync/pull?since=0` (2026-08-01)

Under never-prune, reusing the pull route would fetch **full ciphertext rows** for the
entire log, per device, per day (~1.3M rows at three devices over two years, growing
forever). Identities are ~an order of magnitude smaller, and the digest usually avoids
fetching even those.

**The digest must cover the `(device_id, local_id)` pair.** An earlier draft XORed bare
`local_id`s — broken, because `local_id` is each device's local `++id` so every device
numbers from 1; shared ids XOR to zero and cancel. With sequential numbering that cancels
most of the set, and deleting the matching row on two devices would leave the digest
unchanged, suppressing exactly the walk meant to catch it.

The client computes `row_tag`, so the Worker only XORs an opaque value in and out — the
dumb-relay property holds.

### Derived aggregates are cached per day, not rebuilt (2026-08-02)

`intervalAggregates` loading the whole log via `toArray()` does not survive never-prune —
3 devices over 5 years is ~3.3M rows, hundreds of MB of JS objects in a service worker.

The property that makes the fix cheap: **a closed day's aggregates are immutable.** Only
today is live, so everything else is computed once and cached, and peak memory drops to
one day of rows (~1,800). Only a deletion — or a pulled mirror row landing in a past day
— invalidates a closed day. Same shape as the legacy
[aggregates-indexeddb](../features/storage-aggregates-indexeddb.md) design.

### Store R wrapped under the DEK (2026-08-02)

Without it the recovery phrase is **unviewable after setup**, since R is otherwise never
persisted — a user who lost their written copy but is still logged in would have no path
back. Storing it wrapped under the DEK (like `wrappedSigningKey`) is near-neutral on
security: anyone with an unlocked DEK already owns the account. It does not weaken the
lockout guarantee, because losing both the passphrase and the phrase still loses the
account.

Setup forces a **confirmation re-entry** of 3 random words before the account activates —
the standard wallet-seed pattern — and then never nags, since the phrase is re-viewable
on demand.

### Sync cadence scales with the tightest limit (2026-08-02)

**Overshoot ≤ `S × (N−1)`** for sync gap `S` and `N` active devices — and it does *not*
depend on the remaining budget, because the staleness is in what you know about *other*
devices. A device sitting at 0% can still be `S` minutes ignorant of a peer that burned
the whole budget.

That makes any fixed cadence wrong: 5 min against a 4 h/day limit is a 2% error, but
against a **10 min/hour** limit it is **50%**. So
`S = clamp(L_tightest / (10 × max(1, N−1)), 1 min, 5 min)`, holding worst-case overshoot
to ~10% of the tightest limit at any size.

Escalations reuse existing machinery: the shipped `APPROACHING_THRESHOLD` (80%) drops to
the 1 min floor, and navigation to a near-limit site syncs before deciding — bounded by
navigation rather than a clock. A single device needs no opportunistic sync at all.

<sub>An earlier draft scaled by <em>remaining</em> budget. Wrong axis: remaining tells you about your own consumption, not your ignorance of everyone else's.</sub>

### Paid tiers: architecture decided, business question deferred (2026-08-02)

*If* ever paid, billing gets a **separately-keyed id with no stored mapping** to
`users.id` — the `users.id` / `account_id` split already provides that seam, so it is a
policy choice at the time rather than a rework. Whether to charge at all blocks nothing.

### OHTTP: opt-in, post-v1, needs no preparation (2026-08-02)

Previously recorded as "blocked on an external partner". That conflated *when we can
deploy it* with *what we must decide*. Three things were decidable now.

**It needs no architectural preparation.** OHTTP encapsulates a **complete** Binary HTTP
request — method, target, headers, body ([RFC 9292](https://www.rfc-editor.org/rfc/rfc9292.html),
`message/bhttp`). `Http::send(req: Request)` already receives exactly that, because the
core builds the whole request. Adoption is: encapsulate before returning the `Request`,
point it at the relay. Trait, hosts and Worker untouched.

<sub>Accidental fit — <code>Http</code> was made transport-only to keep token and endpoint handling in the core, not for OHTTP.</sub>

**It lives in the core, not the host's `Http` impl.** HPKE encapsulation is crypto, and
all crypto is core-side. The host still just posts bytes to a URL.

**Opt-in, never mandatory.** A relay is a hard availability dependency — if it is down,
sync is down. Mandatory OHTTP hands a third party the power to break sync for every user.
Opt-in confines that to people who chose the tradeoff. The cost is that the gateway can
tell an account always arrives via relay, which is a weak signal and not the IP.

**Key acquisition is ours to define**, since [RFC 9458](https://www.rfc-editor.org/rfc/rfc9458.html)
deliberately does not: fetch `application/ohttp-keys` from our own gateway over
authenticated HTTPS, integrity-protected and attributable to the gateway, or a client can
be steered onto an attacker's key.

**Unlinkability is unreachable, and the RFC says so.** It names *"identity information and
authentication credentials"* as correlation vectors and requires clients to avoid linkable
auth across requests. Ours carries a stable token by necessity. The claim earned is *"the
server never learns your IP"* — nothing more.

### Zero identity: no email, ever (2026-07-30)

**Rejected:** email/magic-link, and OPAQUE/PAKE.

Authentication ≠ identity. The server only needs "same account as before", which a
keypair proves, so no identifier is collected. Once auth is decoupled from the
passphrase, the passphrase never reaches the server in any form — there is no
server-side password oracle, which is the problem OPAQUE exists to solve. Ed25519
challenge-response is the same mechanism as SSH with far less protocol surface.

**No email features ever** (e.g. weekly recap): an emailed recap can't be E2E, since its
contents land in a third-party inbox. Recaps are client-side with a local download.

### `account_id` derives from the recovery phrase, not the passphrase

A passphrase-derived lookup key would collide between users who chose the same
passphrase, and would be dictionary-attackable across the whole database. R is 256-bit,
so exposing `account_id` is safe.

**`users.id` stays separate from `account_id`** so the recovery phrase remains
rotatable: mint a new `account_id`/`signing_pubkey`, `id` never moves, no FK is touched.

### Don't claim "zero-knowledge" or "zero PII"

Both would be false in a privacy policy — a legal exposure, not a wording nit.

- **ZKP** is a formal term for a class of protocols this is not.
- **IP addresses are personal data** (CJEU *Breyer*, C-582/14).
- **GDPR applies in full** despite collecting no email: Recital 26 is explicit that
  pseudonymised data remains personal data. Dropping email reduces breach blast-radius,
  not obligations.

Honest claim: *"We never ask for your identity — no email, no phone, no name. Your
browsing data is end-to-end encrypted and we cannot read it. We do not log IP addresses;
our infrastructure provider processes them transiently to route traffic."*

### Schema merges (8 tables → 4)

| Merge | Why |
|---|---|
| `tokens` → `devices` | One install = one sync engine = one session. Token rotation was already rejected, so it's 1:1. |
| `user_seq` → `users` | An earlier draft claimed write-contention isolation. **D1/SQLite allows exactly one writer per database** (WAL has no row/table lock granularity), so a separate table buys nothing. |
| `account_lookup` → `users` | The split only pays when the halves differ in write frequency. Both change only at signup/rotation. |

**`keys` deliberately stays separate** despite being 1:1 — a judgment call, not a
technical wall. A DEK reset overwrites four security-critical columns at once; keeping
them on their own small table makes that a narrow, auditable write rather than one that
must carefully avoid `account_id`/`signing_pubkey`/`seq_counter`. Cost of separation: one
join. Cost of getting a DEK-reset query wrong: an account.

### No tombstones

The row not existing **is** the signal, under a full listing. A soft-delete flag adds a
column, a filter on every read, and a purge policy, for information the listing already
carries.

---

## Entity model

### No curated alias catalog, ever as a dependency (2026-08-02)

A live catalog is unbounded maintenance — apps renamed, packages re-owned, new services —
with no v1 payoff. If pre-linked suggestions are ever shipped they are **seeds**:
accepting one *copies* it into user data, nothing references the catalog at runtime. A
stale suggestion is then inert, there is no sync infrastructure, and the feature degrades
to what v1 already has.

### Browsers identified by an exe-name list (2026-08-02)

Fragile, and that is fine: **misidentification is cosmetic**. An unrecognised browser
shows as a normal desktop entity under its own name — same data, worse label. A
wrongly-listed non-browser is mislabelled but still counted correctly. No case loses or
double-counts time, so the simple default is the right one. The v2 liveness signal
supersedes it wherever our own extension is running.

### No sub-resource limits for app/desktop (2026-08-02)

Not a scope cut — the platforms don't offer it. Neither Android nor desktop exposes a
stable cross-app identifier for "screen within an app", so such a limit would have
nothing reliable to bind to. The wire payload's optional `path` is already there if that
ever changes.

### Entity resolution is bounded on both read paths (2026-08-02)

Enforcement resolves over **raw rows in the rule window** — capped at one calendar week
by policy — and it *must* stay raw, because `unionLen` needs actual intervals and
pre-summed cells cannot express an overlap collapse. Dashboards resolve over the
**cached per-day cells** instead, which are tens of `(domain, path)` keys rather than
hundreds of rows.

The cache is keyed by `(domain, path, kind)` and is therefore **matcher-independent**:
editing a rule or alias does not invalidate it, and entity grouping happens at read time
over the small cell set.

---

## Multiplatform

### Rust for the core (2026-07-29)

Criteria ranked: security → performance → robustness → maintainability → evolutivity.
The core must compile to WASM *and* native on every OS, with audited crypto.

| Language | Why not |
|---|---|
| C++ | Ties on perf, loses on safety + the 4-platform build |
| Go | Ships a GC runtime → MB-scale WASM blob |
| JS/TS | What we're escaping; can't run native in Tauri-mobile; WebCrypto has no Argon2 |
| Python | Pyodide ~6 MB+ |
| Kotlin (KMP) | The only serious alternative; Kotlin/Wasm and crypto maturity lag |
| Dart | Best maintainability, weakest crypto (pointycastle) — our #1 criterion |

Rust takes the top three outright: memory-safe **without a GC**, the most-scrutinised
non-C crypto libraries, native-class performance in both targets. It loses only
maintainability to Dart, and the core is a small stable module — the cheapest place to
pay the borrow-checker tax.

### Tauri for the UI (2026-07-29)

**Rejected:** Flutter (Dart UI rebuild + two UI codebases forever), Electron
(desktop-only, ~150 MB).

The asymmetry: bridge work is finite, one-time, and mostly required in Flutter too; a UI
rebuild is huge upfront **plus** permanent double-maintenance. The existing product *is*
an extension and the goal is sharing with it, so the centre of gravity is
desktop + extension.

**Accepted cost: WebKitGTK on Linux.** Distro-controlled engine version and CVE patching,
NVIDIA/DMABUF failures, a 40fps-vs-240fps perf ceiling that hits chart scrolling.
Mitigations: ship via Flatpak (pinned runtime — the single most important one), bake
graphics env-vars into `main()`, compat-audit the UI on WebKit, and run an early Linux
spike before committing UI work.

**Not betting on CEF.** [`cef-rs`](https://github.com/tauri-apps/cef-rs) is first-party
and actively released, but it is the *bindings* layer; runtime integration is incomplete
with no ETA and may become commercial ([discussion 8524](https://github.com/orgs/tauri-apps/discussions/8524)).

### macOS ships Developer ID only, never the Mac App Store

App Sandbox forbids controlling other apps, so the app must ship non-sandboxed, which
excludes the Mac App Store. Decide before any macOS code exists.

---

## Corrections worth remembering

Decisions that were made, then reversed on evidence. Kept so they aren't re-litigated in
the original (wrong) direction.

| Claim | Reality |
|---|---|
| Sans-IO avoids async pain | It means hand-writing the state machine `async` generates. More code, not less. |
| Bundling a tzdb is too big for a store-reviewed WASM blob | ~240 kB vs a 2 GB limit. |
| `intervalAggregates` needs streaming for the enforcement window | That window is capped at one calendar week by policy. `list_origins` was the unbounded one. |
| Apple offers `UIAccessFamilyMonitor` / `UIAccessFamilyRestrictions` | Neither exists. The real APIs are `FamilyControls` / `DeviceActivity` / `ManagedSettings`. |
| Mermaid blank boxes mean unsupported syntax | A mid-edit preview artifact. Rich diagrams render fine once the file settles. |
