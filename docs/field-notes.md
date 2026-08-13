# Field notes

First-class deliverable. Exact versions, what broke, what surprised us, links.
This file is why forking this repo is cheaper than rebuilding it.

Format per entry: **date · component + version · symptom · cause · fix**.

---

## 2026-08-13 · indexer-standalone 4.4.0-pre-alpha.16 · `manifest unknown` on pull

**Symptom.** `docker compose up` fails to pull
`midnightntwrk/indexer-standalone:4.4.0-pre-alpha.16`, the version named in the
Stagenet delivery note.

**Cause.** No plain tag by that name is published. The image tag carries the full
build suffix:
`4.4.0-pre-alpha.16-l91r3-n2r3-bridge-and-events-epics-contract-zswap-16c656df`.
The release *version* and the docker *tag* are not the same string.

**Fix.** Pin the full suffixed tag in `ops/localnet/env/rc3.env`. Verify any new
pin against Docker Hub before trusting a version from a release note.

---

## 2026-08-13 · indexer 4.4.x · indexer exits ~5 minutes into every run

**Symptom.** Indexer boots, serves, then the whole process exits a few minutes
later, taking the localnet with it.

**Cause.** The 4.4.x line spawns an SPO/Cardano-bridge subtask unconditionally
and terminates the parent process once it gives up reconnecting (default ≈30 ×
10 s). A standalone localnet has no SPO node, so it always gives up. There is no
flag to disable the subtask.

**Fix.** Set `APP__INFRA__SPO_NODE__RECONNECT_MAX_DELAY: '24h'` so it never
reaches the giving-up state, plus a dummy `BLOCKFROST_ID`. Same workaround
upstream uses in midnight-js `testkit-js/compose.yml`.

---

## 2026-08-13 · proof-server 9.0.0-rc.5_experimental · `up --wait` aborts on a healthy server

**Symptom.** `docker compose up --wait` reports the proof server unhealthy and
aborts, while `GET localhost:6300/version` returns 200 from the host.

**Cause.** The image is a minimal Nix build with no shell and no curl, so any
in-container HTTP healthcheck fails with "executable not found" regardless of
whether the server is up.

**Fix.** `healthcheck: disable: true`. The proof server is ready long before the
node and indexer, whose healthchecks do work, so ordering still holds.

---

## 2026-08-13 · indexer 4.4.x · a wrong API version redirects to a nonsense path

**Symptom.** Queries to `/api/v1/graphql` do not 404. They return
`308 Permanent Redirect` to **`/api/v4/v1/graphql`** — the server prefixes the
current version onto the path you asked for. `/api/v9/graphql` behaves the same.
A client that follows redirects then fails against a path that never existed, so
the error you debug is two steps removed from the actual mistake.

**Cause.** The GraphQL path is version-scoped and moves with the image (`v3` on
the 4.3.x preview line, `v4` here). Copying a path out of the wrong repo's tests
is easy, and the redirect hides it.

**Fix.** `packages/network` derives the path from a single `INDEXER_API_VERSION`
constant instead of hardcoding it per network. Verified on localnet:
`POST /api/v4/graphql` → `200 {"data":{"__typename":"Query"}}`.

---

## 2026-08-13 · full RC3 stack · localnet boots clean

Recorded as the known-good baseline. `docker compose up -d --wait` exits 0 with
all three services healthy, on the pins in `ops/localnet/env/rc3.env`:

| Check | Result |
|---|---|
| `GET :9944/health` | `200` · `{"peers":0,"isSyncing":false,"shouldHavePeers":false}` |
| `GET :6300/version` | `200` · `9.0.0-rc.5` |
| `POST :8088/api/v4/graphql` | `200` · `{"data":{"__typename":"Query"}}` |
| Block production | advancing (block 7 → 8 over ~8 s) |

