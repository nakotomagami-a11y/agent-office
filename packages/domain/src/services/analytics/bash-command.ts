/**
 * Which program a Bash tool call actually ran.
 *
 * Grouping tool calls by tool NAME makes the chart useless: Bash is ~94% of
 * every call, so it renders as one bar that says "Bash". What the user wants
 * to know is whether that is git, pnpm, grep or python3.
 *
 * Deliberately shallow — it reports the HEAD program of the command, not a
 * parse of the whole pipeline. `git log | grep x` is git, because that is the
 * thing the agent set out to do.
 */

/** Wrappers that are never the interesting program. */
const PREFIX_COMMANDS = new Set(["sudo", "nohup", "time", "command", "exec", "doas", "env"]);

/** Shell keywords: the command is control flow, not a program. */
const SHELL_KEYWORDS = new Set([
  "for", "while", "until", "if", "case", "do", "then", "else", "fi", "done", "function",
]);

/**
 * The head program of a shell command, or `null` when there isn't one.
 *
 * Strips the noise agents habitually prepend — a `cd` hop into the repo, env
 * assignments, `sudo`/`nohup` — because `cd x && pnpm build` is a pnpm call,
 * and bucketing it under "cd" would hide exactly what we are trying to see.
 */
export function headCommand(command: string): string | null {
  let c = command.trim();
  if (!c) return null;

  // Peel wrappers one layer at a time. Bounded: a real command nests a few
  // deep at most, and an unbounded loop on hostile input is a hang.
  for (let i = 0; i < 8; i++) {
    const before = c;
    c = c.replace(/^\(\s*/, "");                              // ( subshell
    c = c.replace(/^cd\s+[^\s&;|]+\s*(?:&&|;)\s*/, "");       // cd path && …
    c = c.replace(/^\w+=[^\s]*\s+/, "");                      // FOO=bar cmd
    const m = /^([A-Za-z_][\w.-]*)\s+/.exec(c);
    if (m && PREFIX_COMMANDS.has(m[1]!)) c = c.slice(m[0].length);
    if (c === before) break;
  }

  const m = /^([A-Za-z_][\w.-]*)/.exec(c);
  if (!m) return null;
  const head = m[1]!;
  if (SHELL_KEYWORDS.has(head)) return null;
  return head;
}

/**
 * Chart label for one tool call. Non-Bash tools keep their own name; a Bash
 * call becomes `Bash: git`. A Bash call whose command we could not read stays
 * plain `Bash` rather than being dropped — an unreadable call is still a call,
 * and silently discarding it would understate the total.
 */
export function toolCallLabel(toolName: string, rawInput: string | null): string {
  if (toolName !== "Bash") return toolName;
  let parsed: unknown;
  try {
    parsed = rawInput ? JSON.parse(rawInput) : undefined;
  } catch {
    return "Bash";
  }
  // arch.parse-dont-cast: narrow, never assert. This input is whatever the CLI
  // happened to emit — including `{}`, and including shapes from older builds.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "Bash";
  const command = (parsed as Record<string, unknown>).command;
  if (typeof command !== "string") return "Bash";
  const head = headCommand(command);
  return head ? `Bash: ${head}` : "Bash";
}
