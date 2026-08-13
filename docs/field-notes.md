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
