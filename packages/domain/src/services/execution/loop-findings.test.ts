/**
 * Pins the REAL `ReportFindings` payload, captured from CLI v2.1.278 during
 * the Wave 5 exit check. The first parser was written against guessed field
 * names (`severity`/`ruleId`/`why`) and silently produced [] from a review
 * that had found two confirmed defects — so the loop converged on a diff it
 * had been told was broken.
 */
import assert from "node:assert";
import { test } from "node:test";
import { parseReportFindingsInput } from "./loop-findings";

// Verbatim shape from a real call (values trimmed).
const REAL = JSON.stringify({
  findings: [
    {
      file: "src/config.ts",
      line: 22,
      category: "arch.parse-dont-cast",
      short_summary: "loadSettings casts JSON.parse output instead of validating it",
      summary: "a type assertion over unvalidated disk input",
      failure_scenario: "a settings.json missing `locale` passes strict tsc",
      verdict: "CONFIRMED",
    },
    {
      file: "CONVENTIONS-NOTE.md",
      line: 1,
      category: "docs.citations-resolve",
      short_summary: "docs/conventions.md does not exist",
      summary: "no cited ruleId can resolve",
      failure_scenario: "citations cannot be grounded",
      verdict: "CONFIRMED",
    },
  ],
});

test("the real payload yields blocking findings, not an empty pass", () => {
  const out = parseReportFindingsInput(REAL);
  assert.ok(out, "a well-formed payload must parse");
  assert.equal(out!.length, 2);
  assert.equal(out![0]!.ruleId, "arch.parse-dont-cast", "`category` carries the rule id, not `ruleId`");
  assert.equal(out![0]!.severity, "must-fix", "a CONFIRMED finding must block");
  assert.equal(out![0]!.file, "src/config.ts");
  assert.equal(out![0]!.line, 22);
  assert.match(out![0]!.why, /casts JSON.parse/);
});

test("an unconfirmed finding is recorded but does not block", () => {
  const out = parseReportFindingsInput(JSON.stringify({
    findings: [{ file: "a.ts", line: 1, category: "arch.parse-dont-cast", short_summary: "maybe", verdict: "PLAUSIBLE" }],
  }));
  assert.equal(out![0]!.severity, "should-fix");
});

test("an explicit severity still wins when the tool ever sends one", () => {
  const out = parseReportFindingsInput(JSON.stringify({
    findings: [{ category: "r.x", short_summary: "s", severity: "nit", verdict: "CONFIRMED" }],
  }));
  assert.equal(out![0]!.severity, "nit");
});

test("a genuine empty verdict parses as [], never as null", () => {
  assert.deepEqual(parseReportFindingsInput(JSON.stringify({ findings: [] })), []);
});

test("junk yields null — no verdict, which is not a pass", () => {
  for (const bad of ["", "not json", "{}", '{"findings":"nope"}']) {
    assert.equal(parseReportFindingsInput(bad), null, `${bad} must not read as a clean review`);
  }
});
