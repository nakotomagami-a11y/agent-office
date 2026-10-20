// A seat's agent never posts to GitHub itself: it ends its turn with ao-post blocks, and Agent
// Office validates, stamps and posts them (docs/missions.md, "Agent Office is the only poster").
// Feed this the agent's own reply text only, never tool output: a file it read could hold a block.
import {
  COORDINATOR_ONLY_KINDS,
  COORDINATOR_SEAT,
  MAX_COMMENT_CHARS,
  MAX_RECIPIENTS,
  TO_ALL,
  TO_HUMAN,
  isAgentPostKind,
  type AgentPostKind,
  type MissionErrorCode,
} from "../../config/missions";
import { closesFence, openFence } from "./fences";

export interface OutboxPost {
  kind: AgentPostKind;
  to: string[];
  re?: number;
  supersedes?: number;
  text: string;
}

export interface OutboxError {
  code: MissionErrorCode;
  /** Short raw context (which block, which value), never prose. */
  detail: string;
}

/** Room left for the header line and the envelope Agent Office adds. */
const ENVELOPE_RESERVE = 2048;
const HEADER_KEYS = ["to", "kind", "re", "supersedes"];

export function parseOutbox(output: string, seat: string, roster: readonly string[]): { posts: OutboxPost[]; errors: OutboxError[] } {
  const lines = output.split(/\r?\n/);
  const posts: OutboxPost[] = [];
  const errors: OutboxError[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = openFence(lines[i] ?? "");
    if (!open) continue;
    let end = i + 1;
    while (end < lines.length && !closesFence(lines[end] ?? "", open.fence)) end++;
    // Any other block is quoted material: an ao-post shown inside it is being discussed, not sent.
    if (open.lang !== "ao-post") {
      // A block left open ends at the next post's closing fence, or the end: never post nothing silently.
      if (swallowsPost(lines.slice(i + 1, end))) {
        errors.push({ code: "outbox_malformed", detail: `an unclosed fence at line ${i + 1} swallows the post after it` });
      }
      i = end;
      continue;
    }
    const block = posts.length + errors.length + 1;
    if (end >= lines.length) {
      errors.push({ code: "outbox_malformed", detail: `block ${block}: no closing fence` });
      break;
    }
    const body = lines.slice(i + 1, end);
    i = end;
    if (cutShort(body, lines.slice(end + 1), open.fence)) {
      errors.push({ code: "outbox_inner_fence", detail: `block ${block}` });
      continue;
    }
    const result = parseBlock(body, seat, roster);
    if ("code" in result) errors.push({ code: result.code, detail: `block ${block}: ${result.detail}` });
    else posts.push(result);
  }
  return { posts, errors };
}

/** A quoted example post carries its own closing fence inside the outer block; a post whose
 *  closer is missing there lost it to the outer block, which was left open before it. */
function swallowsPost(inner: string[]): boolean {
  return inner.some((l, k) => {
    const o = openFence(l);
    return o?.lang === "ao-post" && !inner.slice(k + 1).some((x) => closesFence(x, o.fence));
  });
}

/** Did an inner fence end the post early? Either the body opens a ```lang block on this fence (its
 *  closer ended the post), or a bare ``` inside did: then text resumes right after the "closing"
 *  line, and a later fence closes what the agent meant as the end of the post. */
function cutShort(body: string[], after: string[], fence: string): boolean {
  const innerLang = body.some((l) => {
    const o = openFence(l);
    return o !== null && o.fence[0] === fence[0] && o.fence.length >= fence.length && o.lang !== "";
  });
  if (innerLang) return true;
  const next = after[0] ?? "";
  return next.trim() !== "" && openFence(next)?.lang !== "ao-post" && after.slice(1).some((l) => closesFence(l, fence));
}

function parseBlock(lines: string[], seat: string, roster: readonly string[]): OutboxPost | OutboxError {
  const sep = lines.findIndex((l) => l.trim() === "---");
  if (sep < 0) return { code: "outbox_malformed", detail: "no --- line" };
  const header = new Map<string, string>();
  for (const line of lines.slice(0, sep)) {
    if (!line.trim()) continue;
    const [, key = "", value = ""] = /^([a-z]+):\s*(.*?)\s*$/.exec(line) ?? [];
    if (!HEADER_KEYS.includes(key) || header.has(key)) return { code: "outbox_header_unknown", detail: line.slice(0, 60) };
    header.set(key, value);
  }

  const kind = header.get("kind") ?? "";
  if (!isAgentPostKind(kind)) return { code: "outbox_kind_unknown", detail: kind.slice(0, 40) };
  if (seat !== COORDINATOR_SEAT && COORDINATOR_ONLY_KINDS.includes(kind)) return { code: "outbox_kind_forbidden", detail: kind };

  const to = [...new Set((header.get("to") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  if (to.length === 0) return { code: "outbox_recipient_invalid", detail: "to: is empty" };
  if (to.length > MAX_RECIPIENTS) return { code: "outbox_recipient_invalid", detail: `${to.length} recipients` };
  const bad = to.find((r) => r === seat || (r !== TO_HUMAN && r !== TO_ALL && !roster.includes(r)));
  if (bad !== undefined) return { code: "outbox_recipient_invalid", detail: bad.slice(0, 40) };

  const ids: { re?: number; supersedes?: number } = {};
  for (const key of ["re", "supersedes"] as const) {
    const raw = header.get(key);
    if (raw === undefined) continue;
    const n = Number(raw);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(n)) return { code: "outbox_id_invalid", detail: `${key}: ${raw.slice(0, 24)}` };
    ids[key] = n;
  }

  const text = lines.slice(sep + 1).join("\n").trim();
  if (!text) return { code: "outbox_empty", detail: kind };
  if (text.length > MAX_COMMENT_CHARS - ENVELOPE_RESERVE) return { code: "outbox_too_long", detail: String(text.length) };
  return { kind, to, ...ids, text };
}
