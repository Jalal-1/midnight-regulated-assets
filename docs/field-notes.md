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

## 2026-08-13 · indexer API path · silent 404 instead of a useful error

**Symptom.** Queries to `/api/v1/graphql` 404 with nothing explaining why.

**Cause.** The indexer's GraphQL path is version-scoped and moves with the image
(`v3` on the 4.3.x preview line, `v4` on Stagenet). It is easy to copy a path
from the wrong repo's tests.

**Fix.** `packages/network` derives the path from a single
`INDEXER_API_VERSION` constant rather than hardcoding it per network.
Stagenet is `/api/v4/graphql`.
