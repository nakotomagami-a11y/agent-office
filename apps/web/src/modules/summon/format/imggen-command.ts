// Reads the imggen invocations out of a Bash tool call so the chat can show one
// placeholder per image before any file exists. Mirrors imggen's argparse: a
// command argparse would reject, or one whose name/seed is only known at run time
// ($VAR, `cmd`), yields no job rather than placeholders that can never fill.
// Not recognised as a run (false negatives only): `bash -c`, `xargs`, `timeout`,
// and imggen inside if/for/while bodies or ( ) { } groups.

import { MAX_IMAGES_PER_JOB, MAX_JOBS_PER_COMMAND, imggenSlug } from "@agent-office/domain/config/generated-images";
import { asRecord, parseJson, strField } from "@/lib/json-narrow";

export interface ImggenJob {
  slug: string;
  count: number;
  /** null when imggen picks a random seed, so files can only be matched by time. */
  seeds: number[] | null;
  /** Detached from the tool call (`&` or run_in_background): may outlive the turn. */
  background: boolean;
  /** Seedless only: images earlier seedless jobs of the same slug in this command
   *  write first, since all of them share one start time and match by write order. */
  offset: number;
}

interface Token {
  text: string;
  /** Contains an expansion (`$…`, backticks) whose value only the shell knows. */
  dynamic: boolean;
}

const LONG_FLAGS = ["--negative", "--name", "--width", "--height", "--steps", "--cfg", "--sampler", "--scheduler", "--seed", "--count", "--checkpoint", "--help"];
const SHORT_FLAGS: Record<string, string> = { "-n": "--negative", "-W": "--width", "-H": "--height", "-c": "--count", "-h": "--help" };
const CONTROL = new Set([";", "&&", "||", "|", "&"]);
const PREFIXES = new Set(["nohup", "time", "exec", "env"]);
const MAX_ARG_CHARS = 16_000;
const MAX_SEED = 9_999_999_999;

/** End of a heredoc body that starts after index `from`: the index just past its delimiter line. */
function skipHeredoc(cmd: string, from: number, delim: string, stripTabs: boolean): number {
  let i = from;
  while (i < cmd.length) {
    const nl = cmd.indexOf("\n", i);
    const line = cmd.slice(i, nl === -1 ? cmd.length : nl);
    i = nl === -1 ? cmd.length : nl + 1;
    if ((stripTabs ? line.replace(/^\t+/, "") : line) === delim) break;
  }
  return i;
}

/** Body of a double-quoted word starting after index `i`; returns the closing quote's index. */
function readDoubleQuoted(cmd: string, i: number, add: (s: string, dynamic?: boolean) => void): number {
  let j = i + 1;
  for (; j < cmd.length && cmd[j] !== '"'; j++) {
    if (cmd[j] === "\\" && cmd[j + 1] === "\n") j++;
    else if (cmd[j] === "\\" && '"\\$`'.includes(cmd[j + 1] ?? "")) add(cmd[++j]!);
    else add(cmd[j]!, cmd[j] === "$" || cmd[j] === "`");
  }
  add("");
  return j;
}

/** The control operator at `i` (`;` for a newline), or null for plain whitespace. */
function operatorAt(cmd: string, i: number): string | null {
  const c = cmd[i]!;
  if (c === "\n") return ";";
  return ["&&", "||"].find((o) => cmd.startsWith(o, i)) ?? (";&|".includes(c) ? c : null);
}

/** Shell-ish split. Control operators and newlines become their own tokens; quotes,
 *  escapes, line continuations, comments and heredoc bodies are honoured. */