Note the proof server reports its version as plain `9.0.0-rc.5` even though the
image tag is `9.0.0-rc.5_experimental` — the `/version` string cannot tell you
whether you are on the experimental build, so it is no help in confirming
zkir-v3 support. Trust the tag, not the endpoint.

---

## 2026-08-13 · compactc 0.33.0-rc.2 · the compiler self-reports its expected stack

Not a bug — a verification tool worth knowing about. The compiler will tell you
exactly what it expects, which is the cheapest way to check a pin set is coherent:

```
compactc --version           0.33.0
compactc --language-version  0.25.0
compactc --ledger-version    ledger-9.1.0.0-rc.3
compactc --runtime-version   0.18.0-rc.1
```

The ledger and runtime it names match the Stagenet delivery note exactly, which
is the best evidence available that this RC3 set really does move together.
Re-run all four after any toolchain bump.

Two gotchas:

- **`--version` prints `0.33.0`, not `0.33.0-rc.2`.** Same trap as the docker
  tags: the artifact identifier and the self-reported version are different
  strings. You cannot confirm you are on the RC from `--version` alone.
- **Language version is 0.25.0, not 0.23.0.** OZ compact-contracts declare
  `pragma language_version >= 0.23.0`, so they are satisfied — but do not read
  the OZ pragma as a statement of the current language version.

---

## 2026-08-13 · compactc · compiling is fast; it is proving that is slow

`compactc --feature-zkir-v3 counter.compact managed/` completes in **~2 s**
including proving-key generation, producing 120 KB of output:

```
contract/index.{js,d.ts,js.map}     TypeScript bindings
zkir/increment.{zkir,bzkir}         circuits
keys/increment.{prover,verifier}    proving + verifying keys
compiler/contract-{info,manifest}.json
```

`--skip-zk` takes 0.3 s and omits `keys/` and `.bzkir`, which is the right mode
for iterating on TypeScript output.

Worth stating because the "design for minutes" constraint is easy to misapply:
it is about **submitting and proving at runtime** (~40 s / ~70 s), not about the
build. A slow edit-compile loop is a symptom of something wrong, not expected.

---

## 2026-08-13 · midnight-js 5.x + wallet-sdk 2.x · there are TWO NetworkId types

**Symptom (anticipated, not yet hit).** Wallet and contract layers disagree about
which chain they are on, with no single obvious wrong value to find.

**Cause.** The two SDKs model network identity differently:

| Package | Type | Localnet value |
|---|---|---|
| `@midnight-ntwrk/midnight-js-network-id` | `type NetworkId = string` | `'undeployed'` |
| `@midnightntwrk/wallet-sdk` | `NetworkId.NetworkId` enum | `NetworkId.Undeployed` |

Worse, midnight-js holds its value in **module-level global state**:
`setNetworkId()` must be called before any wallet or contract operation, and
`getNetworkId()` throws with "Network ID has not been configured" if it was not.
So the failure mode is either a thrown error at an unrelated call site, or two
layers silently pointing at different chains.

Upstream's own testkit carries both side by side, which is the tell —
`LocalTestConfiguration` sets `walletNetworkId` (enum) *and* `networkId`
(string) from one constructor.

**Fix.** `packages/network` owns the string, `packages/wallet` maps it to the
enum at the boundary, and there is exactly one `setNetworkId()` call site. Never
derive the two independently.

---

## 2026-08-13 · localnet · pre-funded genesis seeds

`CFG_PRESET=dev` funds four well-known seeds via the genesis mint. Upstream's
testkit caps a local environment at exactly these four:

```
0000000000000000000000000000000000000000000000000000000000000002
0000000000000000000000000000000000000000000000000000000000000001
0000000000000000000000000000000000000000000000000000000000000003
0000000000000000000000000000000000000000000000000000000000000004
```

Exported as `LOCALNET_GENESIS_SEEDS` from `packages/network`. The upstream order
genuinely starts at `…0002`; preserved rather than tidied in case anything
depends on index order.

These are public test keys — localnet only. On Stagenet, use the faucet; a seed
with real funds must never enter this repo.

