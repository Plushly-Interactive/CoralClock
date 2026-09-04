# Cloud sync — proposal

TL;DR: not built, no code in `src/`. Account-backed, end-to-end-encrypted sync of the interval log so browsing data follows the user across devices, with **no personal information collected at all**. Full design, schemas and milestones: [appendix](../appendix/cloud-sync-design.md). Frozen crypto parameters: [crypto contract](../appendix/crypto-contract.md).

## What it would do

- Create an account with **no email, no phone, no name**, and see the same interval data on every device.
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
- **Identity** — none collected. The account is a pseudonymous id derived from a recovery phrase.
- **Auth** — Ed25519 challenge-response, the same primitive as SSH. The passphrase never reaches the server in any form.
- **Sync** — full replication, with push and pull deltas driven by an alarm; the device keeps a complete local copy in IndexedDB.
- **Encryption** — a random data key wrapped by a key derived from the user's passphrase, with a recovery phrase as backup. `domain`, `path`, `from`, `to`, `kind` and `source` are all encrypted per row, so the server does not learn even when the user browses.
- **Retention** — **never prune by age.** Deletion happens only when the user asks, and is a real delete with no tombstone.
- **Client code** — one shared Rust core, compiled to WASM here and native on the apps. See [core crate](../architecture/core-crate.md).

This would also promote the interval log from removable experiment to the authoritative synced store.

## What the operator can still learn

No personal information is collected, but "the server knows nothing" would be false. It can still observe IP addresses (legally personal data), roughly when a device is active, and how much data an account holds. It provably cannot read browsing content, device names, or any key.

Do not claim "zero-knowledge" or "zero PII" — both would be false in a privacy policy. GDPR applies in full regardless, since pseudonymised data is still personal data.

## Status

**No blocking open questions.** Two standing items wait on outside events rather than decisions: an Oblivious HTTP relay partner (opt-in, post-v1, needs no preparation), and whether the service is ever paid (billing would use a separately-keyed id with no stored link to the account).

Earlier open questions on server storage growth, aggregation memory, and sync cadence are all resolved — see the appendix.