function tokenize(cmd: string): Token[] {
  const out: Token[] = [];
  const heredocs: Array<{ delim: string; stripTabs: boolean }> = [];
  let cur: Token | null = null;
  const add = (s: string, dynamic = false) => {
    cur = cur ?? { text: "", dynamic: false };
    cur.text += s;
    cur.dynamic ||= dynamic;
  };
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!;
    const heredoc = c === "<" && cmd[i + 1] === "<" && cmd[i + 2] !== "<" ? /^<<(-?)\s*(['"]?)([A-Za-z_]\w*)\2/.exec(cmd.slice(i)) : null;
    if (heredoc) {
      flush();
      heredocs.push({ delim: heredoc[3]!, stripTabs: heredoc[1] === "-" });
      i += heredoc[0].length - 1;
    } else if (c === "'") {
      const end = cmd.indexOf("'", i + 1);
      const stop = end === -1 ? cmd.length : end;
      add(cmd.slice(i + 1, stop));
      i = stop;
    } else if (c === '"') {
      i = readDoubleQuoted(cmd, i, add);
    } else if (c === "\\") {
      if (cmd[i + 1] !== "\n" && i + 1 < cmd.length) add(cmd[i + 1]!);
      i++;
    } else if (c === "#" && cur === null) {
      const nl = cmd.indexOf("\n", i);
      i = (nl === -1 ? cmd.length : nl) - 1;
    } else if (c === "&" && cur !== null && /[<>]$/.test((cur as Token).text)) {
      add(c);
    } else if (/\s/.test(c) || ";&|".includes(c)) {
      flush();
      const op = operatorAt(cmd, i);
      if (op) out.push({ text: op, dynamic: false });
      if (op === "&&" || op === "||") i++;
      if (c === "\n") heredocs.splice(0).forEach((h) => (i = skipHeredoc(cmd, i + 1, h.delim, h.stripTabs) - 1));
    } else {
      add(c, c === "$" || c === "`");
    }
  }
  flush();
  return out;
}

/** argparse's long-option abbreviation: an exact name or a unique prefix. */
function resolveLong(flag: string): string | null {
  if (LONG_FLAGS.includes(flag)) return flag;
  const hits = LONG_FLAGS.filter((f) => f.startsWith(flag));
  return hits.length === 1 ? hits[0]! : null;
}

function toInt(v: Token | undefined): number | null {
  return v && !v.dynamic && /^\d{1,10}$/.test(v.text) ? Number(v.text) : null;
}

/** Split `--flag=value` / `-Xvalue` into the canonical flag and an inline value. */
function splitFlag(text: string): { flag: string | null; inline?: string } {
  if (text.startsWith("--")) {
    const [name, inline] = text.includes("=") ? text.split(/=(.*)/s) : [text, undefined];
    return { flag: resolveLong(name!), inline };
  }
  const short = SHORT_FLAGS[text.slice(0, 2)];
  return { flag: short ?? null, inline: text.length > 2 ? text.slice(2) : undefined };
}

/** imggen's argv → job, or null wherever argparse (or imggen) would produce no images. */
function parseArgs(args: Token[], background: boolean): ImggenJob | null {
  const positional: Token[] = [];
  const values = new Map<string, Token>();
  for (let i = 0; i < args.length; i++) {
    const tok = args[i]!;
    if (/^\d*[<>]/.test(tok.text)) {
      if (/^\d*[<>]+&?$/.test(tok.text)) i++;
      continue;
    }
    if (tok.text === "--") {
      positional.push(...args.slice(i + 1).filter((a) => !/^\d*[<>]/.test(a.text)));
      break;
    }
    if (!tok.text.startsWith("-") || /^-\d/.test(tok.text)) {
      positional.push(tok);
      continue;
    }
    const { flag, inline } = splitFlag(tok.text);
    if (flag === null || flag === "--help") return null;
    const value = inline !== undefined ? { text: inline, dynamic: tok.dynamic } : args[++i];
    if (!value) return null;
    values.set(flag, value);
  }
  if (positional.length !== 1) return null;

  const label = values.get("--name")?.text ? values.get("--name")! : positional[0]!;
  if (label.dynamic) return null;
  const countTok = values.get("--count");
  const count = countTok ? toInt(countTok) : 1;
  if (count === null || count < 1) return null;
  const seedTok = values.get("--seed");
  const seed = seedTok ? toInt(seedTok) : null;
  if (seedTok && seed === null) return null;

  const shown = Math.min(count, MAX_IMAGES_PER_JOB);
  return {
    slug: imggenSlug(label.text),
    count: shown,
    seeds: seed === null || seed + shown - 1 > MAX_SEED ? null : Array.from({ length: shown }, (_, k) => seed + k),
    background,
    offset: 0,
  };
}

/** Only a word that starts a command runs imggen; `grep imggen` or prose does not. */
function atCommandPosition(tokens: Token[], i: number): boolean {
  let j = i - 1;
  while (j >= 0 && (PREFIXES.has(tokens[j]!.text) || /^[A-Za-z_]\w*=/.test(tokens[j]!.text))) j--;
  return j < 0 || CONTROL.has(tokens[j]!.text);
}

/** Every imggen job in a shell command line, in order. */
export function parseImggenCommand(command: string, runInBackground = false): ImggenJob[] {
  const tokens = tokenize(command);
  const jobs: ImggenJob[] = [];
  for (let i = 0; i < tokens.length && jobs.length < MAX_JOBS_PER_COMMAND; i++) {
    if (!/(^|\/)imggen$/.test(tokens[i]!.text) || tokens[i]!.dynamic || !atCommandPosition(tokens, i)) continue;
    let end = i + 1;
    while (end < tokens.length && !CONTROL.has(tokens[end]!.text)) end++;
    const job = parseArgs(tokens.slice(i + 1, end), runInBackground || tokens[end]?.text === "&");
    if (job?.seeds === null) {
      job.offset = jobs.filter((j) => j.seeds === null && j.slug === job.slug).reduce((n, j) => n + j.count, 0);
    }
    if (job) jobs.push(job);
    i = end;
  }
  return jobs;
}

const parsed = new Map<string, ImggenJob[]>();

/** imggen jobs in a Bash tool call's stored `arg` (the JSON-encoded tool input).
 *  Memoised by arg: the chat re-derives this for every tool call on every render. */
export function imggenJobsFromToolArg(name: string, arg: string | undefined): ImggenJob[] {
  if (name !== "Bash" || !arg?.includes("imggen") || arg.length > MAX_ARG_CHARS) return [];
  const hit = parsed.get(arg);
  if (hit) return hit;
  let jobs: ImggenJob[] = [];
  try {
    const input = parseJson(arg);
    const command = strField(input, "command");
    if (command) jobs = parseImggenCommand(command, asRecord(input)?.run_in_background === true);
  } catch {
    jobs = [];
  }
  if (parsed.size >= 500) parsed.clear();
  parsed.set(arg, jobs);
  return jobs;
}
