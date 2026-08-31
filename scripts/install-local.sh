#!/usr/bin/env bash
#
# install-local.sh — build the current working tree into a .deb and install it,
# so the running app reflects the latest source (including uncommitted changes).
#
# Invoked via `pnpm install:local` from the repo root.
#
# Handles two known quirks of this project's Tauri build:
#   1. `tauri build` exits non-zero at the very end on the updater-signing step,
#      but the .deb is already produced by then. We therefore judge success by
#      whether a FRESH .deb appeared, not by the build's exit code.
#   2. The package version is frozen (0.0.7), so dpkg shows "0.0.7 -> 0.0.7" and
#      gives no visual confirmation. We verify the install by /usr/bin/app mtime.
#
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
DEB_DIR="$WEB_DIR/src-tauri/target/release/bundle/deb"

echo "==> Building Agent Office from working tree: $REPO_ROOT"

# Marker so we only accept a .deb produced by THIS run.
START_MARKER="$(mktemp)"
trap 'rm -f "$START_MARKER"' EXIT

# The signing step at the end exits non-zero; the .deb is done before that.
# Tolerate the non-zero exit here and validate by artifact freshness below.
( cd "$WEB_DIR" && pnpm tauri build ) || echo "==> tauri build returned non-zero (expected on the updater-signing step) — checking artifacts..."

# Newest .deb strictly newer than the build-start marker.
DEB="$(find "$DEB_DIR" -maxdepth 1 -name '*.deb' -newer "$START_MARKER" -printf '%T@ %p\n' 2>/dev/null \
        | sort -nr | head -1 | cut -d' ' -f2-)"

if [[ -z "$DEB" ]]; then
  echo "==> ERROR: no fresh .deb was produced — the build genuinely failed. Not installing." >&2
  exit 1
fi

echo "==> Installing: $DEB"
sudo dpkg -i "$DEB"

echo "==> Installed. /usr/bin/app is now:"
ls -la --time-style=+%Y-%m-%dT%H:%M:%S /usr/bin/app
echo "==> Launch it with:  app   (or from your app menu: Agent Office)"
