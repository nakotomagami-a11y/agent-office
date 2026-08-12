function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

function highlightMarkdown(src: string): string {
  const lines = src.split("\n");
  let inFrontmatter = false;
  let frontmatterDone = false;
  let inFence = false;
  const out: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx] ?? "";

    // frontmatter start
    if (idx === 0 && line === "---") {
      inFrontmatter = true;
      out.push(span("hl-k", line));
      continue;
    }
    if (inFrontmatter && !frontmatterDone) {
      if (line === "---") {
        inFrontmatter = false;
        frontmatterDone = true;
        out.push(span("hl-k", line));
        continue;
      }
      const keyMatch = /^([A-Za-z_][A-Za-z0-9_-]*)(\s*:.*)$/.exec(line);
      if (keyMatch !== null) {
        const key = keyMatch[1] ?? "";
        const rest = keyMatch[2] ?? "";
        out.push(span("hl-fn", key) + esc(rest));
      } else {
        out.push(esc(line));
      }
      continue;
    }

    // fenced code block delimiter
    if (/^```/.test(line)) {
      inFence = !inFence;
      out.push(span("hl-c", line));
      continue;
    }
    if (inFence) {
      out.push(esc(line));
      continue;
    }

    // headings
    if (/^#{1,6}\s/.test(line)) {
      out.push(span("hl-k", line));
      continue;
    }

    // normal line — inline transforms
    let l = "";
    let i = 0;
    while (i < line.length) {
      const ch = line[i] ?? "";
      const ch2 = line.slice(i, i + 2);

      // inline code
      if (ch === "`") {
        const end = line.indexOf("`", i + 1);
        if (end !== -1) {
          l += span("hl-s", line.slice(i, end + 1));
          i = end + 1;
          continue;
        }
      }
      // bold **...**
      if (ch2 === "**") {
        const end = line.indexOf("**", i + 2);
        if (end !== -1) {
          l += `<strong>${esc(line.slice(i + 2, end))}</strong>`;
          i = end + 2;
          continue;
        }
      }
      // italic *...*
      const nextCh = line[i + 1];
      if (ch === "*" && nextCh !== "*") {
        const end = line.indexOf("*", i + 1);
        if (end !== -1) {
          l += `<em>${esc(line.slice(i + 1, end))}</em>`;
          i = end + 1;
          continue;
        }
      }
      // [text](url)
      if (ch === "[") {
        const close = line.indexOf("]", i + 1);
        if (close !== -1 && line[close + 1] === "(") {
          const urlEnd = line.indexOf(")", close + 2);
          if (urlEnd !== -1) {
            const text = line.slice(i + 1, close);
            const url = line.slice(close + 2, urlEnd);
            l += `[${span("hl-fn", text)}](${span("hl-s", url)})`;
            i = urlEnd + 1;
            continue;
          }
        }
      }
      l += esc(ch);
      i++;
    }
    out.push(l);
  }

  return out.join("\n");
}

// ── public API ────────────────────────────────────────────────────────────

export function highlight(src: string, lang: string): string {
  switch (lang) {
    case "bash":
    case "sh":
      return tokenize(src, BASH_RULES);
    case "yaml":
    case "yml":
      return tokenize(src, YAML_RULES);
    case "json":
      return tokenize(src, JSON_RULES);
    case "sql":
      return tokenize(src, SQL_RULES);
    case "markdown":
    case "md":
      return highlightMarkdown(src);
    default:
      return esc(src);
  }
}
