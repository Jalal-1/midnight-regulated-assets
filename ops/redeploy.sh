#!/usr/bin/env bash
#
# One-command redeploy. MUST survive a full localnet reset (down -v && up).
# If this ever needs a second command or a manual step, that is a bug.
#
# Stage 1 (compile) works. Stage 2 (deploy) is not implemented yet.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLCHAIN="$REPO_ROOT/.toolchain/current"

[ -x "$TOOLCHAIN/compactc" ] || {
  echo "error: Compact toolchain not installed. Run ./ops/setup-toolchain.sh" >&2
  exit 1
}
export PATH="$TOOLCHAIN:$PATH"

# ZKIR v3 by default: contracts built with it only verify against the
# _experimental proof-server build, which is what ops/localnet pins.
#
# Per-contract opt-out: a source containing the marker line
#   // compactc-flags: no-zkir-v3
# compiles WITHOUT the flag. Exists for exactly one reason so far: the OZ
# ConfidentialFungibleToken trips an internal compiler error in the zkir-v3
# passes ("cannot-happen, zkir-v3-passes.ss:558") but compiles clean without
# it, and the experimental proof server accepts both IR versions.
COMPACTC_FLAGS=(--feature-zkir-v3)

echo "Compact $(compactc --version), language $(compactc --language-version)"
echo

# Every .compact under apps/*/contract/ compiles to managed/<contract-name>/ —
# per-contract, because an app can ship several contracts and a shared managed/
# would let the last one silently overwrite the rest.
shopt -s nullglob
found=0
for source in "$REPO_ROOT"/apps/*/contract/*.compact; do
  found=1
  app="$(basename "$(dirname "$(dirname "$source")")")"
  name="$(basename "$source" .compact)"
  target="$(dirname "$source")/managed/$name"
  flags=("${COMPACTC_FLAGS[@]}")
  if grep -q '^// compactc-flags: no-zkir-v3' "$source"; then
    flags=()
    printf '  %-20s %s  (no zkir-v3 — see marker in source)\n' "$app" "$(basename "$source")"
  else
    printf '  %-20s %s\n' "$app" "$(basename "$source")"
  fi
  compactc "${flags[@]}" "$source" "$target"
done
[ "$found" = 1 ] || { echo "no .compact sources found"; exit 1; }

echo
echo "Compiled. Deploy stage not implemented yet — needs the wallet wrapper"
echo "(packages/wallet) and midnight-js providers wired up. See README status."
exit 1
