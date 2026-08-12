#!/usr/bin/env bash
# Rebuild Agent Office and install the fresh .deb locally.
# Usage: ./reinstall-linux.sh   (run from apps/web/)
set -euo pipefail
cd "$(dirname "$0")"

# Scoped to deb only, updater artifacts disabled: createUpdaterArtifacts in
# tauri.conf.json runs regardless of --bundles and needs TAURI_SIGNING_PRIVATE_KEY,
# which only exists as a GitHub Actions secret, not on this machine.
pnpm tauri build --bundles deb --config '{"bundle":{"createUpdaterArtifacts":false}}'

DEB=$(find src-tauri/target/release/bundle/deb -maxdepth 1 -name '*.deb' -printf '%T@ %p\n' | sort -rn | head -1 | cut -d' ' -f2-)
if [ -z "$DEB" ]; then
  echo "No .deb found after build" >&2
  exit 1
fi

echo "Installing: $DEB"
sudo dpkg -i "$DEB"

echo "Installed binary mtime:"
stat -c '%y %n' /usr/bin/app
