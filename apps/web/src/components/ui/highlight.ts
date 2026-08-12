/**
 * Dependency-free syntax highlighter. `highlight(src, lang)` returns an HTML
 * string of `<span class="hl-*">` tokens, designed to be injected via
 * `dangerouslySetInnerHTML` (see `code-block.tsx`). The `.hl-*` classes are
 * styled in CSS: hl-k keyword, hl-s string, hl-c comment, hl-fn function/key,
 * hl-n number, hl-i literal.
 *
 * SECURITY: the output is trusted markup only because every piece of source
 * text passes through `esc()` first — via `span()` for tokens and via the
 * `esc(ch)` fallbacks in `tokenize`/`highlightMarkdown`. The only literal HTML
 * is static (`<span>`, `<strong>`, `<em>`, markdown link punctuation), never
 * user-derived. Any new code path that emits source text MUST route it through
 * `esc`/`span`, or it becomes an XSS hole.
 */
import { match } from "ts-pattern";

// HTML-escape the three markup-significant chars. The escape boundary for the
// whole module — all dynamic text must pass through here.
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Wrap a source slice in a highlight token. Escapes `s` before interpolation,
// so callers may pass raw source safely.
function span(cls: string, s: string): string {
  return `<span class="${cls}">${esc(s)}</span>`;
}

type Rule = [RegExp, string];

function tokenize(src: string, rules: Rule[]): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    let matched = false;
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m !== null && m.index === i && m[0] !== undefined && m[0].length > 0) {
        out += cls ? span(cls, m[0]) : esc(m[0]);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const ch = src[i];
      if (ch !== undefined) out += esc(ch);
      i++;
    }
  }
  return out;
}

// ── bash ──────────────────────────────────────────────────────────────────

const BASH_KW = /\b(if|then|else|elif|fi|for|do|done|while|until|case|esac|in|function|return|export|source|local|echo|printf|cd|mkdir|rm|rmdir|cp|mv|ls|cat|grep|sed|awk|find|xargs|git|npm|npx|pnpm|bun|curl|wget|sqlite3|python|python3|node|which|env|set|unset|declare|readonly|shift|break|continue|exit|true|false)\b/y;

const BASH_RULES: Rule[] = [
  [/#[^\n]*/y, "hl-c"],
  [/"(?:[^"\\]|\\.)*"/y, "hl-s"],
  [/'[^']*'/y, "hl-s"],
  [/`[^`]*`/y, "hl-s"],
  [/\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*/y, "hl-fn"],
  [BASH_KW, "hl-k"],
  [/--?[A-Za-z][A-Za-z0-9_-]*/y, "hl-i"],
  [/\b\d+(\.\d+)?\b/y, "hl-n"],
];

// ── yaml ──────────────────────────────────────────────────────────────────

const YAML_RULES: Rule[] = [
  [/^---$|^\.\.\.$|^---(?=\s)/ym, "hl-k"],
  [/#[^\n]*/y, "hl-c"],
  [/"(?:[^"\\]|\\.)*"/y, "hl-s"],
  [/'[^']*'/y, "hl-s"],
  [/[A-Za-z_][A-Za-z0-9_-]*(?=\s*:)/y, "hl-fn"],
  [/\b(true|false|yes|no|on|off)\b/y, "hl-k"],
  [/\b(null|~)\b/y, "hl-k"],
  [/\b-?\d+(\.\d+)?\b/y, "hl-n"],
];

// ── json ──────────────────────────────────────────────────────────────────

const JSON_RULES: Rule[] = [
  [/"(?:[^"\\]|\\.)*"(?=\s*:)/y, "hl-fn"],
  [/"(?:[^"\\]|\\.)*"/y, "hl-s"],
  [/\b(true|false|null)\b/y, "hl-i"],
  [/-?\d+(\.\d+)?([eE][+-]?\d+)?/y, "hl-n"],
];

// ── sql ───────────────────────────────────────────────────────────────────

const SQL_KW =
  /\b(SELECT|FROM|WHERE|GROUP\s+BY|ORDER\s+BY|HAVING|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|OUTER\s+JOIN|CROSS\s+JOIN|ON|AS|WITH|LIMIT|OFFSET|INSERT|INTO|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|VIEW|TRIGGER|LIKE|AND|OR|NOT|IN|EXISTS|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CAST|COALESCE|NULLIF|CASE|WHEN|THEN|ELSE|END|USING|UNION|ALL|REFERENCES|DEFAULT|NULL|PRIMARY\s+KEY|FOREIGN\s+KEY|CONSTRAINT|PRAGMA|VIRTUAL|AUTOINCREMENT|INTEGER|TEXT|REAL|BLOB|CHECK|UNIQUE)\b/iy;

const SQL_RULES: Rule[] = [
  [/--[^\n]*/y, "hl-c"],
  [/\/\*[\s\S]*?\*\//y, "hl-c"],
  [/'(?:[^'\\]|\\.)*'/y, "hl-s"],
  [/"(?:[^"\\]|\\.)*"/y, "hl-s"],
  [SQL_KW, "hl-k"],
  [/\b\d+(\.\d+)?\b/y, "hl-n"],
  [/\b[A-Za-z_][A-Za-z0-9_]*\b/y, "hl-fn"],
];

// ── markdown ──────────────────────────────────────────────────────────────

/** Attempts inline-code (`...`) at position i. Returns [html, endIdx] or null. */
function tryInlineCode(line: string, i: number): [string, number] | null {
  if (line[i] !== "`") return null;
  const end = line.indexOf("`", i + 1);
  if (end === -1) return null;
  return [span("hl-s", line.slice(i, end + 1)), end + 1];
}

