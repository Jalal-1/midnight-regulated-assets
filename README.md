# Regulated Assets on Midnight

Real financial products built on [Midnight](https://midnight.network), documented end to end: what each product is, the use case it solves, how it is composed, and a live demo of its full lifecycle.

Everything runs on real networks. Nothing is simulated, mocked, or faked — the only mock in the repo is a stand-in core-banking ledger, and it is labelled as one.

**Audience:** financial-institution decision-makers, architects, and developers. **Funnel:** read → run → fork.

---

## The core idea

Midnight gives you a set of building blocks: programmable privacy via client-side proofs, shielded and unshielded assets at both UTXO and contract level, and the OpenZeppelin Compact modular library (access control, ECDSA multisig, confidential balances, note-based privacy, compliance hooks).

**Every product here is a different composition of those same blocks. The issuer decides the composition.**

The repo layout states that thesis directly: products live in `apps/`, the blocks they compose live in `packages/contracts/`.

---

## Status

M0 in progress. **Target network: Stagenet** — a new chain with its own genesis, on the Ledger RC3 compatible stack. Localnet mirrors that stack for development.

The directory structure below exists, but it is a skeleton: packages carry entrypoints documenting their responsibility, not implementations. What is real and what is not:

**Real and verified**
- `ops/versions.lock.json` + `ops/localnet/env/rc3.env` — the Stagenet RC3 stack, all three docker tags confirmed present on Docker Hub.
- `ops/localnet/compose.yml` — validates and resolves images; carries the workarounds each image needs (see `docs/field-notes.md`).
- `packages/network` — Stagenet and localnet endpoints, both verified.
- `apps/counter/contract/counter.compact` — byte-identical to the upstream canonical example.

**Not real yet**
- `ops/setup-toolchain.sh`, `ops/redeploy.sh` — deliberately `exit 1` rather than pretend to work.
- Every `packages/*` entrypoint is an empty `export {}` with a docblock.
- Nothing has been compiled, deployed, or proved. The localnet has not been booted.

Two values remain unconfirmed, both flagged in `versions.lock.json`: the Compact **language** version for compiler `0.33.0-rc.2`, and the **NetworkId string** Stagenet expects.

| Milestone | Deliverable | State |
|---|---|---|
| **M0** | Scaffold, pinned RC3 stack, localnet compose, redeploy runbook | in progress |
| **M1** | Counter + thin wallet wrapper on localnet; field notes | not started |
| **M2** | Deposit design options: native + public contract token, multi-party view | not started |
| **M3** | Design options: shielded UTXO candidate | not started |
| **M4** | Design options: account-based CFT + note-based preview | not started |
| **M5** | Deposit lifecycle: issue, transfer, audit, redeem | not started |
| **M6** | RWA token product + hosted site complete | not started |

---

## Products

| Product | Use case | Composition differs by |
|---|---|---|
| **Tokenised deposit** | Commercial bank money on public rails — bank issues deposits as tokens, customers transact without broadcasting balances, bank keeps issuer control, custodians operate 2-of-3 ECDSA multisig, regulator retains visibility. | baseline |
| **RWA token** | Regulated real-world assets (working example: a money-market fund share) with compliance built into the asset. | adds compliance checks, transfer restrictions, allowlists, disclosure policy |

Both are measured against the same requirements checklist: ECDSA 2-of-3 multisig custody · privacy (value-private → fully graph-private) · regulator visibility via viewing keys · controlled mint/burn · account segregation · recovery · compliance operations.

Named but **not built** — see `docs/roadmap`: private digital cash (ZSwap bearer), DvP settlement, fully-private note-based deposit, interbank settlement, embedded-wallet onboarding.

---

## Where to find what

```
midnight-regulated-assets/
├── docs/                    # the site: overview, products, roadmap, build, field notes
├── apps/
│   ├── counter/             # toolchain proof — start here
│   ├── tokenised-deposit/   # design-options / issue / transfer / audit / redeem
│   └── rwa-token/           # the recomposition + lifecycle
├── packages/
│   ├── network/             # THE ONLY place endpoints live
│   ├── wallet/              # thin Wallet SDK wrapper
│   ├── contracts/           # THE BLOCKS: access, multisig, security, token, crypto
│   ├── ui/                  # design system + multi-party view component
│   └── ledger-mock/         # mock core-banking ledger
└── ops/                     # localnet compose, redeploy.sh, setup-toolchain.sh, versions.lock.json
```

| I want to… | Go to |
|---|---|
| Verify my toolchain works at all | `apps/counter` |
| Change an RPC or indexer endpoint | `packages/network` — nowhere else |
| Understand the reusable primitives | `packages/contracts` |
| See a product's full lifecycle | `apps/tokenised-deposit` |
| See the same product recomposed | `apps/rwa-token` |
| Stand up or reset a localnet | `ops/` |
| Know exact versions / what broke for us | `ops/versions.lock.json`, `docs/field-notes` |

`packages/contracts` mirrors the OpenZeppelin `compact-contracts` layout on purpose — `access`, `multisig`, `security`, `token`, `crypto` — so a block here maps onto its upstream counterpart without translation. The composition names from the product pages sit on top of that: the confidential token is `token/`, and compliance (allowlist, blocklist, pausable) is `security/`.

**The multi-party view** (`packages/ui`) is the flagship demo component: *View as Issuer / Sender / Receiver / Regulator / Public* — one transaction, five live queries, five visibility sets. It appears in every design option and every lifecycle demo.

---

## Getting started

Prerequisites: Docker, Node ≥ 22, Yarn 4 (via Corepack), and the pinned Compact toolchain.

```bash
corepack enable
yarn install
./ops/setup-toolchain.sh    # installs the pinned toolchain   (M0: exits 1)
yarn localnet:up            # node + indexer + proof server on the RC3 stack
yarn redeploy               # compile, deploy, record addresses (M0: exits 1)
```

Start with `apps/counter`. If it does not deploy, nothing downstream will.

To point at Stagenet instead of localnet: `MRA_NETWORK=stagenet`. Fund an address from the [faucet](https://faucet.stagenet.shielded.tools) first — and note that a Stagenet reset wipes state, so expect to resync, refund, and redeploy.

---

## Constraints that will bite you

These are not style preferences — they are properties of the current stack.

- **Localnet first.** Develop against localnet, deploy to Stagenet. Both run the same RC3 stack.
- **Endpoints only in `packages/network`.** A hardcoded URL anywhere else is a bug.
- **The pinned RC3 set moves together.** Do not upgrade one component alone. See `ops/versions.lock.json`.
- **`--feature-zkir-v3` is a *compiler* flag**, and contracts built with it only verify against the `_experimental` proof-server build. Mixing the plain build with zkir-v3 contracts fails at proving time, not at compile time.
- **Proof server is always local**, including against Stagenet.
- **Design for minutes, not seconds.** ~40 s to submit, ~70 s per proved call. Any UI that assumes sub-second feedback is wrong.
- **No Lace on 2.x** → wallets are programmatic, via the Wallet SDK directly.
- **DUST-aware setup** is required before anything submits.
- **Contract-to-contract, phase 1: unshielded data only** — no value movement across calls.
- **`NetworkId` is a free-form `string`**, held in module-level global state. `setNetworkId()` must run before any wallet or contract call or the SDK throws — `packages/wallet` owns that single call site.
- **The indexer GraphQL path is version-scoped** (`/api/v4/graphql` on Stagenet) and a mismatch is an opaque 404. Derived from one constant in `packages/network`.
- **Release versions are not docker tags.** Confirm any pin against the registry — see the first field note for how this bites.
- Redeploy must stay one command and survive a full localnet reset.

Do not lift version numbers from the `midnight-context` snapshot: it tracks the **preview** line (node 1.0.0, indexer 4.3.2, ledger 8.x). It is a reference for API shape and module layout only.

---

## Contributing

Field notes are a first-class deliverable, not an afterthought. If something broke, surprised you, or cost you an afternoon, write it down in `docs/field-notes` with exact versions and an issue link. That file is the reason a fork of this repo is cheaper than a rebuild.
