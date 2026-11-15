import { extractImages, stripAttachmentFooter } from "./message-format";

/** Mirrors `buildWakeMessage` in the domain's background-shell-watcher. If that wording changes,
 *  this falls through to the first-line title — degraded, not broken. Parsing prose is lossy (a
 *  command containing " (`" splits wrong); the real fix is the domain sending the description. */
const WAKE = /^\[background task finished\] The backgrounded shell you started — ([\s\S]+?) — is no longer running\./;
const WITH_DESCRIPTION = /^([\s\S]*) \(`[\s\S]*`\)$/;

/** One-line summary for a collapsed queue row. CSS does the truncation. */
export function queuedTitle(text: string): string {
  const wake = WAKE.exec(text);
  if (wake) {
    const label = wake[1]!;
    const described = WITH_DESCRIPTION.exec(label);
    const what = described ? described[1]!.replace(/`/g, "") : label.slice(1, -1);
    return `Background task finished: ${squash(what)}`;
  }
  const first = stripAttachmentFooter(text).split("\n").find((l) => l.trim()) ?? "";
  const title = squash(first.replace(/^\s*(?:#+|>+)\s*/, "").replace(/\*\*|`/g, ""));
  if (title) return title;
  const n = extractImages(text).length;
  return n ? `(${n} image${n > 1 ? "s" : ""})` : "(attachment)";
}

function squash(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
