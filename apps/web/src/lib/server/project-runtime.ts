// Free-port allocation + the PATH preamble for spawning dev servers in a
// terminal. Detection moved to packages/domain so the prompt assembler can
// reach it (RULE arch.domain-no-app-imports); re-exported here for callers.
import * as net from "node:net";

export {
  detectPackageManager,
  detectBuildCommand,
  detectDevCommands,
  resolvePackageDirs,
  CACHE_DIRS,
} from "@agent-office/domain/services/projects/project-runtime";

export const PM_PATH_SETUP =
  [
    '[ -d "$HOME/.local/share/pnpm" ] && export PATH="$HOME/.local/share/pnpm:$PATH"',
    'export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"',
    'command -v nvm >/dev/null && { nvm use default >/dev/null 2>&1 || nvm use node >/dev/null 2>&1 || nvm use --lts >/dev/null 2>&1 || true; }',
    '[ -d "$HOME/.bun/bin" ] && export PATH="$HOME/.bun/bin:$PATH"',
  ].join("; ") + "; ";

// ─── Free-port allocation (dev servers) ──────────────────────────────────────

// Module-level set prevents two concurrent requests from picking the same port in
// the window between the "port is free" check and the process actually binding it.
const reservedPorts = new Set<number>();

/** First free TCP port at/after `start`, reserved briefly so concurrent callers
 *  don't collide before the child process binds it. */
export async function findFreePort(start = 3001): Promise<number> {
  for (let port = start; port < start + 200; port++) {
    if (reservedPorts.has(port)) continue;
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      srv.listen(port, "127.0.0.1");
    });
    if (free) {
      reservedPorts.add(port);
      setTimeout(() => reservedPorts.delete(port), 30_000).unref();
      return port;
    }
  }
  return start;
}
