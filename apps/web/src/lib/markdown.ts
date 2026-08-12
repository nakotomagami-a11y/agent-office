// Shared lightweight markdown primitives. No React — pure string/AST helpers.

export type ProseItem = string | { type: "code"; lang: string; body: string };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Split text into prose lines and ```fenced``` code blocks. */
export function splitProse(text: string): ProseItem[] {
  const items: ProseItem[] = [];
  const re = /```(\w*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      for (const line of text.slice(last, m.index).split("\n")) items.push(line);
    }
    items.push({ type: "code", lang: m[1] || "text", body: (m[2] ?? "").replace(/\n$/, "") });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    for (const line of text.slice(last).split("\n")) items.push(line);
  }
  return items;
}
