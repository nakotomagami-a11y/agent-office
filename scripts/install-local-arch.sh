#!/usr/bin/env bash
#
# install-local-arch.sh — Arch/CachyOS counterpart to install-local.sh.
#
# install-local.sh ends in `sudo dpkg -i`, which does not exist on Arch, so on
# this distro that script can only fail at the last step. This builds the same
# .deb and repacks its payload through packaging/arch/PKGBUILD, so the app is
# owned by pacman and uninstalls with `sudo pacman -R agent-office`.
#
# Quirks it carries, each of which cost a debugging session:
#   1. `--bundles deb` only. tauri.conf.json sets bundle.targets="all"; the
#      rpm/appimage stage xz-compresses the multi-GB payload and stalls 15+ min.
#   2. createUpdaterArtifacts off. It signs with TAURI_SIGNING_PRIVATE_KEY,
#      which exists only as a CI secret, so the build otherwise fails at the
#      very last step — after the .deb is already written.
#   3. pkgrel is a timestamp. `pacman -U` refuses an identical pkgver-pkgrel,
#      which is exactly what a second local build of one version produces.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"
ARCH_DIR="$REPO_ROOT/packaging/arch"
DEB_DIR="$WEB_DIR/src-tauri/target/release/bundle/deb"

for cmd in makepkg pacman sudo node pnpm; do
  command -v "$cmd" >/dev/null || { echo "==> ERROR: $cmd not found — this script is for Arch." >&2; exit 1; }
done

echo "==> Building Agent Office from working tree: $REPO_ROOT"
# Marker so a stale .deb from an older build can never be packaged as this one.
MARKER="$(mktemp)"
trap 'rm -f "$MARKER"' EXIT

( cd "$WEB_DIR" && pnpm tauri build --bundles deb \
    --config '{"bundle":{"createUpdaterArtifacts":false}}' )

DEB="$(find "$DEB_DIR" -maxdepth 1 -name '*.deb' -newer "$MARKER" -printf '%T@ %p\n' 2>/dev/null \
        | sort -rn | head -1 | cut -d' ' -f2-)"
if [[ -z "$DEB" ]]; then
  echo "==> ERROR: no fresh .deb was produced — the build genuinely failed." >&2
  exit 1
fi
echo "==> Built: $DEB"
# The PKGBUILD re-globs the newest .deb rather than taking this path, so the
# check above is "a fresh one exists", not "that exact file gets packaged".
# Same dir, same sort, one build in flight — but keep them in step if that changes.

echo "==> Repacking into a pacman package..."
rm -rf "$ARCH_DIR/src" "$ARCH_DIR/pkg"
rm -f "$ARCH_DIR"/*.pkg.tar.zst
# PKGBUILD finds the newest .deb itself; pkgver is kept in step by
# set-version.mjs and asserted by check-version-sync.mjs, so it is not touched
# here — only pkgrel, which exists to separate rebuilds of one version.
( cd "$ARCH_DIR" && AO_PKGREL="$(date +%s)" makepkg -f --noconfirm )

PKG="$(find "$ARCH_DIR" -maxdepth 1 -name '*.pkg.tar.zst' -printf '%T@ %p\n' \
        | sort -rn | head -1 | cut -d' ' -f2-)"
[[ -n "$PKG" ]] || { echo "==> ERROR: makepkg produced no package." >&2; exit 1; }

echo "==> Installing: $PKG"
# Absolute path on purpose: pkexec, the other way to run this, resets the
# working directory and cannot see a relative one.
sudo pacman -U --noconfirm "$PKG"

echo "==> Installed:"
pacman -Q agent-office
echo "==> Quit and relaunch the app — the embedded server does not hot-reload."