Also independently confirms two earlier corrections: the testkit uses
`/api/v4/graphql` and `networkId: 'undeployed'`.

---

## 2026-08-13 · Yarn 4 · root devDependencies are not on a workspace script's PATH

**Symptom.** `yarn workspace @mra/network run check` fails with
`command not found: tsc`, while `yarn tsc --version` at the root prints 6.0.3 and
`node_modules/.bin/tsc` exists and runs.

**Cause.** Yarn 4 is stricter than npm: a workspace script only gets binaries
from that workspace's own dependencies. `typescript` declared once as a root
devDependency is invisible to `packages/*/scripts`.

**Fix.** Two options — duplicate `typescript`/`vitest` into every workspace (what
upstream midnight-js does), or let the root drive it. We do the latter:
`tsconfig.json` is a solution-style file referencing every workspace, and the
root `check` script is just `tsc -b`. One dependency declaration, one command,
whole-repo coverage.

Two related traps while wiring this up:

- **`tsc -b` fails hard on a workspace whose `include` matches no files**
  (`TS18003`). `apps/tokenised-deposit` and `apps/rwa-token` are deliberately
  absent from the root references until they have source.
- **`"types": ["node"]` is required** in the shared tsconfig or `process` is
  unresolved, even with `@types/node` installed and `@tsconfig/node24` extended.

---

## 2026-08-13 · Yarn 4 · build scripts are disabled, and it does not matter here

`yarn install` warns that `classic-level` and `msgpackr-extract` "list build
scripts, but all build scripts have been disabled" — `enableScripts` is `false`
from this machine's global Yarn config, not from anything in this repo.

`classic-level` is the native LevelDB binding behind
`midnight-js-level-private-state-provider`, so this looks alarming. It is fine
**on this platform**: the package ships prebuilds including `linux-x64`, and a
round-trip open/put/get against a real LevelDB succeeds.

It would break on a platform with no matching prebuild. If the private state
provider fails to load on some other machine, set `enableScripts: true` in
`.yarnrc.yml` before debugging anything else.

---

## 2026-08-13 · midnight-js 5.x + wallet-sdk 2.x · the wallet bridge, in four traps

Deploying needs a `WalletProvider` and a `MidnightProvider`. The wallet SDK
implements **neither**, and the mismatches are not obvious. All four below cost
real time; the adapter lives in `packages/wallet/src/providers.ts`.

**1. Public keys must be bech32m strings, not objects.**
`WalletProvider.getCoinPublicKey()` must return a string. The wallet SDK gives
you a `ShieldedCoinPublicKey` object whose `toString()` is `"[object Object]"`.
Pass it raw and deploy dies far from the cause:

```
TypeError: bech32.decode input: string expected
  at parseCoinPublicKeyToHex (midnight-js-utils)
  at createUnprovenDeployTx (midnight-js-contracts)
```

The fix is each class's **static** `codec`:

```ts
ShieldedCoinPublicKey.codec.encode(networkId, cpk).asString()
// -> mn_shield-cpk_undeployed1tth9g6jf8he6…
```

`MidnightBech32m.encode(networkId, item)` looks the codec up on the *instance*
(`item[Bech32mSymbol]`), and these two classes only carry it statically, so that
route throws `Cannot read properties of undefined (reading 'encode')`. That error
looks like a duplicate-package/symbol-identity problem — it is not. Check for
duplicates once, then stop chasing it.

**2. `balanceTx` is one call in midnight-js and two in the wallet SDK.**
midnight-js expects `balanceTx(tx, ttl?) -> FinalizedTransaction`. The SDK splits
it: `balanceUnboundTransaction(...)` returns a *recipe* (base plus optional
balancing transaction), and `finalizeRecipe(recipe)` produces the finalized
transaction. Do both, in that order.

