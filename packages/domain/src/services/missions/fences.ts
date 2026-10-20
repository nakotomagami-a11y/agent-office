// CommonMark fenced code blocks, as GitHub renders them: shared by the outbox (what an agent meant
// to post) and the poster (closing a block the agent left open, or the envelope shows as code).

/** Up to 3 spaces, 3+ backticks or tildes, then the info string (no backtick in a backtick one). */
const OPENER = /^ {0,3}(`{3,}|~{3,})[ \t]*([^`\r\n]*)$/;

export interface FenceOpen {
  fence: string;
  /** First word of the info string: `ao-post`, `bash`, or "". */
  lang: string;
}

export function openFence(line: string): FenceOpen | null {
  const m = OPENER.exec(line);
  if (!m) return null;
  const fence = m[1] ?? "";
  const info = (m[2] ?? "").trim();
  if (fence.startsWith("`") && info.includes("`")) return null;
  return { fence, lang: info.split(/\s+/)[0] ?? "" };
}

/** Only a run of the same character, at least as long, with nothing after it closes. */
export function closesFence(line: string, fence: string): boolean {
  const run = /^ {0,3}(`+|~+)[ \t]*$/.exec(line)?.[1] ?? "";
  return run[0] === fence[0] && run.length >= fence.length;
}

/** The fence still open at the end of `text`, or null when every block is closed. */
export function unclosedFence(text: string): string | null {
  let open: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (open !== null) {
      if (closesFence(line, open)) open = null;
    } else {
      open = openFence(line)?.fence ?? null;
    }
  }
  return open;
}
