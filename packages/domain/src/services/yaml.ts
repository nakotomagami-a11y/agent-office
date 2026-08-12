// Tiny YAML helper sufficient for our frontmatter:
//   - flat scalar key/value pairs (string | number | boolean)
//   - flow-style string lists (e.g. `tools: [Read, Write]`)
//   - block-style string lists (`- item` lines under a key)
//   - block-style list of objects (used for project rosters: `- instanceId: x`)
//
// Not a general-purpose YAML parser. The legacy server pulled in `yaml`; we
// intentionally avoid new deps because the surface we need is small and fixed.

export type YamlScalar = string | number | boolean | null;
export type YamlMapping = { [k: string]: YamlValue };
export type YamlSequence = YamlValue[];
export type YamlValue = YamlScalar | YamlSequence | YamlMapping;

export function isYamlMapping(v: unknown): v is YamlMapping {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function isYamlSequence(v: unknown): v is YamlSequence {
  return Array.isArray(v);
}

const SCALAR_RE = /^[A-Za-z0-9_./@:+\-]+$/;

function unquote(raw: string): string {
  const t = raw.trim();
  if (t.length >= 2 && (t.startsWith('"') || t.startsWith("'"))) {
    const q = t[0]!;
    if (t.endsWith(q)) {
      return t
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");
    }
  }
  return t;
}

function parseScalar(raw: string): YamlValue {
  const t = raw.trim();
  if (t === "" || t === "~" || t === "null") return null;
  if (t === "true") return true;
  if (t === "false") return false;
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d*\.\d+$/.test(t)) return Number(t);
  return unquote(t);
}

function parseFlowList(raw: string): YamlValue[] {
  // raw includes the surrounding [ ] - strip and split on commas at depth 0.
  const inner = raw.trim().slice(1, -1).trim();
  if (!inner) return [];
  const parts: string[] = [];
  let depth = 0;
  let buf = "";
  let inQuote: '"' | "'" | null = null;
  for (const ch of inner) {
    if (inQuote) {
      buf += ch;
      if (ch === inQuote) inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      buf += ch;
      continue;
    }
    if (ch === "[" || ch === "{") depth++;
    if (ch === "]" || ch === "}") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((p) => parseScalar(p));
}

interface Line { indent: number; raw: string; }

function tokenize(input: string): Line[] {
  const out: Line[] = [];
  for (const rawLine of input.split("\n")) {
    const stripped = rawLine.replace(/\s+$/, "");
    if (!stripped.trim()) continue;
    if (stripped.trim().startsWith("#")) continue;
    const indent = stripped.length - stripped.replace(/^ +/, "").length;
    out.push({ indent, raw: stripped });
  }
  return out;
}

interface ParseState { i: number; lines: Line[]; }

function parseBlock(state: ParseState, baseIndent: number): YamlValue {
  // Decide if this block is a list (lines starting with "- ") or a map.
  const first = state.lines[state.i];
  if (!first) return null;
  const trimmed = first.raw.trimStart();
  if (trimmed.startsWith("- ") || trimmed === "-") {
    return parseList(state, baseIndent);
  }
  return parseMap(state, baseIndent);
}

function parseMap(state: ParseState, baseIndent: number): Record<string, YamlValue> {
  const obj: Record<string, YamlValue> = {};
  while (state.i < state.lines.length) {
    const line = state.lines[state.i]!;
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) break; // shouldn't happen; safety
    const content = line.raw.slice(line.indent);
    const colonIdx = content.indexOf(":");
    if (colonIdx === -1) {
      state.i++;
      continue;
    }
    const key = content.slice(0, colonIdx).trim();
    const after = content.slice(colonIdx + 1).trim();
    state.i++;

    if (after === "") {
      // Value is on subsequent indented lines.
      const next = state.lines[state.i];
      if (!next) {
        obj[key] = null;
      } else if (next.indent > baseIndent) {
        obj[key] = parseBlock(state, next.indent);
      } else if (
        next.indent === baseIndent &&
        next.raw.slice(next.indent).startsWith("-")
      ) {
        // YAML allows a block sequence at the same indent as its parent key
        // (this is what `stringifyValue` emits for arrays of objects).
        obj[key] = parseList(state, baseIndent);
      } else {
        obj[key] = null;
      }
    } else if (after.startsWith("[")) {
      obj[key] = parseFlowList(after);
    } else if (after.startsWith("{")) {
      // We don't use flow maps in our payloads; treat as raw string.
      obj[key] = parseScalar(after);
    } else if (/^[|>][+-]?$/.test(after)) {
      // Block scalar: `|` literal (keep newlines) or `>` folded (join with
      // spaces). Common in SKILL.md frontmatter descriptions.
      obj[key] = parseBlockScalar(state, baseIndent, after[0] as "|" | ">");
    } else {
      obj[key] = parseScalar(after);
    }
  }
  return obj;
}

