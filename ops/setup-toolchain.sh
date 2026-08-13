#!/usr/bin/env bash
#
# Installs the pinned Compact toolchain into ./.toolchain (gitignored).
#
# We fetch the exact release asset rather than using `compact update`, because
# this repo's whole premise is that the stack is reproducible: the version comes
# from ops/versions.lock.json and nothing silently drifts to "latest".
#
# Idempotent — re-running with the toolchain already present is a no-op.
#
# Usage:  ./ops/setup-toolchain.sh [--force]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$REPO_ROOT/ops/versions.lock.json"
TOOLCHAIN_DIR="$REPO_ROOT/.toolchain"
GH_REPO="LFDT-Minokawa/compact"

die() { echo "error: $*" >&2; exit 1; }

for cmd in curl unzip jq; do
  command -v "$cmd" >/dev/null || die "$cmd is required but not installed"
done

VERSION="$(jq -r '.stack.compactCompiler' "$LOCK_FILE")"
[ -n "$VERSION" ] && [ "$VERSION" != "null" ] || die "could not read .stack.compactCompiler from $LOCK_FILE"

INSTALL_DIR="$TOOLCHAIN_DIR/compactc-$VERSION"

if [ -x "$INSTALL_DIR/compactc" ] && [ "${1:-}" != "--force" ]; then
  echo "Compact toolchain $VERSION already installed at $INSTALL_DIR"
  echo "Re-run with --force to reinstall."
  exit 0
fi

# The release publishes one zip per platform triple.
case "$(uname -s)-$(uname -m)" in
  Linux-x86_64)   ASSET_ARCH="x86_64-unknown-linux-musl" ;;
  Linux-aarch64)  ASSET_ARCH="aarch64-unknown-linux-musl" ;;
  Darwin-x86_64)  ASSET_ARCH="x86_64-darwin" ;;
  Darwin-arm64)   ASSET_ARCH="aarch64-darwin" ;;
  *) die "unsupported platform: $(uname -s)-$(uname -m)" ;;
esac

TAG="compactc-v$VERSION"
ASSET="compactc_v${VERSION}_${ASSET_ARCH}.zip"
URL="https://github.com/$GH_REPO/releases/download/$TAG/$ASSET"

echo "Installing Compact toolchain $VERSION ($ASSET_ARCH)"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "  fetching $ASSET"
curl -fsSL --retry 3 -o "$TMP_DIR/$ASSET" "$URL" \
  || die "download failed: $URL"

echo "  sha256: $(sha256sum "$TMP_DIR/$ASSET" | cut -d' ' -f1)"

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
unzip -q "$TMP_DIR/$ASSET" -d "$INSTALL_DIR"
chmod +x "$INSTALL_DIR"/* 2>/dev/null || true

# Prove it runs before claiming success.
[ -x "$INSTALL_DIR/compactc" ] || die "compactc missing after extraction"
REPORTED="$("$INSTALL_DIR/compactc" --version 2>&1 | head -1 || true)"

ln -sfn "compactc-$VERSION" "$TOOLCHAIN_DIR/current"

cat <<EOF

Installed to $INSTALL_DIR
  compactc --version: ${REPORTED:-<no output>}

Binaries: compactc, zkir, zkir-v3, format-compact, fixup-compact

Add to PATH for this shell:
  export PATH="\$PWD/.toolchain/current:\$PATH"

Reminder: --feature-zkir-v3 requires the _experimental proof-server build.
EOF