**3. The proof provider needs the ZK config provider.**
`httpClientProofProvider(url, zkConfigProvider, config?)` — not `(url)`. It
resolves proving keys by location while proving, so build the ZK config provider
first and pass it in.

**4. Private state encryption is mandatory, and the password policy is enforced.**
`levelPrivateStateProvider` requires `accountId` **and**
`privateStoragePasswordProvider`. There is no plaintext mode. The password must
be 16+ characters, contain at least 3 of upper/lower/digit/special, and have no
more than 3 identical characters in a row. `accountId` scopes stored state per
wallet, so two wallets on one machine do not read each other's state.

---

## 2026-08-13 · midnight-js 5.x · contracts are described in the Effect idiom

`deployContract` does not take the generated contract. It takes a
`CompiledContract`, built with a tag, the generated **constructor** (not an
instance), and combinators:

```ts
const compiledContract = CompiledContract.make('counter', Contract).pipe(
  CompiledContract.withVacantWitnesses,              // counter declares none
  CompiledContract.withCompiledFileAssets(ZK_PATH),  // the managed/ directory
);
```

Passing `new Contract({})` fails with *"missing the following properties …:
tag, pipe"*, which is the tell. Import `CompiledContract` from
`@midnight-ntwrk/midnight-js-protocol/compact-js`.

Bonus: once built, the circuit ids are inferred, so
`createProviders<'increment'>(…)` type-checks against the real contract.

---

## 2026-08-13 · localnet · end-to-end timings are much faster than budgeted

First full success on the pinned RC3 stack, counter contract:

| Step | Time |
|---|---|
| Wallet sync (localnet, genesis seed) | 0.3 s |
| Deploy — prove + submit | **18.5 s** |
| `increment()` — prove + submit | **17.2 s** |

Round went `0` → `1`, read back from the indexer both times.

The standing guidance of ~40 s to submit and ~70 s per proved call is therefore
**conservative for a trivial circuit on localnet**. Do not design for 18 s: the
counter has one tiny circuit and localnet has no competing traffic. But do treat
40/70 as a budget rather than a measurement, and re-measure per contract — a
confidential-token transfer will not behave like this.

Genesis seed `…0002` (index 0 in `LOCALNET_GENESIS_SEEDS`) is funded with
250,000,000,000,000 unshielded, three shielded token types, and 5 DUST coins —
ample for development.

---

## 2026-08-13 · browser + Vite · "Expected BN, actual 581" — a success reported as a failure

**The best trap so far.** Deploying from the browser failed with:

```
Transaction submission error
  ↳ Failed to parse result provided by node
     ↳ ParseError: { readonly blockNumber: BN }
        └─ ["blockNumber"] └─ Expected BN, actual 581
```

581 is the block number the transaction **was already included in**. The
transaction succeeded; only parsing the node's success response failed. Retrying
deploys again and burns another block.

**Cause.** The wallet SDK's node-client validates RPC results with a schema that
does an `instanceof BN` check. Vite's dependency pre-bundling gave
`@polkadot/util` one copy of `bn.js` and the schema another, so a perfectly valid
BN failed `instanceof`. The message reads as a type error because BN prints as its
numeric value — it looks like a plain number, but it is a BN of the wrong class.

**Fix.** Dedupe at the *bundler* level in `vite.config.ts`:

```ts
resolve: { dedupe: ['bn.js', '@polkadot/util', '@polkadot/api', '@polkadot/types'] },
optimizeDeps: { include: ['bn.js'] },
```

A yarn-level `resolutions: { "bn.js": "5.2.5" }` is **not sufficient on its own**
— we tried it first and the error was identical. npm had already hoisted a single
copy; the duplication was created by the bundler. Clear `node_modules/.vite`
after changing this or the stale pre-bundle keeps the old behaviour.

Note also that the hoisted `bn.js` was 4.12.5, dragged in by
`vite-plugin-node-polyfills` → `asn1.js`, while everything else wanted 5.x. The
resolution is still worth keeping to avoid a genuine version split.