function parseBlockScalar(state: ParseState, parentIndent: number, style: "|" | ">"): string {
  const parts: string[] = [];
  let blockIndent = -1;
  while (state.i < state.lines.length) {
    const line = state.lines[state.i]!;
    if (line.indent <= parentIndent) break;
    if (blockIndent === -1) blockIndent = line.indent;
    parts.push(line.raw.slice(blockIndent));
    state.i++;
  }
  // Blank lines are dropped by tokenize, so folded paragraph breaks collapse to
  // single spaces — fine for the short descriptions this parser handles.
  return style === "|" ? parts.join("\n") : parts.join(" ");
}

function parseList(state: ParseState, baseIndent: number): YamlValue[] {
  const out: YamlValue[] = [];
  while (state.i < state.lines.length) {
    const line = state.lines[state.i]!;
    if (line.indent < baseIndent) break;
    if (line.indent > baseIndent) break;
    const content = line.raw.slice(line.indent);
    if (!content.startsWith("-")) break;
    const after = content.slice(1).replace(/^ /, "");
    state.i++;

    if (after === "") {
      const next = state.lines[state.i];
      if (!next || next.indent <= baseIndent) {
        out.push(null);
      } else {
        out.push(parseBlock(state, next.indent));
      }
      continue;
    }

    // Inline value after dash. If it contains ": ", treat as a single-line map item
    // possibly with more keys at deeper indentation.
    const colonIdx = after.indexOf(": ");
    if (colonIdx !== -1 || after.endsWith(":")) {
      const inlineKey = (colonIdx === -1 ? after.slice(0, -1) : after.slice(0, colonIdx)).trim();
      const inlineAfter = colonIdx === -1 ? "" : after.slice(colonIdx + 2).trim();
      const item: Record<string, YamlValue> = {};
      const itemIndent = baseIndent + 2;
      if (inlineAfter === "") {
        // Possibly nested
        const next = state.lines[state.i];
        if (next && next.indent > baseIndent) {
          item[inlineKey] = parseBlock(state, next.indent);
        } else {
          item[inlineKey] = null;
        }
      } else if (inlineAfter.startsWith("[")) {
        item[inlineKey] = parseFlowList(inlineAfter);
      } else {
        item[inlineKey] = parseScalar(inlineAfter);
      }
      // Continue consuming further keys at itemIndent for this item
      while (state.i < state.lines.length) {
        const cont = state.lines[state.i]!;
        if (cont.indent !== itemIndent) break;
        const contContent = cont.raw.slice(cont.indent);
        if (contContent.startsWith("-")) break;
        const ci = contContent.indexOf(":");
        if (ci === -1) break;
        const k = contContent.slice(0, ci).trim();
        const a = contContent.slice(ci + 1).trim();
        state.i++;
        if (a === "") {
          const next = state.lines[state.i];
          if (next && next.indent > itemIndent) {
            item[k] = parseBlock(state, next.indent);
          } else {
            item[k] = null;
          }
        } else if (a.startsWith("[")) {
          item[k] = parseFlowList(a);
        } else {
          item[k] = parseScalar(a);
        }
      }
      out.push(item);
    } else {
      out.push(parseScalar(after));
    }
  }
  return out;
}

export function parseYaml(input: string): YamlValue {
  const lines = tokenize(input);
  if (lines.length === 0) return {};
  const baseIndent = lines[0]!.indent;
  const state: ParseState = { i: 0, lines };
  return parseBlock(state, baseIndent);
}

// ─── Stringify ────────────────────────────────────────────────────────────

function quoteScalar(s: string): string {
  if (s === "") return '""';
  if (SCALAR_RE.test(s) && !["true", "false", "null", "~"].includes(s)) return s;
  // double-quote with minimal escaping
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function stringifyValue(v: YamlValue, indent: number): string {
  const pad = " ".repeat(indent);
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return quoteScalar(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    // Use flow style for arrays of scalars, block style for arrays of objects.
    const allScalar = v.every(
      (x) => x === null || ["string", "number", "boolean"].includes(typeof x),
    );
    if (allScalar) {
      return `[${v.map((x) => stringifyValue(x, 0)).join(", ")}]`;
    }
    return v
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          const entries = Object.entries(item);
          if (entries.length === 0) return `${pad}- {}`;
          const [firstKey, firstVal] = entries[0]!;
          const head = `${pad}- ${firstKey}: ${stringifyValue(firstVal, indent + 2)}`;
          const rest = entries
            .slice(1)
            .map(([k, val]) => `${pad}  ${k}: ${stringifyValue(val, indent + 2)}`);
          return [head, ...rest].join("\n");
        }
        return `${pad}- ${stringifyValue(item, indent + 2)}`;
      })
      .join("\n");
  }
  // object - caller should handle nested context. For top-level use stringifyYaml.
  const lines: string[] = [];
  for (const [k, val] of Object.entries(v)) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      lines.push(`${pad}${k}:`);
      lines.push(stringifyValue(val, indent + 2));
    } else if (Array.isArray(val) && val.length > 0 && typeof val[0] === "object") {
      lines.push(`${pad}${k}:`);
      lines.push(stringifyValue(val, indent));
    } else {
      lines.push(`${pad}${k}: ${stringifyValue(val, indent + 2)}`);
    }
  }
  return lines.join("\n");
}

export function stringifyYaml(obj: Record<string, YamlValue>): string {
  return stringifyValue(obj, 0);
}
