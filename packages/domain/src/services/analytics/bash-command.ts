/**
 * Which program a Bash tool call ran. Bash is ~94% of calls, so grouping by
 * tool NAME renders one useless bar; this reports the HEAD program instead
 * (`git log | grep x` is git). A scanner, not regexes: three review rounds
 * each found another quote-blind regex inventing a "program" that was really
 * a filename, `cd` or `export`. See bash-command.test.ts.
 */

const WRAPPERS = new Set(["sudo", "nohup", "time", "command", "exec", "doas", "env", "timeout"]);

const SEGMENT_BUILTINS = new Set(["cd", "export", "set", "unset", "declare", "local", "readonly", "alias", "source", "pushd", "popd"]);

const SHELL_KEYWORDS = new Set(["for", "while", "until", "if", "case", "function", "select", "eval", "trap"]);

const SEPARATORS = new Set([";", "&", "|", "\n"]);

function isSeparatorAt(c: string, i: number): boolean {
  return SEPARATORS.has(c.charAt(i));
}

/** One token, honouring quotes and `$( )`. */
function readToken(c: string, i: number): { text: string; next: number } {
  let text = "";
  let depth = 0;
  while (i < c.length) {
    const ch = c.charAt(i);
    if (depth === 0 && /\s/.test(ch)) break;
    if (depth === 0 && isSeparatorAt(c, i)) break;
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < c.length && c.charAt(i) !== quote) {
        text += c.charAt(i);
        i += 1;
      }
      i += 1;
      continue;
    }
    if (ch === "$" && c.charAt(i + 1) === "(") {
      depth += 1;
      i += 2;
      continue;
    }
    if (ch === ")" && depth > 0) {
      depth -= 1;
      i += 1;
      continue;
    }
    text += ch;
    i += 1;
  }
  return { text, next: i };
}

function skipToNextSegment(c: string, i: number): number {
  while (i < c.length) {
    const ch = c.charAt(i);
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < c.length && c.charAt(i) !== quote) i += 1;
      i += 1;
      continue;
    }
    if (ch === "$" && c.charAt(i + 1) === "(") {
      i = skipSubstitution(c, i + 2);
      continue;
    }
    if (isSeparatorAt(c, i)) {
      while (i < c.length && isSeparatorAt(c, i)) i += 1;
      return i;
    }
    i += 1;
  }
  return i;
}

/** Index just past a `$( … )` whose body starts at `i`. */
function skipSubstitution(c: string, i: number): number {
  let depth = 1;
  while (i < c.length && depth > 0) {
    const ch = c.charAt(i);
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    i += 1;
  }
  return i;
}

const ASSIGNMENT = /^[A-Za-z_]\w*=/;
const PROGRAM = /^[A-Za-z_][\w.-]*$/;

/** `timeout 90 claude` — step past the duration/flag args to the program. */
function skipTimeoutArgs(c: string, i: number): number {
  while (i < c.length) {
    const save = i;
    while (i < c.length && /\s/.test(c.charAt(i))) i += 1;
    const arg = readToken(c, i);
    if (!/^-|^[\d.]+[smhd]?$/.test(arg.text)) return save;
    i = arg.next;
  }
  return i;
}

/** Head program, or `null` (the caller then renders plain `Bash`). */
export function headCommand(command: string): string | null {
  const c = command.trim();
  if (!c) return null;

  let i = 0;
  for (let step = 0; step < 24 && i < c.length; step += 1) {
    while (i < c.length && (/\s/.test(c.charAt(i)) || c.charAt(i) === "(")) i += 1;
    if (i >= c.length) return null;

    const { text, next } = readToken(c, i);
    if (!text) return null;

    // `FOO=bar cmd` is a prefix; `FOO=bar; cmd` is its own statement.
    if (ASSIGNMENT.test(text)) {
      let j = next;
      while (j < c.length && /\s/.test(c.charAt(j))) j += 1;
      i = isSeparatorAt(c, j) ? skipToNextSegment(c, j) : next;
      continue;
    }
    if (WRAPPERS.has(text)) {
      i = text === "timeout" ? skipTimeoutArgs(c, next) : next;
      continue;
    }
    if (SEGMENT_BUILTINS.has(text)) {
      i = skipToNextSegment(c, next);
      continue;
    }
    if (SHELL_KEYWORDS.has(text)) return null;
    return PROGRAM.test(text) ? text : null;
  }
  return null;
}

/** Chart label; unreadable Bash stays plain `Bash`, never dropped. */
export function toolCallLabel(toolName: string, rawInput: string | null): string {
  if (toolName !== "Bash") return toolName;
  let parsed: unknown;
  try {
    parsed = rawInput ? JSON.parse(rawInput) : undefined;
  } catch {
    return "Bash";
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "Bash";
  if (!("command" in parsed)) return "Bash";
  const command = (parsed as { command: unknown }).command;
  if (typeof command !== "string") return "Bash";
  const head = headCommand(command);
  return head ? `Bash: ${head}` : "Bash";
}
