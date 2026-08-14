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

**M0 and M1 are done on localnet; M2 is underway** — the public contract token (OZ FungibleToken + Ownable) runs its full lifecycle on localnet: issue, transfer, redeem, and a keyless public read that enumerates every holder (`yarn workspace @mra/app-tokenised-deposit design-options:public`). Target network is **Stagenet** — a new chain with its own genesis, on the Ledger RC3 compatible stack; localnet mirrors that stack for development.

**Real and verified — the full loop works on localnet**

The counter compiles, deploys, proves, submits, and can be called, with state read
back from the indexer each time:

```
deployed in 18.5s   address a5932c58…
initial round = 0
increment() in 17.2s   tx 00fb5a21… @ block 394
round after increment = 1
```

- **Localnet boots.** `yarn localnet:up` exits 0 with node, indexer, and proof server healthy on the pinned RC3 stack.
- **Compilation.** `yarn redeploy` runs the pinned `compactc` with `--feature-zkir-v3`, emitting bindings, circuits, and proving keys in ~2 s.
- **Wallet.** `packages/wallet` builds a programmatic wallet from a seed, derives the Zswap/NightExternal/Dust roles, and syncs. The genesis seed is funded.
- **Providers.** `packages/wallet/src/providers.ts` assembles all six midnight-js providers, including the two adapters the wallet SDK does not implement.
- **The pin set is coherent.** The compiler self-reports `ledger-9.1.0.0-rc.3` and runtime `0.18.0-rc.1`, both matching the delivery note.
- **`yarn check` is clean** and the lockfile is committed.

**Not real yet**
- **Nothing has run against Stagenet.** Everything above is localnet. The Stagenet endpoints are configured but untested, and the deploy script is deliberately localnet-only because it uses well-known genesis seeds.
- No UI. Interaction is a script, not an interface.
- `ops/redeploy.sh` compiles but does not deploy — deployment currently lives in `apps/counter/src/deploy.ts`.
- `packages/contracts`, `packages/ui`, and `packages/ledger-mock` are still empty `export {}` with docblocks.
- `apps/tokenised-deposit` and `apps/rwa-token` are empty, and are excluded from the root `tsconfig.json` references until they have source.

Every non-obvious thing that cost time on the way here is written up in **[docs/field-notes.md](docs/field-notes.md)** — 14 entries so far, and it is the most useful file in the repo right now. The wallet-bridge entry alone will save a day.

Both previously-unconfirmed values are now resolved: the Compact language version is **0.25.0** (the compiler reports it), and Stagenet's NetworkId is **`stagenet`**, taken from the wallet SDK's own `NetworkId.StageNet` enum value — still unverified against a live Stagenet sync.

| Milestone | Deliverable | State |
|---|---|---|
| **M0** | Scaffold, pinned RC3 stack, localnet compose, redeploy runbook | **done** |
| **M1** | Counter + thin wallet wrapper on localnet; field notes | **done (localnet)** |
| **M2** | Deposit design options: native + public contract token, multi-party view | **public token done**; native + view next |
| **M3** | Design options: account-based CFT — deposit design page complete | **blocked on OZ**: alpha.2 predates language 0.25's curve renames (see field notes) |
| **M4** | Deposit lifecycle: issue, transfer, audit, redeem | not started |
| **M5** | RWA token product + site complete | not started |
| **M6** | Shielded UTXO design option — built last, see below | not started |

**Two deviations from plan v6, both deliberate:**

**Shielded UTXO moved to last (was M3).** It is built, not skipped — but it is not custody-compatible yet, so it cannot satisfy the requirements checklist and nothing else should wait on it. Building it last means the deposit page ships complete with the composition that *does* work, and the shielded UTXO option lands as a documented, demonstrated limitation rather than a blocker. Upstream supports this reading: OpenZeppelin keeps its shielded token in `archive/`, marked "archived until further notice, DO NOT USE IN PRODUCTION", citing no custom spend logic (so no pause or freeze) and unreliable total-supply accounting.

**The note-based token preview is dropped.** There is no note-based module in OZ compact-contracts to preview — the shielded-UTXO module in `archive/` is the closest thing, and it is the option above. Any claim that note-based is "the higher-privacy path as it matures" needs a source before it goes on a product page.

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

Prerequisites: **Docker**, **Node ≥ 22**, and Yarn 4 via Corepack.

### First time only

```bash
corepack enable
yarn install
yarn toolchain      # fetch the pinned compactc into .toolchain/ (idempotent)
yarn redeploy       # compile apps/*/contract/*.compact  (exits 1 at the deploy
                    # stage by design — the compile step is what matters here)
```

### Every time — running the app from a fresh terminal

Three processes. The first is detached; the other two stay in the foreground, so
give them a terminal each.

```bash
# 1. Infrastructure — node + indexer + proof server. Takes ~30s to report healthy.
yarn localnet:up

# 2. Log sidecar (terminal 2). Optional, but without it the log drawers in the
#    page stay empty. Dev-only; binds to 127.0.0.1.
yarn logs

# 3. The app (terminal 3).
yarn ui             # then open http://localhost:5173
```

In the page: **Connect wallet** → **Deploy counter** → **increment()**. Each of
the last two takes ~18 s, almost all of it waiting for block inclusion. The
Infrastructure panel on the right shows the node, indexer, and proof server live,
each with a `LOGS` drawer.

Shutting down: <kbd>Ctrl-C</kbd> the two foreground processes, then

```bash
yarn localnet:down  # -v, so chain state is discarded
```

**A restart is always a fresh chain.** The localnet keeps no volume, so any
previously deployed contract is gone and the genesis seeds are funded again.
Redeploy from the page; it takes 18 seconds. Nothing needs recompiling — the
toolchain in `.toolchain/` and the build in `contract/managed/` both survive.

### The same thing without a browser

```bash
node --experimental-strip-types apps/counter/src/deploy.ts
```

This is the reference implementation of the sequence the UI performs. If the two
ever disagree, this one is right.

`yarn check` typechecks the whole repo. Start with `apps/counter`: if it does not
compile and deploy, nothing downstream will.

To point at Stagenet instead of localnet: `MRA_NETWORK=stagenet`. Fund an address from the [faucet](https://faucet.stagenet.shielded.tools) first — and note that a Stagenet reset wipes state, so expect to resync, refund, and redeploy.

---

## Constraints that will bite you

These are not style preferences — they are properties of the current stack.

- **Localnet first.** Develop against localnet, deploy to Stagenet. Both run the same RC3 stack.
- **Endpoints only in `packages/network`.** A hardcoded URL anywhere else is a bug.
- **The pinned RC3 set moves together.** Do not upgrade one component alone. See `ops/versions.lock.json`.
- **`--feature-zkir-v3` is a *compiler* flag**, and contracts built with it only verify against the `_experimental` proof-server build. Mixing the plain build with zkir-v3 contracts fails at proving time, not at compile time.
- **Proof server is local by default**, including against Stagenet, so witness data never leaves the machine. A third-party hosted prover (TEE / confidential space) is configurable — see `docs/build.md`. **Placeholder: not wired to a real provider yet.**
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
