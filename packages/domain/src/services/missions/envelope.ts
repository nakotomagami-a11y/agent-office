// The machine-readable header every mission post ends with (docs/missions.md, "The envelope").
import { z } from "zod";
import {
  MAX_COMMENT_CHARS,
  MAX_RECIPIENTS,
  MISSION_ENVELOPE_VERSION,
  MISSION_ID,
  MISSION_POST_KINDS,
  SEAT_ID,
  TO_ALL,
  TO_HUMAN,
} from "../../config/missions";
import { unclosedFence } from "./fences";

export const isSeatId = (v: string): boolean => SEAT_ID.test(v) && v !== TO_HUMAN && v !== TO_ALL;

const DEVICE = /^[a-z0-9-]{1,64}$/;
const seat = z.string().refine(isSeatId);
const recipient = z.string().regex(SEAT_ID);
const commentId = z.number().int().positive();

// Unknown keys are stripped, so a newer device's extra field does not make its post unreadable
// here. That is also why signing cannot be an optional v1 field: an old device would strip the
// signature and accept the post unsigned. Signed envelopes are ao:v2. `kind` stays closed.
const envelopeShape = z.object({
  m: z.string().regex(MISSION_ID),
  kind: z.enum(MISSION_POST_KINDS),
  from: z.object({ seat: z.union([seat, z.literal(TO_HUMAN)]), device: z.string().regex(DEVICE) }),
  to: z.array(recipient).min(1).max(MAX_RECIPIENTS),
  re: commentId.optional(),
  supersedes: commentId.optional(),
  stamp: z
    .object({
      sha: z.string().regex(/^[0-9a-f]{7,40}$/).optional(),
      branch: z.string().max(255).optional(),
      dirty: z.boolean().optional(),
      os: z.string().max(64).optional(),
      hw: z.string().max(128).optional(),
    })
    .optional(),
  data: z.record(z.string(), z.union([z.string().max(1024), z.number(), z.boolean()])).optional(),
});

export type Envelope = z.infer<typeof envelopeShape>;

const acceptShape = z.object({ device: z.string().regex(DEVICE) });
const movedShape = z.object({ pr: z.number().int().positive() });

export const acceptedDevice = (e: Envelope): string | null => acceptShape.safeParse(e.data).data?.device ?? null;
export const movedTo = (e: Envelope): number | null => movedShape.safeParse(e.data).data?.pr ?? null;

const PREFIX = "<!-- ao:v";

/** Throws on an envelope the schema rejects; posting code goes through formatPost. */
export function formatEnvelope(env: Envelope): string {
  const json = JSON.stringify(envelopeShape.parse(env)).replace(/</g, "\\u003c").replace(/>/g, "\\u003e");
  return `${PREFIX}${MISSION_ENVELOPE_VERSION} ${json} -->`;
}

export type ParsedPost =
  | { ok: true; envelope: Envelope; text: string }
  | { ok: false; reason: "no_envelope" | "unsupported_version" | "invalid_envelope" };

/** Only the shape formatPost writes counts: the envelope alone on the last line, after a blank
 *  line. One quoted (`> <!-- …`), inline, or mid-body is someone else's post being discussed. */
export function parsePost(body: string): ParsedPost {
  const trimmed = body.trimEnd();
  const nl = trimmed.lastIndexOf("\n");
  const last = trimmed.slice(nl + 1);
  const before = trimmed.slice(0, nl + 1);
  if (nl < 0 || !last.startsWith(PREFIX) || !/\r?\n[ \t]*\r?\n$/.test(before)) return { ok: false, reason: "no_envelope" };
  const match = /^<!-- ao:v(\d+) (\{.*\}) -->$/.exec(last);
  if (!match) return { ok: false, reason: "no_envelope" };
  if (Number(match[1]) !== MISSION_ENVELOPE_VERSION) return { ok: false, reason: "unsupported_version" };
  let raw: unknown;
  try {
    raw = JSON.parse(match[2] ?? "");
  } catch {
    return { ok: false, reason: "invalid_envelope" };
  }
  const parsed = envelopeShape.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "invalid_envelope" };
  return { ok: true, envelope: parsed.data, text: before.trimEnd() };
}

/** GitHub renders nothing for an HTML comment or a link-reference definition (`[x]: # "note"`):
 *  either would let one agent pass another a note the human never sees on the PR. And a block left
 *  open would show the envelope as code. All three are neutralised before posting. */
function visible(text: string): string {
  const safe = text.trim()
    .replace(/<!--/g, "&lt;!--")
    // Also inside block quotes and list items, where CommonMark allows them too.
    .replace(/^((?:[ \t]{0,3}(?:>|[-+*]|\d{1,9}[.)])[ \t]*)*[ \t]{0,3})\[([^\]\r\n]+)\]:/gm, "$1\\[$2]:");
  const open = unclosedFence(safe);
  return open ? `${safe}\n${open}` : safe;
}

export type FormattedPost = { ok: true; body: string } | { ok: false; reason: "invalid_envelope" } | { ok: false; reason: "too_long"; length: number };

export function formatPost(header: string, text: string, env: Envelope): FormattedPost {
  if (!envelopeShape.safeParse(env).success) return { ok: false, reason: "invalid_envelope" };
  const body = `${visible(header)}\n\n${visible(text)}\n\n${formatEnvelope(env)}`;
  return body.length > MAX_COMMENT_CHARS ? { ok: false, reason: "too_long", length: body.length } : { ok: true, body };
}
