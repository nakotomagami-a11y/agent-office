// Shared lightweight markdown primitives. No React — pure string/AST helpers.

export type TableAlign = "left" | "center" | "right" | null;

export type ProseItem =
  | string
  | { type: "code"; lang: string; body: string }
  | { type: "table"; header: string[]; align: TableAlign[]; rows: string[][] };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** GFM separator row, e.g. `| --- | :--: | --: |` (outer pipes optional). */
function isTableSeparatorRow(line: string): boolean {
  const t = line.trim();
  if (!t.includes("-") || !t.includes("|")) return false;
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(t);
}

function splitTableRow(line: string): string[] {
  let t = line.trim();
  if (t.startsWith("|")) t = t.slice(1);
  if (t.endsWith("|")) t = t.slice(0, -1);
  return t.split("|").map((cell) => cell.trim());
}

function alignFromSeparatorCell(cell: string): TableAlign {
  const t = cell.trim();
  if (t.startsWith(":") && t.endsWith(":")) return "center";
  if (t.endsWith(":")) return "right";
  if (t.startsWith(":")) return "left";
  return null;
}

/** Collect data rows starting at `lines[start]` until a non-row line. */
function collectTableRows(lines: ProseItem[], start: number): { rows: string[][]; end: number } {
  const rows: string[][] = [];
  let j = start;
  for (; j < lines.length; j++) {
    const row = lines[j];
    if (typeof row !== "string" || row.trim() === "" || !row.includes("|")) break;
    rows.push(splitTableRow(row));
  }
  return { rows, end: j };
}

/** Merge a run of `header / separator / data…` lines into one table item. */
function mergeTables(lines: ProseItem[]): ProseItem[] {
  const out: ProseItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const item = lines[i]!;
    const next = lines[i + 1];
    const isTableStart =
      typeof item === "string" && item.includes("|") &&
      typeof next === "string" && isTableSeparatorRow(next);
    if (!isTableStart) {
      out.push(item);
      continue;
    }
    const header = splitTableRow(item as string);
    const align = splitTableRow(next as string).map(alignFromSeparatorCell);
    const { rows, end } = collectTableRows(lines, i + 2);
    out.push({ type: "table", header, align, rows });
    i = end - 1;
  }
  return out;
}

/** Split text into prose lines, ```fenced``` code blocks, and GFM tables. */
export function splitProse(text: string): ProseItem[] {
  const lines: ProseItem[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      for (const line of text.slice(last, m.index).split("\n")) lines.push(line);
    }
    lines.push({ type: "code", lang: m[1] || "text", body: (m[2] ?? "").replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    for (const line of text.slice(last).split("\n")) lines.push(line);
  }
  return mergeTables(lines);
}
