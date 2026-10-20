// Markdown string helpers shared by the renderers. No React.

/** Text content only: `highlightTS` matches quotes in this output. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Drops a half-typed last line of streaming text so no frame shows stray backticks in prose, a
 *  growing fence language, a code body that shrinks, or a paragraph flashing as a setext heading
 *  while the `-` of a list or rule is still alone on its line. */
export function trimPartialFence(text: string): string {
  return text.replace(/(^|\n)[^\S\n]{0,3}(`+[\w+#.-]*|~+[\w+#.-]*|[-=]+[^\S\n]*)$/, "$1");
}

// A backtick fence's info string can't hold a backtick (CommonMark), else ```a``` would open one.
const FENCE = /^[ ]{0,3}(`{3,}(?=[^`]*$)|~{3,})/;

/** Splits markdown at blank lines outside code fences, so a streaming message re-parses only its
 *  last block: a full re-parse every frame costs ~30 ms at 20 KB. A blank line followed by an
 *  indented line stays joined, since that line may continue a list item. */
export function splitMarkdownBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = FENCE.exec(line)?.[1];
    if (marker && fence === null) fence = marker;
    else if (marker && fence !== null && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null;
    current.push(line);
    const next = lines[i + 1];
    if (fence === null && line.trim() === "" && next !== undefined && next.trim() !== "" && !/^\s/.test(next)) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length > 0) blocks.push(current.join("\n"));
  return blocks;
}

/** A link target, or "" to render the text without a link. Relative hrefs are dropped: `/\host`
 *  normalises to `//host`, and same-origin `/api/...` files (e.g. an uploaded SVG) would open in-app. */
export function safeLinkHref(url: string): string {
  return /^(https?:\/\/|mailto:)/i.test(url.trim()) ? url : "";
}
