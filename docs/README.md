# Coral Clock docs

Two tracks: what's **shipped**, and the **roadmap**.

## Roadmap — multiplatform

Android / iOS / Windows / Linux / macOS + the extension, sharing one E2E data set on a
shared **Rust core** with a **Tauri** UI.

```mermaid
flowchart TD
  mp[multiplatform.md<br/>platforms, toolkit, stack] --> cc[core-crate.md<br/>core surface + host traits]
  mp --> dp[dev-plan.md<br/>order of work]
  cc --> cs[cloud-sync.md<br/>account + E2E sync]
  cc --> em[entity-model.md<br/>cross-platform resources]
  cs --> crypto[crypto-contract.md<br/>frozen params]
  em --> enf[enforcement.md<br/>shipped blocking]
  cs --> is[interval-storage.md<br/>the base data unit]
  dec[decisions.md<br/>WHY, with sources] -.->|rationale for all of the above| mp
```

| Doc | Read it when |
|---|---|
| [multiplatform](architecture/multiplatform.md) | Which platforms can do what; why Rust, why Tauri |
| [core-crate](architecture/core-crate.md) | Building against the core, or implementing a host |
| [dev-plan](architecture/dev-plan.md) | What to build next |
| [cloud-sync](features/cloud-sync/cloud-sync.md) | How sync, auth and retention work |
| [crypto-contract](features/cloud-sync/crypto-contract.md) | Looking up an exact parameter |
| [entity-model](features/entity-model/entity-model.md) | Cross-platform limits, matching, aliases |
| [decisions](architecture/decisions.md) | **Challenging a decision** — rarely otherwise |

## Shipped — the extension today

- [Architecture](architecture/architecture.md) — event-sourced aggregator, DNR blocking.
- [Tracking internals](architecture/tracking-internals.md) — range engine, flush cycle.
- [Interval storage](features/interval-storage.md) — the base data unit.
- [Enforcement](features/enforcement/enforcement.md) — web-only limit blocking.
- Others: [guided tour](features/guided-tour.md), [subdomain tracking](features/subdomain-tracking.md), [timeline](features/interval-timeline-improvements.md), [bucket→interval migration](features/bucket-to-interval-tracking-migration.md).

## Who owns what

One owning doc per fact; the others link and never restate. This is what stops drift.

| Topic | Owner |
|---|---|
| Platforms, capability matrix, toolkit, stack | [multiplatform](architecture/multiplatform.md) |
| Core exports, host traits, `Time`, errors | [core-crate](architecture/core-crate.md) |
| Phase order and per-phase work | [dev-plan](architecture/dev-plan.md) |
| Sync protocol, auth, schema, retention, GDPR | [cloud-sync](features/cloud-sync/cloud-sync.md) |
| Crypto parameters, wire payload, normative MUSTs | [crypto-contract](features/cloud-sync/crypto-contract.md) |
| Resource identity, entity/alias resolution, fan-out | [entity-model](features/entity-model/entity-model.md) |
| **Rationale + rejected alternatives, with sources** | [decisions](architecture/decisions.md) |
| Shipped web-only blocking | [enforcement](features/enforcement/enforcement.md) |
| The interval log | [interval-storage](features/interval-storage.md) |

## Doc conventions

- **Diagrams and tables carry the content.** Prose only where a diagram genuinely can't
  say it — normative parameters, legal wording.
- **Rationale lives in [decisions.md](architecture/decisions.md)**, not inline. Specs say
  *what*; the log says *why*, with sources.
