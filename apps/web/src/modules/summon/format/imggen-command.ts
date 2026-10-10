// Reads the imggen invocations out of a Bash tool call so the chat can show one
// placeholder per image before any file exists. Mirrors imggen's argparse
// (~/.local/bin/imggen): a command it would reject, or one whose name/seed is only
// known at run time ($VAR, `cmd`, a prompt from a file or stdin with no --name),
// yields no job rather than placeholders that can never fill.
// Not recognised as a run (false negatives only): `bash -c`, `xargs`, `timeout`,
// and imggen inside if/for/while bodies or ( ) { } groups.

import { MAX_IMAGES_PER_JOB, MAX_JOBS_PER_COMMAND, MAX_SEED, imggenSlug } from "@agent-office/domain/config/generated-images";
import { asRecord, parseJson, strField } from "@agent-office/api-contract";

export interface ImggenJob {
  slug: string;
  count: number;
  /** null when imggen picks a random seed, so files can only be matched by time. */
  seeds: number[] | null;
  /** Detached from the tool call (`&` or run_in_background): may outlive the turn. */
  background: boolean;
  /** Images earlier same-slug jobs in this command write first: they share one
   *  start time, so a seedless job's files are found by write order after theirs. */
  offset: number;
}

interface Token {
  text: string;
  /** Contains an expansion (`$…`, backticks) whose value only the shell knows. */
  dynamic: boolean;
  /** First character came from a quote, so a leading `<`/`>` is text, not a redirect. */
  startsQuoted: boolean;
}

const LONG_FLAGS = ["--prompt-file", "--negative", "--name", "--width", "--height", "--steps", "--cfg", "--sampler", "--scheduler", "--seed", "--count", "--profile", "--profiles", "--help"];
const SHORT_FLAGS: Record<string, string> = { "-W": "--width", "-H": "--height", "-c": "--count", "-p": "--profile", "-h": "--help" };
const NO_RUN_FLAGS = new Set(["--help", "--profiles"]);
const CONTROL = new Set([";", "&&", "||", "|", "&"]);
const PREFIXES = new Set(["nohup", "time", "exec", "env"]);
const MAX_ARG_CHARS = 16_000;
const REDIRECT = /^(\d*|&)[<>]/;
const BARE_REDIRECT = /^(\d*|&)[<>]+&?$/;

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

/** Body of a double-quoted word starting after index `i`; returns the closing quote's
 *  index, or `cmd.length` when it is unterminated. */
function readDoubleQuoted(cmd: string, i: number, add: (s: string, dynamic?: boolean, quoted?: boolean) => void): number {
  let j = i + 1;
  for (; j < cmd.length && cmd[j] !== '"'; j++) {
    if (cmd[j] === "\\" && cmd[j + 1] === "\n") j++;
    else if (cmd[j] === "\\" && '"\\$`'.includes(cmd[j + 1] ?? "")) add(cmd[++j]!, false, true);
    else add(cmd[j]!, cmd[j] === "$" || cmd[j] === "`", true);
  }
  add("", false, true);
  return j;
}

/** The control operator at `i` (`;` for a newline), or null for plain whitespace. */
function operatorAt(cmd: string, i: number): string | null {
  const c = cmd[i]!;
  if (c === "\n") return ";";
  return ["&&", "||"].find((o) => cmd.startsWith(o, i)) ?? (";&|".includes(c) ? c : null);
}

/** Shell-ish split. Control operators and newlines become their own tokens; quotes,
 *  escapes, line continuations, comments and heredoc bodies are honoured. Null for an
 *  unterminated quote: bash would refuse the whole command. */
