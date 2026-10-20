// The one place a `claude` process is started (docs/conventions.md, "spawn.claude-one-site").
// cross-spawn: `claude` is a `.cmd` shim on Windows, which plain child_process refuses without a
// shell, and a shell concatenates args unescaped.
import spawn from "cross-spawn";
import type { ChildProcess, SpawnOptions } from "node:child_process";

/** AO_CLAUDE_BIN is for tests: an absolute stub path no install on PATH can shadow. */
export const claudeBin = (): string => process.env.AO_CLAUDE_BIN ?? "claude";

export function spawnClaude(args: string[], options: SpawnOptions): ChildProcess {
  return spawn(claudeBin(), args, options);
}
