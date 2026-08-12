// Pure helpers for rendering chat messages: duration, image extraction,
// attachment cleanup, and lightweight syntax/inline-markdown highlighting.

import { escapeHtml } from "@/lib/markdown";

export function fmtDuration(ms: number): string {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i;

/** Convert a local upload path to a servable API URL, or return http(s) URLs as-is. */
export function pathToUrl(raw: string): string | null {
  // Agent uploads: ~/.claude/agents/_uploads/{agentId}/{filename}
  const agentM = raw.match(/\.claude\/agents\/_uploads\/([^/\s]+)\/([^/\s]+)$/);
  if (agentM && IMG_EXT.test(agentM[2]!)) {
    return `/api/agents/${encodeURIComponent(agentM[1]!)}/uploads/${encodeURIComponent(agentM[2]!)}`;
  }
  // Project uploads: ~/.claude/projects/{projectId}/_uploads/{filename}
  const projM = raw.match(/\.claude\/projects\/([^/\s]+)\/_uploads\/([^/\s]+)$/);
  if (projM && IMG_EXT.test(projM[2]!)) {
    return `/api/projects/${encodeURIComponent(projM[1]!)}/uploads/${encodeURIComponent(projM[2]!)}`;
  }
  // Plain HTTP/HTTPS image URL
  if (/^https?:\/\/.+/i.test(raw) && IMG_EXT.test(raw.split("?")[0]!)) {
    return raw;
  }
  return null;
}

/** Extract image references from message text, returning their API URLs. */
export function extractImages(text: string): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  // Absolute paths ending in image extension
  const pathRe = /(\/[^\s,'"<>()[\]]+)/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(text)) !== null) {
    const raw = m[1]!;
    if (!IMG_EXT.test(raw)) continue;
    const url = pathToUrl(raw);
    if (url && !seen.has(url)) { seen.add(url); urls.push(url); }
  }
  // HTTP/HTTPS URLs
  const urlRe = /https?:\/\/[^\s,'"<>()[\]]+/g;
  while ((m = urlRe.exec(text)) !== null) {
    const raw = m[0]!;
    if (!IMG_EXT.test(raw.split("?")[0]!)) continue;
    if (!seen.has(raw)) { seen.add(raw); urls.push(raw); }
  }
  return urls;
}

/** Strip the attachment footer that Claude Code appends ("Attachments (read these...)\n- /path"). */
export function stripAttachmentFooter(text: string): string {
  return text.replace(/\n\nAttachments \(read these with your tools\):[^\n]*(?:\n- [^\n]+)*/g, "").trimEnd();
}

export function highlightTS(src: string): string {
  let out = escapeHtml(src);
  out = out.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g, "\x01C\x01$1\x02");
  out = out.replace(/(['"`])((?:\\.|(?!\1).)*)\1/g, "\x01S\x01$&\x02");
  out = out.replace(
    /\b(?:import|from|export|async|await|function|return|const|let|var|if|else|new|class|interface|type|extends|implements|public|private|protected|throw|try|catch|null|true|false|void)\b/g,
    "\x01K\x01$&\x02",
  );
  out = out.replace(/\b(?:Request|Response|Date|Promise|Session|Map)\b/g, "\x01T\x01$&\x02");
  out = out.replace(/\b\d+(?:\.\d+)?\b/g, "\x01N\x01$&\x02");
  out = out.replace(/\b([a-zA-Z_$][\w$]*)(?=\()/g, "\x01F\x01$&\x02");
  return out
    .replace(/\x01C\x01([\s\S]*?)\x02/gs, '<span class="tk-com">$1</span>')
    .replace(/\x01S\x01([\s\S]*?)\x02/g,  '<span class="tk-str">$1</span>')
    .replace(/\x01K\x01([\s\S]*?)\x02/g,  '<span class="tk-key">$1</span>')
    .replace(/\x01T\x01([\s\S]*?)\x02/g,  '<span class="tk-typ">$1</span>')
    .replace(/\x01N\x01([\s\S]*?)\x02/g,  '<span class="tk-num">$1</span>')
    .replace(/\x01F\x01([\s\S]*?)\x02/g,  '<span class="tk-fn">$1</span>');
}

export function inlineMd(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}
