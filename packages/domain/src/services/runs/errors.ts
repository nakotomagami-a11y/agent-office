// Pure run-failure classification + rate-limit event building. No run state,
// no I/O — the unit-testable core of run error handling.

import type { RunErrorCode, SseRateLimitEvent } from "../../types/index";
import type { StreamEvent } from "./types";
import { parseResetTimeFromMessage } from "./reset-time";

/** Cap error detail so no code path can ever leak a wall of transcript text. */
export function capDetail(s: string): string | undefined {
  const trimmed = s.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 300 ? `${trimmed.slice(0, 297)}…` : trimmed;
}

/** Classify an OS spawn failure into a run-error code + short detail. */
export function classifySpawnError(err: unknown, cwd?: string): { code: RunErrorCode; detail?: string } {
  const s = String(err);
  if (/ENOTDIR|ENOENT|not a directory/i.test(s) && (cwd ?? "").includes(".worktrees")) {
    return { code: "worktree_missing", detail: capDetail(s) };
  }
  return { code: "spawn_failed", detail: capDetail(s) };
}

const AUTH_ERROR_RE =
  /failed to authenticate|oauth session|not (?:logged in|authenticated)|invalid api key|credentials?.*(?:expired|invalid|missing)|please run.*login/i;

/**
 * Classify a CLI `is_error` result. `raw` is the CLI-provided error string,
 * which is often blank — the real message was streamed as text. In that case
 * fall back to the LAST SINGLE LINE of output (capped), never the whole
 * paragraph, so the error card can never become a transcript dump.
 */
export function classifyResultError(raw: string, output: string): { code: RunErrorCode; detail?: string } {
  const text = raw.trim();
  if (AUTH_ERROR_RE.test(text)) return { code: "auth_expired", detail: capDetail(text) };
  const detail = text || output.trim().split("\n").filter(Boolean).at(-1) || "";
  return { code: "unknown", detail: capDetail(detail) };
}

// Claude's plan/session/usage limit copy, e.g.
// "You've hit your session limit · resets 9:40am (Africa/Cairo)". The CLI often
// reports this as a plain `is_error` result (the message streamed as assistant
// text, with no structured rate_limit_event), so we recognize the copy here and
// surface a proper rate-limit card + auto-resume instead of a generic failure.
const LIMIT_TEXT_RE =
  /\b(?:hit|reached|exceeded)\b[^\n.]*\blimit\b|\b(?:session|usage|weekly|5-?hour)\s+limit\b|\brate[- ]?limit(?:ed)?\b/i;

/**
 * Detect a rate/usage-limit failure hiding in an `is_error` result. Scans the
 * CLI error string first, then the run output, for Claude's limit copy. Returns
 * the exact matching line (capped) plus the parsed reset time in unix seconds,
 * or null when nothing looks like a limit.
 */
export function detectRateLimitResult(
  raw: string,
  output: string,
  now: Date = new Date(),
): Omit<SseRateLimitEvent, "runId"> | null {
  const line = firstLimitLine(raw) ?? firstLimitLine(output);
  if (!line) return null;
  const resetsMs = parseResetTimeFromMessage(line, now);
  return {
    message: capDetail(line) ?? line,
    resetsAt: resetsMs ? Math.floor(resetsMs / 1000) : undefined,
    severity: "limit",
  };
}

function firstLimitLine(text: string): string | undefined {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && LIMIT_TEXT_RE.test(trimmed)) return trimmed;
  }
  return undefined;
}

// Claude CLI stream-json `rate_limit_event.status` values, per Anthropic's
// unified rate-limit signal: "allowed" (benign — no card), "allowed_warning"
// (approaching — early WARNING, run keeps going) and "rejected" (hard LIMIT).
// Only "rejected" is terminal; any other non-"allowed" status is treated as a
// warning so an unknown value never mislabels a still-running agent as stopped.
const TERMINAL_RATE_LIMIT_STATUSES = new Set(["rejected"]);

export function buildRateLimitEvent(
  info: StreamEvent["rate_limit_info"],
  runId: string,
): SseRateLimitEvent | null {
  const status = info?.status;
  if (!status || status === "allowed") return null;
  const severity: SseRateLimitEvent["severity"] = TERMINAL_RATE_LIMIT_STATUSES.has(status)
    ? "limit"
    : "warning";
  const resetsAt = info?.resetsAt;
  const resetMsg = resetsAt
    ? ` Resets at ${new Date(resetsAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}.`
    : "";
  const limitType = info?.rateLimitType ? ` (${info.rateLimitType} limit)` : "";
  const message =
    severity === "limit"
      ? `Rate limited by Anthropic API${limitType}.${resetMsg}`
      : `Approaching Anthropic API rate limit${limitType}.${resetMsg} The run will keep going.`;
  return { runId, message, resetsAt, severity };
}
