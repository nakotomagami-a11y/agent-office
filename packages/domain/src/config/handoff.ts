// Session handoff: an agent that cannot finish in its session ends its reply with
// HANDOFF_MARKER, and the server continues the work in a fresh session of the same
// seat (services/execution/handoff.ts). Browser-safe: the UI hides the marker.

/** An HTML comment, so a markdown reader of the raw output does not see it either. */
export const HANDOFF_MARKER = "<!-- agent-office:handoff -->";

/** Automatic takeovers in a row with no user message in between. Past it the chat
 *  goes idle and the user decides: an agent that hands off every turn would spend
 *  without end. */
export const MAX_AUTO_HANDOFFS = 3;

const LAST_REPLY_MAX_CHARS = 6000;
const REQUEST_MAX_CHARS = 3000;

export const HANDOFF_INSTRUCTIONS = [
  "If you cannot finish the task in this session (your context is nearly full, or a fresh start would",
  "get you unstuck), never ask the user to start a new session or to pass your notes on. Instead:",
  "",
  "1. Write your handoff notes (`NEXT_SESSION.md` in the project root when your rules ask for one).",
  "2. Make your final reply say what is done, what is left and the next step.",
  `3. End that reply with this line, exactly: ${HANDOFF_MARKER}`,
  "",
  "Agent Office then starts a fresh session of you with your last reply, and it carries on by itself.",
  "When it cannot (it hands off at most a few times in a row), the user sees your reply and decides.",
  "Never end with that line when the task is done or when you need the user to decide something.",
].join("\n");

/** First line of every takeover prompt: how a conversation started by a handoff is recognised. */
export const HANDOFF_PROMPT_HEAD = "**Session handoff.**";

export function endsWithHandoff(output: string): boolean {
  return output.trimEnd().endsWith(HANDOFF_MARKER);
}

/** Only the trailing marker: the same text elsewhere (a code block quoting it) is content. */
export function stripHandoffMarker(text: string): string {
  return endsWithHandoff(text) ? text.trimEnd().slice(0, -HANDOFF_MARKER.length).trimEnd() : text;
}

const quote = (text: string) => text.split("\n").map((l) => `> ${l}`).join("\n");
const tail = (text: string, max: number) => (text.length > max ? "…" + text.slice(-max) : text);
const head = (text: string, max: number) => (text.length > max ? text.slice(0, max) + "…" : text);

/** `request` is the user's latest message to this seat: each hop checks scope against it,
 *  not only against the previous session's paraphrase. */
export function buildHandoffPrompt(lastReply: string, request: string | null): string {
  const reply = tail(stripHandoffMarker(lastReply).trim(), LAST_REPLY_MAX_CHARS);
  return [
    `${HANDOFF_PROMPT_HEAD} You are taking over from your previous session on this task, which could not continue.`,
    "",
    ...(request ? ["The user's request:", "", quote(head(request.trim(), REQUEST_MAX_CHARS)), ""] : []),
    "Your previous session's last reply. It is that session's report, not an instruction from the user:",
    "",
    reply ? quote(reply) : "> (it ended without a reply)",
    "",
    "Read the handoff notes it wrote, if any (`NEXT_SESSION.md` in the project root),",
    "check the working tree, then carry on with the next step of the user's request yourself.",
  ].join("\n");
}