/** Attempts bold (**...**) at position i. Returns [html, endIdx] or null. */
function tryBold(line: string, i: number): [string, number] | null {
  if (line.slice(i, i + 2) !== "**") return null;
  const end = line.indexOf("**", i + 2);
  if (end === -1) return null;
  return [`<strong>${esc(line.slice(i + 2, end))}</strong>`, end + 2];
}

/** Attempts italic (*...*) at position i. Returns [html, endIdx] or null. */
function tryItalic(line: string, i: number): [string, number] | null {
  if (line[i] !== "*" || line[i + 1] === "*") return null;
  const end = line.indexOf("*", i + 1);
  if (end === -1) return null;
  return [`<em>${esc(line.slice(i + 1, end))}</em>`, end + 1];
}

/** Attempts markdown link ([text](url)) at position i. Returns [html, endIdx] or null. */
function tryLink(line: string, i: number): [string, number] | null {
  if (line[i] !== "[") return null;
  const close = line.indexOf("]", i + 1);
  if (close === -1 || line[close + 1] !== "(") return null;
  const urlEnd = line.indexOf(")", close + 2);
  if (urlEnd === -1) return null;
  const text = line.slice(i + 1, close);
  const url = line.slice(close + 2, urlEnd);
  return [`[${span("hl-fn", text)}](${span("hl-s", url)})`, urlEnd + 1];
}

function highlightInlineMarkdown(line: string): string {
  let out = "";
  let i = 0;
  while (i < line.length) {
    const hit = tryInlineCode(line, i) ?? tryBold(line, i) ?? tryItalic(line, i) ?? tryLink(line, i);
    if (hit) {
      out += hit[0];
      i = hit[1];
      continue;
    }
    out += esc(line[i] ?? "");
    i++;
  }
  return out;
}

function highlightFrontmatterLine(line: string): string {
  const keyMatch = /^([A-Za-z_][A-Za-z0-9_-]*)(\s*:.*)$/.exec(line);
  if (!keyMatch) return esc(line);
  const key = keyMatch[1] ?? "";
  const rest = keyMatch[2] ?? "";
  return span("hl-fn", key) + esc(rest);
}

type MdState = { inFrontmatter: boolean; frontmatterDone: boolean; inFence: boolean };

function highlightMarkdownLine(line: string, idx: number, state: MdState): string {
  // frontmatter start
  if (idx === 0 && line === "---") {
    state.inFrontmatter = true;
    return span("hl-k", line);
  }
  if (state.inFrontmatter && !state.frontmatterDone) {
    if (line === "---") {
      state.inFrontmatter = false;
      state.frontmatterDone = true;
      return span("hl-k", line);
    }
    return highlightFrontmatterLine(line);
  }
  // fenced code block delimiter
  if (/^```/.test(line)) {
    state.inFence = !state.inFence;
    return span("hl-c", line);
  }
  if (state.inFence) return esc(line);
  // headings
  if (/^#{1,6}\s/.test(line)) return span("hl-k", line);
  // normal line — inline transforms
  return highlightInlineMarkdown(line);
}

function highlightMarkdown(src: string): string {
  const lines = src.split("\n");
  const state: MdState = { inFrontmatter: false, frontmatterDone: false, inFence: false };
  const out: string[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    out.push(highlightMarkdownLine(lines[idx] ?? "", idx, state));
  }
  return out.join("\n");
}

// ── public API ────────────────────────────────────────────────────────────

/**
 * Highlight `src` for `lang`, returning escaped HTML. Unknown languages fall
 * back to `esc(src)` (plain, escaped text). Result is safe for
 * `dangerouslySetInnerHTML`.
 */
export function highlight(src: string, lang: string): string {
  return match(lang)
    .with("bash", "sh", () => tokenize(src, BASH_RULES))
    .with("yaml", "yml", () => tokenize(src, YAML_RULES))
    .with("json", () => tokenize(src, JSON_RULES))
    .with("sql", () => tokenize(src, SQL_RULES))
    .with("markdown", "md", () => highlightMarkdown(src))
    .otherwise(() => esc(src));
}
