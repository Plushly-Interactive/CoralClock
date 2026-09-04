# Cloud sync — proposal

TL;DR: not built, no code in `src/`. An account-backed, end-to-end-encrypted sync of the interval log so browsing data follows the user across devices. Full design, schemas and milestones: [appendix](../appendix/cloud-sync-design.md).

## What it would do

- Sign in with an email code, no password, and see the same interval data on every device.
- Apply a limit such as "twitch.tv 1h/day" to total usage across all devices, not per device.
- Attribute each chunk of browsing to the device that captured it, and let the user name and sign out devices.
- Export everything and permanently delete the account.
- Leave the legacy scalar buckets local and frozen; only the interval log syncs.

## The constraint that fixes the shape

Three user requirements force the architecture — it is not a free choice:

- Offline must work, for statistics **and** enforcement, so all computation is local.
- End-to-end encryption is kept, so the server cannot read rows, so it cannot compute over them.
- Limits combine across devices, so enforcement reads the merged interval log rather than local buckets.

The result is a server that is only a relay: it holds ciphertext rows, hands them between a user's devices, and never sees browsing history. A server-authoritative model that answers "block this?" was considered and rejected — it breaks offline use, ends end-to-end encryption, and puts a network round trip on the navigation hot path.

## Shape in one line each

- **Backend** — Cloudflare Worker plus D1, chosen for hand-rolled auth and the fewest third parties.
- **Auth** — a six-digit email code exchanged for a long-lived token, revocable with "sign out everywhere".
- **Sync** — full replication, with push and pull deltas driven by an alarm; the device keeps a complete local copy in IndexedDB.
- **Encryption** — a random data key wrapped by a key derived from the user's passphrase, with a recovery phrase as backup. `domain`, `path`, `from`, `to` and `kind` are all encrypted per row, so the server does not learn even when the user browses.
- **Retention** — client-driven tombstones, because a server that cannot read timestamps cannot prune by age.

This would also promote the interval log from removable experiment to the authoritative synced store.

## Open questions

1. **Server storage growth.** With timestamps encrypted the server cannot prune. What default retention window bounds per-user and total database size for a public service?
2. **Aggregation memory ceiling.** `intervalAggregates` loads the whole log at once. Full replication across devices and years makes that heavy. The fixes (incremental aggregates, paged reads, a hot and cold window) are deferrable and schema-neutral, but a public service will hit this.
3. **Sync cadence against enforcement accuracy.** How aggressive should an opportunistic sync near a limit be, trading battery and quota against overshoot?

Resolved: end-to-end encryption applies from the first release, so passphrase setup is mandatory at first login with no grace period.