function tokenize(cmd: string): Token[] | null {
  const out: Token[] = [];
  const heredocs: Array<{ delim: string; stripTabs: boolean }> = [];
  let cur: Token | null = null;
  const add = (s: string, dynamic = false, quoted = false) => {
    cur = cur ?? { text: "", dynamic: false, startsQuoted: quoted };
    cur.text += s;
    cur.dynamic ||= dynamic;
  };
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]!;
    const heredoc = c === "<" && cmd[i + 1] === "<" && cmd[i + 2] !== "<" ? /^<<(-?)\s*\\?(['"]?)([A-Za-z_]\w*)\2/.exec(cmd.slice(i)) : null;
    if (heredoc) {
      flush();
      heredocs.push({ delim: heredoc[3]!, stripTabs: heredoc[1] === "-" });
      i += heredoc[0].length - 1;
    } else if (c === "'") {
      const end = cmd.indexOf("'", i + 1);
      if (end === -1) return null;
      add(cmd.slice(i + 1, end), false, true);
      i = end;
    } else if (c === '"') {
      i = readDoubleQuoted(cmd, i, add);
      if (i >= cmd.length) return null;
    } else if (c === "\\") {
      if (cmd[i + 1] !== "\n" && i + 1 < cmd.length) add(cmd[i + 1]!);
      i++;
    } else if (c === "#" && cur === null) {
      const nl = cmd.indexOf("\n", i);
      i = (nl === -1 ? cmd.length : nl) - 1;
    } else if (c === "&" && ((cur !== null && /[<>]$/.test((cur as Token).text)) || cmd[i + 1] === ">")) {
      add(c);
    } else if (/\s/.test(c) || ";&|".includes(c)) {
      flush();
      const op = operatorAt(cmd, i);
      if (op) out.push({ text: op, dynamic: false, startsQuoted: false });
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
    if (!tok.startsQuoted && REDIRECT.test(tok.text)) {
      if (BARE_REDIRECT.test(tok.text)) i++;
      continue;
    }
    if (tok.text === "--") {
      positional.push(...args.slice(i + 1).filter((a) => a.startsQuoted || !REDIRECT.test(a.text)));
      break;
    }
    if (!tok.text.startsWith("-") || tok.text === "-" || /^-\d/.test(tok.text)) {
      positional.push(tok);
      continue;
    }
    const { flag, inline } = splitFlag(tok.text);
    if (flag === null || NO_RUN_FLAGS.has(flag)) return null;
    const value = inline !== undefined ? { ...tok, text: inline } : args[++i];
    if (!value) return null;
    values.set(flag, value);
  }
  if (positional.length > 1 || (positional.length === 1) === values.has("--prompt-file")) return null;

  // A prompt from a file or stdin (`-`) is only known at run time.
  const prompt = positional[0]?.text === "-" ? undefined : positional[0];
  const label = values.get("--name")?.text ? values.get("--name")! : prompt;
  if (!label || label.dynamic) return null;
  const countTok = values.get("--count");
  const count = countTok ? toInt(countTok) : 1;
  if (count === null || count < 1 || count > MAX_IMAGES_PER_JOB) return null;
  const seedTok = values.get("--seed");
  const seed = seedTok ? toInt(seedTok) : null;
  if (seedTok && (seed === null || seed > MAX_SEED + 1 - count)) return null;

  return {
    slug: imggenSlug(label.text),
    count,
    seeds: seed === null ? null : Array.from({ length: count }, (_, k) => seed + k),
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
  if (!tokens) return [];
  const jobs: ImggenJob[] = [];
  for (let i = 0; i < tokens.length && jobs.length < MAX_JOBS_PER_COMMAND; i++) {
    if (!/(^|\/)imggen$/.test(tokens[i]!.text) || tokens[i]!.dynamic || !atCommandPosition(tokens, i)) continue;
    let end = i + 1;
    while (end < tokens.length && !CONTROL.has(tokens[end]!.text)) end++;
    const job = parseArgs(tokens.slice(i + 1, end), runInBackground || tokens[end]?.text === "&");
    if (job) {
      job.offset = jobs.filter((j) => j.slug === job.slug).reduce((n, j) => n + j.count, 0);
      jobs.push(job);
    }
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
