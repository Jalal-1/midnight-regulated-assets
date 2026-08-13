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

# ZKIR v3 everywhere: contracts built with it only verify against the
# _experimental proof-server build, which is what ops/localnet pins.
COMPACTC_FLAGS=(--feature-zkir-v3)

echo "Compact $(compactc --version), language $(compactc --language-version)"
echo

# Every .compact under apps/*/contract/ compiles to a sibling managed/ dir.
shopt -s nullglob
found=0
for source in "$REPO_ROOT"/apps/*/contract/*.compact; do
  found=1
  app="$(basename "$(dirname "$(dirname "$source")")")"
  target="$(dirname "$source")/managed"
  printf '  %-20s %s\n' "$app" "$(basename "$source")"
  compactc "${COMPACTC_FLAGS[@]}" "$source" "$target"
done
[ "$found" = 1 ] || { echo "no .compact sources found"; exit 1; }

echo
echo "Compiled. Deploy stage not implemented yet — needs the wallet wrapper"
echo "(packages/wallet) and midnight-js providers wired up. See README status."
exit 1
