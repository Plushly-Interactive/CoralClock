# Cloud sync — accounts + cross-device interval data

Turn BiteGuard into an account-backed service whose **interval data** follows the
user across devices. The server is a **dumb, end-to-end-encrypted store**: it
holds ciphertext rows, hands them between a user's devices, and **never reads
browsing history**. Every device keeps a full local copy of the intervals in
IndexedDB, computes all stats locally (the existing `intervalAggregates` engine),
and enforces limits locally — so **everything works offline**; sync is just
eventual reconciliation.

The **scalar buckets stay local and frozen** (legacy pre-interval history). This
feature **promotes the interval log** from the "removable experiment" of
[interval-storage.md](../interval-storage.md) to the **authoritative, synced
store** that dashboards and combined enforcement read going forward.

## Why this shape

Three user constraints forced the architecture; it is not a free choice:

- **Offline must work** (stats *and* enforcement) → all compute is local.
- **End-to-end encryption is kept** → the server can't read rows → the server
  *can't* compute anyway → it can only be a sync relay.
- **Combined cross-device limits** → enforcement reads the merged interval log,
  not the local buckets.

A thin-client / server-authoritative model (server computes views, answers "block
this?") was considered and **rejected**: it would break offline, kill E2E, and
put a network round-trip on the navigation hot path.

## Resolved decisions

| Decision | Choice | Why |
|---|---|---|
| Backend | Cloudflare Worker + D1 | Hand-rolled auth, fewest third parties, matches existing tooling |
| Auth | Magic-link (6-digit email code → long-lived token) | No passwords, no third-party OAuth |
| Sync model | Full replication, alarm-driven push/pull deltas | Offline-first; server is a dumb relay |
| Server role | Encrypted blob store, no compute | E2E + offline both rule out server-side logic |
| Encryption | Wrapped-key E2E; `domain`/`path`/`from`/`to`/`kind` all encrypted per-row | Server learns nothing, not even *when* you browse |
| Encryption key | Random DEK, wrapped by `KEK = KDF(passphrase)`, wrapped DEK stored server-side; recovery phrase as backup | Passphrase UX + high-entropy key; magic-link stays identity-only |
| Enforcement | Combined across devices (per-device mode is post-v1) | Limit applies to total usage everywhere |
| Interval log status | Authoritative + synced; buckets frozen legacy | Single source of truth going forward |
| Logged-out capture | Capture always, claim rows on login | Never lose data; matches today's always-on tracker |
| Retention | Client-driven tombstone prune (server is blind) | Server can't prune by age it can't read |
| Token | Long-lived, manual revoke ("sign out everywhere") | Token lives in extension storage, not page JS; refresh-rotation is over-built here |
| Privacy posture | E2E within v1 | v1a E2E-ready (opaque rows) → v1b real encryption, both ship as v1 |

## User stories

- As a user, I sign in with an email code (no password) and my interval data is
  available on every device I sign into.
- As a user, my browsing history is end-to-end encrypted — the operator cannot
  read what sites I visit, even server-side.
- As a user, a limit like "twitch.tv 1h/day" applies to my **total** usage across
  all my devices, not per device.
- As a user, I can see **which device** each chunk of browsing happened on.
- As a user, I can name and manage my devices, and sign out one or all of them.
- As a user (GDPR), I can export all my data and permanently delete my account.
- As an existing user, my pre-interval scalar history stays intact locally and is
  never affected by sync.

## Acceptance criteria

- [ ] A new device that signs in converges to the same combined interval view as
      the user's other devices (within one sync interval), and works fully offline
      against its local copy.
- [ ] The server stores only ciphertext for `domain`/`path`/`from`/`to`/`kind`;
      no endpoint returns or computes over plaintext browsing data.
- [ ] The merged interval log exposes **combined cross-device usage** (last-synced
      others' usage + this device's live usage), available offline, in the shape
      the enforcement rebuild needs. *Actual blocking is owned by
      [enforcement.md](../enforcement/enforcement.md), not this spec — cloud-sync
      provides the input, enforcement consumes it.*
- [ ] Each interval row is attributable to the device that captured it; the UI can
      group/filter by device.
- [ ] Deleting the account removes all server rows, tokens, wrapped keys, and
      device records. Forgetting a site / pruning propagates a tombstone that
      removes the rows on every device and the server.
- [ ] Losing a device, reinstalling, or signing into a different account never
      leaks one account's data into another's view and never loses data captured
      while logged out.
- [ ] The scalar buckets, the main dashboard, export/import, prune, "forget this
      site" over buckets, and `onInstalled` are unaffected by sync.

## Scope

### Surfaces involved

| Surface | Role |
|---|---|
| **server** (Worker + D1) | Auth (request/verify code, tokens), per-user encrypted interval store, push/pull deltas, device registry, wrapped-key storage, account deletion. No compute over browsing data. |
| **background** (extension) | Sync engine on its own `intervalSync` alarm: encrypt + push dirty rows, pull + decrypt + upsert mirror rows, drive cursors, claim logged-out rows on login, run client-side retention prune. Adds `dbg()` at every decision point. |
| **enforcement** (extension) | *Out of this spec's build* — owned by [enforcement.md](../enforcement/enforcement.md). Cloud-sync only **provides** combined cross-device usage from the merged log and an opportunistic near-limit sync hook; the block decision lives in the enforcement rebuild. |
| **settings / account UI** | Sign-in (email → code), passphrase set/unlock + recovery phrase, device management, sign out / sign out everywhere, export, delete account, sync status. |
| **dashboards** | Read the (now authoritative) interval log; optional group/filter by device. |

### Client storage changes

**IndexedDB (`browsing-intervals`)** — additive, engine untouched:

| Field | On which rows | Purpose |
|---|---|---|
| `deviceId` | all | Stamped from `_deviceId`; global identity is `(deviceId, localId)` where `localId` = the existing `++id`. |
| `dirty` | own | `1` on `appendInterval`/`touch`, cleared on push-ack. Push cursor — no fragile seq to corrupt. Open rows re-dirty ~1×/min until the session closes (cheap). |
| `origin` `{deviceId, localId}` | mirror | Pulled rows' source identity; **indexed** for idempotent upsert on re-pull. Own rows don't need it (`= self, id`). |
| `cipher`, `iv` (v1b) | all synced | Per-row ciphertext of `{domain, path, from, to, kind}` + nonce. Plaintext fields kept locally for compute; only ciphertext is pushed. |

Keep local `++id`. `touch` updates by PK, `openRows` holds `{rowId}`, the snapshot
carries it — **none of `intervalTrackingUtils` changes** beyond stamping
`deviceId`. (Verified path: `touch` → flush → snapshot cycle is unaffected.)

**`chrome.storage.local`** (the 10MB tier — tiny additions; interval *data* lives
in IndexedDB, GB-class, not here):

| Key | Purpose |
|---|---|
| `_deviceId` | One UUID per install. |
| `account` | `{ email, token }` — the session. |
| `lastPulledSeq` | Pull cursor (highest server `seq` seen). |
| `deviceRegistry` | Cached `{deviceId → name}` for attribution UI. |
| `wrappedKeyCache` (v1b) | The unwrapped DEK is held in SW memory after unlock; only the wrapped form is persisted (server is source of truth). |

### Server storage (D1)

```
users(id, email, created_at)
auth_codes(email, code_hash, expires_at, attempts)          -- pending magic codes
tokens(token_hash, user_id, created_at, last_used)
devices(user_id, device_id, name, created_at, last_seen)
keys(user_id, key_epoch, wrapped_dek, kdf_params, recovery_wrapped_dek) -- ciphertext only
intervals(
  user_id, device_id, local_id,
  cipher BLOB, iv BLOB,            -- encrypted {domain,path,from,to,kind}
  seq, deleted,
  PRIMARY KEY (user_id, device_id, local_id)
)
INDEX intervals(user_id, seq)
user_seq(user_id, value)          -- per-user monotonic counter
```

The server **cannot** read `cipher`. `seq` is bumped (in a D1 transaction) on
every insert *and* update, so a row's `to`-extension resurfaces to other devices'
pulls.

### Auth (magic-link)

1. `POST /auth/request {email}` (behind **Turnstile**, rate-limited per email+IP):
   generate a 6-digit code, store `code_hash` + expiry (~10 min) + attempt count,
   email it via Cloudflare Email Sending. **Always** respond `"code sent"` — never
   reveal whether the email exists (anti-enumeration).
2. `POST /auth/verify {email, code}`: check hash, expiry, attempt cap; create the
   user if new; issue a long-lived token (store `token_hash`); return it.
3. Extension stores `{email, token}`; every sync request sends
   `Authorization: Bearer <token>`.
4. Sign out = delete token locally. Sign out everywhere = `DELETE /tokens` for the
   user.

Magic-link is **identity only** — it proves control of the email, nothing the
server sees can be the encryption key. The encryption secret is the **separate
passphrase** (below).

### Sync engine

`intervalSync` alarm (separate from the 1-min `intervalFlush`). Each fire, if
signed in and unlocked:

- **Push:** read `dirty` rows, encrypt each to `{cipher, iv}`, `POST /sync/push`
  (batched). Server upserts by `(user_id, device_id, local_id)` — idempotent, so a
  crash mid-push just re-pushes. On ack, clear `dirty` per row.
- **Pull:** `GET /sync/pull?since=<lastPulledSeq>` → rows with
  `seq > lastPulledSeq AND device_id != me`, **paginated** (cap per page, loop on
  `nextSeq`). Decrypt, upsert mirror rows by the `origin` index, advance
  `lastPulledSeq`, invalidate `intervalAggregates`.

Resumable by construction: dirty-flag + idempotent upsert + persisted cursor mean
SW death mid-sync is safe (re-push is a no-op, pull resumes from the cursor).
`dbg()` at push / pull / merge / claim / prune.

**Claim on login:** rows captured while logged out have `deviceId` = this install
but were never pushed (no account). On sign-in, the "upload your existing
history?" prompt (per the backfill decision) marks them `dirty` so they sync up
under the now-active account.

### Encryption (v1b — wrapped key)

- One random **DEK** per account encrypts every row's
  `{domain, path, from, to, kind}` (AES-GCM, per-row `iv`).
- User sets a **passphrase**; `KEK = KDF(passphrase)`; the DEK is **wrapped by
  KEK** and the wrapped form is stored server-side. The server holds only the
  wrapped DEK → still blind. **The passphrase is the entire security boundary
  against a malicious/compromised operator** (who can attempt an offline
  brute-force of the wrapped DEK), so the KDF **must** be memory-hard with strong
  parameters — Argon2id at a deliberately high cost. This is a hard requirement,
  not a default.
- **First-ever login (no account key yet):** setup is **mandatory before any
  sync** — set passphrase → generate DEK → show recovery phrase → only then does
  data flow. No grace period, no v1a-style opaque interim: every synced row is
  E2E-encrypted from the first one.
- **New device (key exists):** magic-link login → download wrapped DEK → enter
  passphrase → unwrap locally → hold DEK in SW memory. **No phrase to copy between
  devices.**
- **Recovery phrase** = the raw DEK rendered as words (BIP39-style), shown once, as
  a backup if the passphrase is forgotten. Stored by the user out-of-band.
- **Change passphrase** = re-wrap the DEK with a new KEK; no data re-encryption.
- **v1a** ships first: same wire shape but `cipher` carries opaque-but-unencrypted
  JSON, server stores it without parsing (E2E-*ready*). **v1b** swaps in real
  encryption with no server migration. Both are v1.

Per-row encryption (not one big blob) keeps the upsert + seq-delta model intact.

### Enforcement (combined) — input only

Enforcement itself is **not built here**; it is owned by the rebuild in
[enforcement.md](../enforcement/enforcement.md). What cloud-sync **provides** to
it:

- **Combined usage** = own live usage + last-synced mirror usage, read from the
  merged local interval log. Available offline, no per-navigation network call.
- An **opportunistic `intervalSync`** the enforcement checker can trigger when a
  site is near its limit, to tighten accuracy before deciding.

**Known gap to hand to enforcement:** a device offline for hours under-counts
combined usage and may overshoot — best-effort by design. Per-device enforcement
mode is post-v1 (rows already carry `deviceId`, so it drops in later).

### GDPR

- **Export** is **client-side**: the server only holds ciphertext, so export =
  client decrypts the local log and dumps JSON.
- **Erasure** is server-side: `DELETE /account` wipes the user's rows, tokens,
  wrapped keys, and device records; the client clears its local synced data.
- **Device management:** registry lists devices (name, last seen); forget-device
  drops it from the registry and revokes its token (its rows become orphaned, not
  deleted — see edge cases).
- Signup requires accepting a **privacy policy + ToS** (Public SaaS, EU controller
  of sensitive data).

### Retention (client-driven)

Because the server is blind to timestamps, it **cannot** prune by age. Retention
is a **client** decision: the client tombstones rows older than the policy
(`deleted = 1`), which propagates on push; the server drops tombstoned rows. Until
some client prunes, the server grows unbounded — see open questions on cost.

## Milestones

- **v1a — E2E-ready, no encryption yet.** Worker + D1, magic-link auth, device
  registry, push/pull deltas, claim-on-login, combined-usage exposure, GDPR
  endpoints, Turnstile + rate limits. Rows carried as opaque JSON the server never
  parses. Shippable and testable.
  - **v1a writes plaintext to the server.** Those rows stay plaintext after v1b
    unless re-encrypted — onboarding a real user on v1a would retroactively
    falsify the E2E guarantee for their early data. Therefore **v1a is
    pre-launch / testing only (no real users)**, *and* v1b includes a one-time
    **client-side re-encryption pass** over any pre-v1b rows before launch.
- **v1b — real E2E.** Wrapped-key (DEK/KEK), passphrase + recovery-phrase UI,
  per-row encryption swapped into push/pull. No server migration.

Both are **v1**. Suggested build order inside each: server + auth → sync engine →
account UI → hardening (rate-limit, retry/backoff, retention prune).

## Edge cases

- **`deviceId` reset** (storage cleared / reinstall): new id; old rows still pull
  down as mirrors (history intact), but the old device's server rows are orphaned
  (no re-claim). Cleaned via forget-device or account deletion.
- **Cloned profile** (browser profile sync copying `chrome.storage.local`): two
  machines could share a `deviceId` and fight over the same open row's `to`.
  Mitigate by generating `deviceId` lazily on first sync with a collision check.
- **Account switch on one device — `deviceId` must be regenerated.** On switching
  accounts, reset the local synced store **and mint a fresh `deviceId`**. Without
  this, the pull filter `device_id != me` would permanently exclude this device's
  own previously-pushed rows once the local copy is gone — stranding them on the
  server, invisible everywhere. Regenerating `deviceId` makes a switch behave
  exactly like the reinstall case: own rows return as mirror rows under a new id,
  and the `device_id != me` filter stays valid. (Keeping the old `deviceId` and
  *retaining* its rows instead would leak account A's data into account B's view —
  so neither "just reset the view" nor "keep the rows" works; the id reset is the
  fix.) `deviceId` is therefore **bound to the local store's lifecycle**: cleared
  store ⇒ new id.
- **Cross-device same-site use:** `intervalAggregates` unions rows across devices,
  so simultaneous twitch on two devices collapses to one via `unionLen`. Intended.
- **Clock skew:** timestamps are client-authoritative and encrypted — the server
  can't validate them. A wrong clock smears that device's data; acceptable for a
  personal tracker.
- **Forgotten passphrase, no recovery phrase:** data is unrecoverable by design
  (true E2E). The account/login still works; the user must reset encryption
  (start a fresh DEK), abandoning old ciphertext. **A DEK reset must propagate:**
  other devices still hold the *old* DEK in memory and would push rows the others
  can't decrypt (split-brain). The reset bumps a key epoch; devices on a stale
  epoch must re-unlock (download the new wrapped DEK, re-enter passphrase) before
  they sync again, and old-epoch ciphertext is dropped.
- **IndexedDB quota / sync offline:** capture and local compute continue; sync
  retries next alarm. Nothing blocks on the network.

## Out of scope (v1)

- Per-device enforcement mode (combined only in v1).
- Server-side compute of any kind (views, search, analytics) — precluded by E2E.
- Real-time / WebSocket convergence — periodic alarm sync only.
- A web dashboard — extension is the only client.
- Syncing the scalar buckets — they stay local, frozen, legacy.
- Multi-account-per-device simultaneously — one active account at a time.
- Server-side retention — impossible while timestamps are encrypted.

## Open questions

- **Server storage cost / growth.** With encrypted timestamps the server can't
  prune; growth is bounded only by client-driven retention. What default retention
  window, and how to bound per-user (and total) D1 size for a public service?
- ~~**Passphrase onboarding friction.**~~ **Resolved: E2E from the start** —
  passphrase setup is mandatory at first login, before any sync; no grace period.
- **Aggregation memory ceiling.** `intervalAggregates` loads the whole log via
  `toArray()`; full replication across devices and years will make this heavy.
  Mitigations (incremental local aggregates, paged reads, a hot/cold window) are
  deferrable and schema-neutral — but a public service will hit this.
- **Sync cadence vs enforcement accuracy.** How aggressive should the opportunistic
  near-limit sync be, balancing battery/quota against overshoot?
