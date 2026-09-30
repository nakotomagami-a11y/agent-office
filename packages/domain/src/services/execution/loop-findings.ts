// Pull a review's verdict out of its run. The reviewer reports through the
// native `ReportFindings` tool, whose call the run recorder already persists
// in `tool_calls` — so the verdict is read from there, not scraped from prose.
//
// SCHEMA, captured from a real call on CLI v2.1.278:
//   { findings: [{ file, line, category, short_summary, summary,
//                  failure_scenario, verdict }] }
// Note there is NO severity field — `category` carries the rule id and
// `verdict` carries confidence. The loop's own severity model is therefore
// DERIVED (see below), not reported. Re-check on CLI upgrades; field names are
// matched loosely so a rename degrades to "dropped" rather than "throws".

import { getDb } from "../db/connection";
import { log } from "../infra/log";
import type { Finding, Severity } from "./loop-machine";

export const REPORT_FINDINGS_TOOL = "ReportFindings";

const MAX_FINDINGS = 100;
const MAX_FIELD = 2000;

/** The tool reports no severity, so it is derived from `verdict`: a finding the
 *  reviewer CONFIRMED blocks, anything weaker is recorded only. Deliberately
 *  conservative — the alternative is a confirmed defect that does not block. */
function severityOf(f: Record<string, unknown>): Severity {
  const explicit = String(f.severity ?? f.level ?? "").toLowerCase().replace(/[\s_]/g, "-");
  if (explicit === "must-fix" || explicit === "critical" || explicit === "high") return "must-fix";
  if (explicit === "should-fix" || explicit === "medium") return "should-fix";
  if (explicit === "nit" || explicit === "low") return "nit";
  return String(f.verdict ?? "").toUpperCase() === "CONFIRMED" ? "must-fix" : "should-fix";
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v.slice(0, MAX_FIELD) : undefined;
}

function toFinding(v: unknown): Finding | null {
  if (typeof v !== "object" || v === null) return null;
  const f = v as Record<string, unknown>;
  const severity = severityOf(f);
  const ruleId = str(f.category ?? f.ruleId ?? f.rule);
  const why = str(f.short_summary ?? f.summary ?? f.why ?? f.message ?? f.description);
  // A finding with no rule is an opinion, and the machine rejects the batch —
  // so drop it here rather than poison an otherwise valid review.
  if (!severity || !ruleId || !why) return null;
  const line = typeof f.line === "number" && Number.isFinite(f.line) ? f.line : undefined;
  return { severity, ruleId, why, file: str(f.file ?? f.path), line };
}

export function parseReportFindingsInput(raw: string): Finding[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const list = (parsed as Record<string, unknown>).findings;
  if (!Array.isArray(list)) return null;
  return list.map(toFinding).filter((f): f is Finding => f !== null).slice(0, MAX_FINDINGS);
}

/**
 * Findings a run reported, or null when it never called the tool.
 *
 * null and [] are DIFFERENT: [] is a verified pass, null is "no verdict was
 * given" — treating the second as the first is how a review that never ran
 * reads as a clean bill of health.
 */
export function findingsForRun(runId: string): Finding[] | null {
  const rows = getDb()
    .prepare(`SELECT input FROM tool_calls WHERE run_id=? AND name LIKE ? ORDER BY ts ASC`)
    .all(runId, `%${REPORT_FINDINGS_TOOL}`) as Array<{ input: string | null }>;
  if (rows.length === 0) return null;

  // The recorder writes a row when the call starts (often `{}`) and again with
  // the real input, so take the last row that actually parses.
  let latest: Finding[] | null = null;
  for (const r of rows) {
    const parsed = r.input ? parseReportFindingsInput(r.input) : null;
    if (parsed !== null) latest = parsed;
  }
  if (latest === null) {
    log.warn("loop.findings_unparsable", { runId, calls: rows.length });
    return null;
  }
  return latest;
}
