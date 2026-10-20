// Agent-file frontmatter: reading it the way YAML means it, and saving into it without
// losing what the editor doesn't own (S1-5).
import { parseYaml, stringifyYaml, isYamlMapping, type YamlMapping, type YamlValue } from "../infra/yaml";

/** BOM and trailing spaces on a fence are tolerated: rejecting them read the header as body,
 *  and the next save wrote a header without the user's keys. */
const FRONTMATTER_BLOCK = /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)??---[ \t]*(?:\r?\n|$)/;

export function hasAgentFrontmatter(content: string): boolean {
  return FRONTMATTER_BLOCK.test(content);
}

export function splitAgentFile(content: string): { yaml: string; body: string } | null {
  const m = FRONTMATTER_BLOCK.exec(content);
  return m ? { yaml: (m[1] ?? "").replace(/\r\n/g, "\n"), body: content.slice(m[0].length) } : null;
}

export function opensFrontmatter(content: string): boolean {
  return /^\uFEFF?---/.test(content);
}

/** Index just past a quoted scalar opening at `start`, honouring `\"` and `''` escapes. */
function quoteEnd(line: string, start: number): number {
  const q = line[start];
  for (let i = start + 1; i < line.length; i++) {
    if (q === '"' && line[i] === "\\") i++;
    else if (line[i] === q && q === "'" && line[i + 1] === "'") i++;
    else if (line[i] === q) return i + 1;
  }
  return line.length;
}

/** YAML's ` # comment` tail, which the shared parser keeps as part of the value
 *  (`model: opus # cheap` reached `--model` verbatim). Block scalar content is left alone. */
export function stripInlineComments(yaml: string): string {
  let blockIndent = -1;
  return yaml.split("\n").map((line) => {
    const indent = line.length - line.trimStart().length;
    if (blockIndent >= 0 && (indent > blockIndent || !line.trim())) return line;
    blockIndent = -1;
    let out = line;
    for (let i = 0; i < line.length; i++) {
      const c = line[i]!;
      const opensQuote = (c === '"' || c === "'") && (i === 0 || /[\s[,:{]/.test(line[i - 1]!));
      if (opensQuote) {
        i = quoteEnd(line, i) - 1;
      } else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
        out = line.slice(0, i).trimEnd();
        break;
      }
    }
    if (/:[ \t]*[|>][+-]?$/.test(out)) blockIndent = indent;
    return out;
  }).join("\n");
}

export function parseAgentFrontmatter(yaml: string): YamlMapping {
  let parsed: YamlValue;
  try {
    parsed = parseYaml(stripInlineComments(yaml));
  } catch {
    return {};
  }
  if (!isYamlMapping(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k.replace(/^(["'])(.*)\1$/, "$2"), v]));
}

/** Other spellings readAgent accepts for a key, ours alone. Writing the key drops them, or a
 *  stale alias would surface the moment the key itself is removed. */
const KEY_ALIASES: Record<string, string[]> = {
  "display-name": ["displayName"],
  tools: ["allowed-tools"],
  "add-dirs": ["addDirs"],
};

/** Keys the CLI reads itself. A change the user makes is copied onto them; `default`, which the
 *  CLI does not take, removes the CLI's key and is written as ours. Otherwise they are never dropped. */
const CLI_KEYS: Record<string, string> = { "default-model": "model", "default-effort": "effort" };

const KEY_LINE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^\s#"'-][^:]*?)[ \t]*:(?:[ \t]|$)/;

function keyOf(line: string): string | null {
  const k = KEY_LINE.exec(line)?.[1];
  if (k === undefined) return null;
  if (k.startsWith('"')) return k.slice(1, -1).replace(/\\(.)/g, "$1");
  if (k.startsWith("'")) return k.slice(1, -1).replace(/''/g, "'");
  return k.trim();
}

interface FrontmatterEntry { key: string | null; lines: string[] }

const isIndented = (line: string) => /^[ \t]/.test(line) || /^-(\s|$)/.test(line);

/** Top-level frontmatter entries as raw lines. Untouched keys are written back byte for byte:
 *  our YAML helper cannot round-trip every shape (flow maps, comments, folded scalars). */
function frontmatterEntries(yaml: string): FrontmatterEntry[] {
  const lines = yaml.split("\n");
  const out: FrontmatterEntry[] = [];
  lines.forEach((line, i) => {
    const key = keyOf(line);
    // A column-0 comment followed by indented lines sits INSIDE the entry above: split off,
    // the lines after it would be left behind when that entry is rewritten.
    const commentInside = line.startsWith("#") && isIndented(lines.slice(i + 1).find((l) => l.trim() && !l.startsWith("#")) ?? "");
    const glued = key === null && out.length > 0 && (isIndented(line) || !line.trim() || commentInside);
    if (glued) out[out.length - 1]!.lines.push(line);
    else out.push({ key, lines: [line] });
  });
  return out;
}

function sameValue(e: FrontmatterEntry, value: YamlValue | undefined): boolean {
  const m = KEY_LINE.exec(e.lines[0]!);
  const text = [`k: ${e.lines[0]!.slice(m![0].length)}`, ...e.lines.slice(1)].join("\n");
  return JSON.stringify(parseAgentFrontmatter(text).k) === JSON.stringify(value);
}

function mirrorCliKeys(entries: FrontmatterEntry[], owned: Record<string, YamlValue | undefined>): void {
  const byKey = new Map(entries.map((e) => [e.key, e]));
  for (const [ours, cli] of Object.entries(CLI_KEYS)) {
    if (!(ours in owned) || !byKey.has(cli)) continue;
    const value = owned[ours];
    const oursEntry = byKey.get(ours);
    if (oursEntry && sameValue(oursEntry, value)) continue;
    owned[cli] = value === "default" ? undefined : value;
    if (!oursEntry && value !== "default") delete owned[ours];
  }
}

/** `owned` maps a key to its new value; `undefined` removes it. Keys not in `owned` are kept,
 *  and so are the comment lines of an entry that is rewritten or removed. */
export function mergeFrontmatter(existing: string, ownedIn: Record<string, YamlValue | undefined>): string {
  const entries = existing ? frontmatterEntries(existing) : [];
  const owned = { ...ownedIn };
  mirrorCliKeys(entries, owned);
  const drop = new Set(Object.keys(owned).flatMap((k) => KEY_ALIASES[k] ?? []));
  const written = new Set<string>();
  const out: string[] = [];
  for (const e of entries) {
    if (e.key === null || (!(e.key in owned) && !drop.has(e.key))) {
      out.push(...e.lines);
      continue;
    }
    const value = owned[e.key];
    const keep = !drop.has(e.key) && value !== undefined && !written.has(e.key);
    if (keep && sameValue(e, value)) {
      out.push(...e.lines);
    } else {
      out.push(...e.lines.slice(1).filter((l) => l.trim().startsWith("#")).map((l) => l.trimStart()));
      if (keep) out.push(stringifyYaml({ [e.key]: value }));
    }
    if (keep) written.add(e.key);
  }
  for (const [key, value] of Object.entries(owned)) {
    if (value !== undefined && !written.has(key)) out.push(stringifyYaml({ [key]: value }));
  }
  return out.join("\n").trim();
}