**How to find this class of bug.** Effect rejects with a `FiberFailure` whose real
`Cause` hangs off a **symbol**, invisible to both `error.cause` and
`Object.getOwnPropertyNames`. Walk `Object.getOwnPropertySymbols(error)` to see
it — `apps/counter/web/src/App.tsx` does this and it is the only reason this was
diagnosable at all.

---

## 2026-08-13 · browser · the client-side stack works, with three swaps

The counter deploys and increments **entirely in the browser** — no backend.
Verified in headless Firefox via `apps/counter/web/e2e.mjs`:

| Step | Browser | Node (for comparison) |
|---|---|---|
| Wallet build + sync | 1.8 s | 0.3 s |
| Deploy (prove + submit) | 18.2 s | 18.5 s |
| `increment()` | 18.6 s | 17.2 s |

Proving happens against the local proof server from the page
(`POST localhost:6300/prove` → 200), so nothing secret leaves the machine.

What had to change from the Node path — everything else, including both wallet
adapters, is shared:

1. **`zkConfigProvider`** — `NodeZkConfigProvider` reads from disk. Use
   `FetchZkConfigProvider` and serve the compiler's `managed/` directory over
   HTTP. Its second argument is an **options object** (`{ fetchFunc }`), not a
   fetch function; passing a bare `fetch` silently lands in `integrityOptions`.
2. **`privateStateProvider`** — `classic-level` is a native binding. Inject
   `browser-level` through the provider's `levelFactory` hook for IndexedDB.
3. **Vite plugins** — `vite-plugin-wasm` (ledger-v9 is WASM) and
   `vite-plugin-node-polyfills` (the SDK uses `Buffer` and `process`).
   `vite-plugin-top-level-await` is *not* needed with `build.target: 'esnext'`,
   and it additionally requires `rollup` to be installed.

CORS is not a problem: all three services already send permissive headers, and
the proof server echoes the page origin back.

Bundle size is the real cost — **~14 MB uncompressed, ~5.9 MB gzipped**, almost
entirely the two WASM blobs (ledger 10.3 MB, onchain runtime 1.4 MB). Any product
UI needs to plan for that: lazy-load the wallet layer, and never block first paint
on it.

---

## 2026-08-13 · localnet · proving is fast; block inclusion is what costs ~18 s

Measured once the infrastructure panel could observe the proof server directly.
For the counter contract:

