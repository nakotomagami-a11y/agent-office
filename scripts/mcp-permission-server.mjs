#!/usr/bin/env node
/**
 * Minimal stdio MCP server exposing one tool: `permission_prompt`.
 *
 * The Claude CLI is handed this via `--permission-prompt-tool`. When a tool call
 * needs approval in `--print` mode, the CLI calls this tool instead of prompting
 * a TTY that does not exist. We forward the request to Agent Office over HTTP
 * and block until the user answers (or the app's timeout denies it).
 *
 * Deliberately dependency-free and tiny: it is spawned once per run, so startup
 * cost is paid on every summon.
 *
 * Env: AO_BASE_URL (default http://127.0.0.1:3000), AO_RUN_ID.
 */
import { createInterface } from "node:readline";

const BASE = process.env.AO_BASE_URL ?? "http://127.0.0.1:3000";
const RUN_ID = process.env.AO_RUN_ID ?? "";

const TOOL = {
  name: "permission_prompt",
  description:
    "Ask the human operator to approve or deny a tool call. Returns an allow/deny " +
    "decision. Called automatically by the CLI; do not invoke it directly.",
  inputSchema: {
    type: "object",
    properties: {
      tool_name: { type: "string" },
      input: { type: "object" },
    },
    required: ["tool_name"],
  },
};

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function askHost(toolName, input) {
  // Fail CLOSED. If the app is unreachable we deny — never allow a command the
  // user could not see.
  try {
    const res = await fetch(`${BASE}/api/runs/${encodeURIComponent(RUN_ID)}/permission`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tool: toolName, input }),
    });
    if (!res.ok) return { behavior: "deny", message: `permission host returned ${res.status}` };
    const body = await res.json();
    return body.decision === "allow"
      ? { behavior: "allow", updatedInput: input ?? {} }
      : { behavior: "deny", message: body.reason ?? "denied by the operator" };
  } catch (err) {
    return { behavior: "deny", message: `permission host unreachable: ${String(err)}` };
  }
}

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return {
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "agent-office-permissions", version: "1.0.0" },
      },
    };
  }
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: [TOOL] } };
  if (method === "tools/call") {
    const decision = await askHost(params?.arguments?.tool_name ?? "unknown", params?.arguments?.input);
    // The CLI reads the decision from the tool's text content as JSON.
    return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(decision) }] } };
  }
  if (typeof id === "undefined") return null; // notification
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const res = await handle(req);
  if (res) send(res);
});
