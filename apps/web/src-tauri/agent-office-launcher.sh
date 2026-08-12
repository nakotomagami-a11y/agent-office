#!/bin/bash
# Agent Office launcher — resolves Node.js (NVM-aware), starts the Next.js
# production server, waits for it, then opens the Tauri window.

SERVER_JS="/usr/share/agent-office/server/apps/web/server.js"
PORT=5173

# --- Resolve node binary ---
# Desktop sessions don't source .bashrc/.profile, so NVM is not on PATH.
# Walk ~/.nvm/versions/node/ and pick the newest installed version.
NODE_BIN=""
NVM_VERSIONS_DIR="$HOME/.nvm/versions/node"
if [ -d "$NVM_VERSIONS_DIR" ]; then
  NODE_BIN="$(ls -t "$NVM_VERSIONS_DIR"/*/bin/node 2>/dev/null | head -1)"
fi
# Fall back to whatever is on PATH (e.g. system node or /usr/local/bin/node)
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null)}"

if [ -z "$NODE_BIN" ]; then
  notify-send "Agent Office" "Node.js not found. Install it via nvm or https://nodejs.org" 2>/dev/null
  exit 1
fi

# Kill any leftover server from a previous session
pkill -f "agent-office.*server.js" 2>/dev/null

# Start the Next.js production server in the background
PORT=$PORT HOSTNAME=127.0.0.1 "$NODE_BIN" "$SERVER_JS" &
SERVER_PID=$!

# Wait until the server is accepting connections (max 15s)
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" -o /dev/null 2>/dev/null; then
    break
  fi
  sleep 0.5
done

# Launch the Tauri binary
/usr/bin/app "$@"
EXIT_CODE=$?

# Clean up the server when the window closes
kill $SERVER_PID 2>/dev/null
wait $SERVER_PID 2>/dev/null

exit $EXIT_CODE