| | Time |
|---|---|
| `POST /prove` (proof server's own log) | **0.03 – 0.38 s** |
| Full deploy or `increment()` | **~18 s** |

So proof generation is well under a second, and essentially all of the ~18 s is
waiting for the transaction to be included in a block. Localnet produces a block
roughly every 6 s, and submission waits for `InBlock`.

This reframes the standing "~40 s submit / ~70 s per proved call, design for
minutes" guidance: for a trivial circuit the cost is **chain latency, not ZK**.
Do not conclude that proving is cheap in general — the counter has one tiny
circuit, and a confidential-token transfer will shift the balance. But do measure
the two separately before optimising, because they are optimised by completely
different means, and the intuition "ZK is the slow part" is wrong here.

The UI labels this row `last /prove` rather than `last proof` for exactly this
reason.

**Watch out** when instrumenting this client-side: patching `fetch` to time proof
server calls will also catch the panel's own `GET /version` health polls, which
complete in ~0.00006 s and will happily overwrite the real figure every couple of
seconds. Filter to `POST`.

---

## 2026-08-13 · observability · what each component will actually tell you

Building a live view of the stack, the three components differ enormously.

| Component | Available |
|---|---|
| **Node** (9944) | Rich. `system_health` (peers, isSyncing), `system_version`, `chain_getHeader`, `chain_getFinalizedHead`, and `author_pendingExtrinsics` — the mempool, so you can watch a transaction wait. Plus ws subscriptions (`chain_subscribeNewHead`). |
| **Indexer** (8088) | Rich. GraphQL with subscriptions: `blocks`, `contractActions`, `contractEvents`, `shieldedTransactions`, `unshieldedTransactions`, `zswapLedgerEvents`. `{ block { height } }` gives its indexed height — compare with the node's for **lag**, which is what actually explains "why hasn't my state updated yet". |
| **Proof server** (6300) | Almost nothing. `/`, `/version`, `/health`, `/ready` all 200; **`/metrics` and `/status` 404**. No activity introspection at all. |

Because of that last row, `ops/log-sidecar` exists: a dev-only SSE service that
tails `docker logs -f` for all three so the page can show the proof server's
`--verbose` output. It binds to 127.0.0.1 only, and container names come from a
fixed allowlist so nothing from a request reaches `spawn`.

Two things to handle when piping container logs into a browser:

- **Strip ANSI.** The proof server logs through actix with colour on, which
  arrives as escape sequences and renders as `[2m…[0m [32m INFO[0m`.
- **Truncate.** Its DEBUG output dumps the entire proving preimage as hex —
  thousands of characters of witness-derived data per request. That both swamps
  the panel and is not something to render in a UI or capture in a screenshot.

---

## 2026-08-13 · browser UI · making a page genuinely non-scrolling is fiddlier than it looks

Three separate things had to be true, and each failed in a way that looked like
something else.

**1. `height: 100%` is not a viewport constraint.** Percentage height only
resolves against an ancestor with a definite height. When that chain broke,
`main` silently grew to 1155 px inside an 820 px viewport — `getBoundingClientRect`
reported the larger box, so the element really was oversized rather than
overflowing. `height: 100vh` plus `overflow: hidden` on the outermost element
removes the dependency entirely.

**2. `overflow: hidden` stops the *user* scrolling, not the *browser*.** Two
mechanisms scroll a hidden-overflow element programmatically:

- `scrollIntoView()` scrolls **ancestors**, not just the target's own scroll box.
  Auto-scrolling a log tail this way dragged the whole page up and left the header
  off-screen with no way to get it back. Set `container.scrollTop =
  container.scrollHeight` instead — that touches only the container.
- **Focusing** an element inside an overflowing container makes the browser scroll
  it into view. Clicking a button low in the page was enough. This one only
  disappears once nothing overflows, i.e. after fix 1.

**3. Every flex/grid ancestor of a scroll container needs `min-height: 0`.**
Otherwise the inner scroller's content sets a minimum size and the container grows
instead of scrolling.

Worth asserting rather than eyeballing, since all three fail *visually* in the
same way. `apps/counter/web/e2e.mjs` now checks, in a real browser:

```
drawers: 3 · header visible: yes · page scrolls: no
  (scrollHeight 820 vs innerHeight 820, body overflow-y hidden)
```

Also: screenshot a fixed layout with `fullPage: false`. `fullPage: true` on an
`overflow: hidden` page produces a misleading capture — it rendered a tall image
with the header cropped and empty space below, which read as a layout bug when the
layout was fine.

---

## 2026-08-13 · Firefox · EventSource to 127.0.0.1 fails from a localhost page despite correct CORS

**Symptom.** The page cannot read the log sidecar:

```
Cross-Origin Request Blocked: … at http://127.0.0.1:8899/logs
(Reason: CORS request did not succeed). Status code: (null)
```

**Not a header problem.** `curl -H 'Origin: http://localhost:5173'` against the
same endpoint returns `Access-Control-Allow-Origin: http://localhost:5173` and
streams fine. "Status code: (null)" means the request failed below HTTP, so no
amount of header tuning fixes it — Firefox is refusing the cross-origin local
request itself.

**Fix.** Do not make it cross-origin. A Vite dev proxy maps `/__logs` →
`http://127.0.0.1:8899/logs`, so the page uses a same-origin path and CORS never
enters the picture. The sidecar then needs no CORS configuration at all (its
headers are kept only so `curl` and other clients still work).
