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

Pre-M0. **This repo currently contains only `.gitignore` and this README** — the scaffold described below is the target layout, not what is on disk today. Treat every path in the next section as forthcoming unless it exists when you look.

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
│   ├── contracts/           # THE BLOCKS: access-control, multisig, cft, note-preview, compliance
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

**The multi-party view** (`packages/ui`) is the flagship demo component: *View as Issuer / Sender / Receiver / Regulator / Public* — one transaction, five live queries, five visibility sets. It appears in every design option and every lifecycle demo.

---

## Getting started

Prerequisites: Docker, Node, and the pinned Compact toolchain. Once M0 lands:

```bash
./ops/setup-toolchain.sh              # installs the pinned toolchain
docker compose -f ops/localnet/docker-compose.yml up -d
npm install
npm run -w apps/counter deploy        # confirms the stack end to end
```

Start with `apps/counter`. If it does not deploy, nothing downstream will.

---

## Constraints that will bite you

These are not style preferences — they are properties of the current stack.

- **Localnet first.** Develop against localnet; Stagenet endpoints are temporary and the 2.x stack is the target.
- **Endpoints only in `packages/network`.** A hardcoded URL anywhere else is a bug.
- **The pinned RC3 set moves together.** Do not upgrade one component alone. See `ops/versions.lock.json`.
- **Proof server is always local**, with `--feature-zkir-v3` and the experimental proof server.
- **Design for minutes, not seconds.** ~40 s to submit, ~70 s per proved call. Any UI that assumes sub-second feedback is wrong.
- **No Lace on 2.x** → wallets are programmatic, via the Wallet SDK directly.
- **DUST-aware setup** is required before anything submits.
- **Contract-to-contract, phase 1: unshielded data only** — no value movement across calls.
- `midnight-js` 5.x `NetworkId` is a free-form string, not an enum.
- Redeploy must stay one command and survive a full localnet reset.

---

## Contributing

Field notes are a first-class deliverable, not an afterthought. If something broke, surprised you, or cost you an afternoon, write it down in `docs/field-notes` with exact versions and an issue link. That file is the reason a fork of this repo is cheaper than a rebuild.
