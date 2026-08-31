#!/usr/bin/env bash
# Screenshot workflow — boots an isolated, fake-data instance of the app and
# captures every page (plus a few representative chat states) to screenshots/.
#
# Safe to re-run any time the UI changes: it never touches your real
# `~/.claude` state or your real dev server (whatever's already running on
# :3001 stays untouched — this uses a scratch HOME + a second dev server on
# a different port + a different Next `distDir`).
#
# Usage:
#   bash scripts/screenshot-app.sh              # seed + capture + teardown
#   bash scripts/screenshot-app.sh --keep        # leave the scratch server running
#   SHOT_OUT=./tmp-shots bash scripts/screenshot-app.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT/apps/web"
SHOT_HOME=/tmp/ao-showcase-home
SHOT_PORT=3009
SHOT_DIST_DIR=.next-shot
SHOT_OUT="${SHOT_OUT:-$ROOT/screenshots}"
LOG=/tmp/ao-showcase-dev.log
KEEP=false
[[ "${1:-}" == "--keep" ]] && KEEP=true

echo "==> Rebuilding isolated showcase HOME ($SHOT_HOME)"
bash "$ROOT/scripts/screenshot-app-setup-home.sh"

echo "==> Starting scratch dev server on :$SHOT_PORT (distDir=$SHOT_DIST_DIR)"
( cd "$WEB_DIR" && HOME="$SHOT_HOME" NEXT_DIST_DIR="$SHOT_DIST_DIR" nohup npx next dev -p "$SHOT_PORT" > "$LOG" 2>&1 & disown )

cleanup() {
  if [[ "$KEEP" == "false" ]]; then
    echo "==> Stopping scratch dev server"
    pkill -f "next dev -p $SHOT_PORT" 2>/dev/null || true
  else
    echo "==> Leaving scratch dev server running on :$SHOT_PORT (HOME=$SHOT_HOME)"
  fi
}
trap cleanup EXIT

echo -n "==> Waiting for :$SHOT_PORT"
for _ in $(seq 1 30); do
  curl -sf "http://localhost:$SHOT_PORT/" -o /dev/null && { echo " up"; break; }
  echo -n "."
  sleep 2
done
curl -sf "http://localhost:$SHOT_PORT/" -o /dev/null || { echo; echo "server never came up — see $LOG"; exit 1; }

echo "==> Seeding showcase data"
curl -sX POST "http://localhost:$SHOT_PORT/api/dev/seed" -H 'content-type: application/json' -d '{"action":"showcase"}'
echo

echo "==> Enabling experimental integrations for the capture (iso-view is off by default)"
curl -sX PATCH "http://localhost:$SHOT_PORT/api/settings" -H 'content-type: application/json' -d '{"integrations":{"iso-view":true}}' -o /dev/null
echo

echo "==> Capturing screenshots -> $SHOT_OUT"
SHOT_BASE="http://localhost:$SHOT_PORT" node "$ROOT/scripts/screenshot-app.mjs" "$SHOT_OUT"

echo "==> Clearing showcase data"
curl -sX POST "http://localhost:$SHOT_PORT/api/dev/seed" -H 'content-type: application/json' -d '{"action":"clear-showcase"}'
echo
echo "==> Done."
