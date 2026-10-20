/**
 * startRun per provider, against a stub `claude` that records its argv, env and `--settings` pin.
 * Strict: an unavailable provider spawns nothing and records why; no child ever holds a provider key.
 *
 *   pnpm --filter @agent-office/domain test src/services/execution/runs.provider.test.ts
 */
import assert from "node:assert";
import { after, test } from "node:test";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const sandbox = mkdtempSync(join(tmpdir(), "ao-runs-provider-"));
process.env.HOME = sandbox;
process.env.USERPROFILE = sandbox;
process.env.ANTHROPIC_BASE_URL = "http://inherited-evil";

const STUB = `
const fs = require("fs");
const args = process.argv.slice(2);
const at = args.indexOf("--settings");
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(ANTHROPIC_|CLAUDE_CODE_|NO_PROXY)/i.test(k)));
fs.writeFileSync(process.env.STUB_RECORD, JSON.stringify({ args, env, pin: at === -1 ? null : fs.readFileSync(args[at + 1], "utf8") }));
process.stdin.resume();
process.stdin.on("end", () => {
  process.stdout.write(JSON.stringify({ type: "result", is_error: false, session_id: "s" }) + "\\n");
  process.exit(0);
});
`;
const dir = mkdtempSync(join(tmpdir(), "ao-claude-stub-"));
writeFileSync(join(dir, "stub.cjs"), STUB);
writeFileSync(join(dir, "claude.cmd"), `@node "%~dp0stub.cjs" %*\r\n`);
writeFileSync(join(dir, "claude"), `#!/bin/sh\nexec node "${join(dir, "stub.cjs")}" "$@"\n`);
chmodSync(join(dir, "claude"), 0o755);
process.env.AO_CLAUDE_BIN = join(dir, process.platform === "win32" ? "claude.cmd" : "claude");
after(() => rmSync(dir, { recursive: true, force: true }));

const { attachEmit, registerRunFinishedListener, startRun } = await import("./runs");
const store = await import("../providers/store");
const { lookupGatewayToken } = await import("../providers/gateway-tokens");
const { getRun } = await import("../infra/store");

const KEY = "sk-proj-SENTINEL-provider-key-1234";
const MODELS = { haiku: "small", sonnet: "mid", opus: "big" };
interface Record_ { args: string[]; env: Record<string, string>; pin: string | null }
const asRecord = (raw: unknown): Record_ => {
  assert.ok(raw && typeof raw === "object" && "args" in raw && "env" in raw && "pin" in raw);
  return raw as Record_;
};
const asPin = (raw: unknown): { apiKeyHelper: string; env: Record<string, string> } => {
  assert.ok(raw && typeof raw === "object" && "apiKeyHelper" in raw && "env" in raw);
  return raw as { apiKeyHelper: string; env: Record<string, string> };
};

function run(args: string[] = ["-p"]): Promise<{ runId: string; record: Record_ | null }> {
  const record = join(sandbox, `record-${Math.random()}.json`);
  process.env.STUB_RECORD = record;
  const { runId } = startRun({ agentId: "t", agentName: "T", prompt: "hi", model: "m", effort: "e", args, stdin: "hi" });
  return new Promise((resolve) => {
    const read = () => resolve({ runId, record: existsSync(record) ? asRecord(JSON.parse(readFileSync(record, "utf8"))) : null });
    if (!attachEmit(runId, (e) => { if (e.name === "done") read(); })) setTimeout(read, 50);
  });
}

test("subscription: --settings pin first, every backend var pinned empty, inherited ones gone", async () => {
  store.setSelection("subscription", "chosen");
  const { runId, record } = await run();
  assert.equal(record?.args[0], "--settings");
  const pin = asPin(JSON.parse(record!.pin!));
  assert.equal(pin.apiKeyHelper, "");
  assert.ok(Object.values(pin.env).every((v) => v === ""));
  assert.equal(record?.env.ANTHROPIC_BASE_URL, undefined);
  assert.ok(!existsSync(record!.args[1]!), "pin deleted when the run ends");
  assert.deepStrictEqual([getRun(runId)?.provider, getRun(runId)?.costBasis], ["subscription", "notional"]);
});

test("a chosen provider that cannot run spawns nothing and records why", async () => {
  store.setSelection("openai", "chosen");
  let finished: boolean | undefined;
  const off = registerRunFinishedListener((_id, ok) => { finished = ok; });
  const { runId, record } = await run();
  off();
  assert.equal(record, null, "the stub never ran");
  const row = getRun(runId);
  assert.deepStrictEqual([row?.status, row?.errorCode, row?.errorDetail, row?.provider], ["error", "provider_unavailable", "key_missing", "openai"]);
  assert.equal(finished, false);
});

test("openai: the child gets the gateway and a run token, never the key; the token dies with the run", async () => {
  store.saveProviderConfig("openai", { apiKey: KEY, models: MODELS });
  const { runId, record } = await run();
  const token = record!.env.ANTHROPIC_AUTH_TOKEN!;
  assert.match(record!.env.ANTHROPIC_BASE_URL!, /\/api\/gateway$/);
  assert.equal(record!.env.ANTHROPIC_DEFAULT_OPUS_MODEL, "big");
  assert.ok(!JSON.stringify(record).includes("SENTINEL"), "no provider key in argv, env or pin");
  assert.equal(lookupGatewayToken(token), null, "revoked at finalize");
  assert.deepStrictEqual([getRun(runId)?.provider, getRun(runId)?.costBasis], ["openai", "unknown"]);
});

test("a budget cap openai cannot enforce refuses the run; local drops the flag", async () => {
  const capped = await run(["-p", "--max-budget-usd", "1"]);
  assert.equal(capped.record, null);
  assert.equal(getRun(capped.runId)?.errorDetail, "budget_unenforceable");

  store.setSelection("local", "chosen");
  store.saveProviderConfig("local", { baseUrl: "http://localhost:11434/v1", models: MODELS });
  const local = await run(["-p", "--max-budget-usd", "1"]);
  assert.ok(local.record && !local.record.args.includes("--max-budget-usd"));
  assert.equal(local.record.env.CLAUDE_CODE_MAX_RETRIES, "2");
});
