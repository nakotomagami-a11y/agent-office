/**
 * `en.json` duplicate keys are SILENT: JSON.parse keeps the last one, so a
 * pasted key overwrites a live string with no error anywhere. That shipped —
 * two `permission_default_*` keys, four lines apart, and the picker rendered
 * the wrong one.
 *
 * Also asserts every permission mode has a message, which the exhaustive
 * `Record<(typeof PERMISSION_MODE_OPTS)[number], string>` does NOT: it
 * constrains the message-key STEM, not the existence of the message.
 */
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PERMISSION_MODE_OPTS } from "@agent-office/domain/config/agent-opts";

const RAW = readFileSync(join(process.cwd(), "messages", "en.json"), "utf8");

test("no object in en.json declares the same key twice", () => {
  // JSON.parse cannot report duplicates — it silently keeps the last — so walk
  // the raw text, tracking key sets per object depth.
  const dupes: string[] = [];
  const seen: Array<Set<string>> = [];
  const keyRe = /"((?:[^"\\]|\\.)*)"\s*:|[{}]/g;
  let m: RegExpExecArray | null;
  while ((m = keyRe.exec(RAW))) {
    if (m[0] === "{") seen.push(new Set());
    else if (m[0] === "}") seen.pop();
    else if (seen.length) {
      const top = seen[seen.length - 1]!;
      if (top.has(m[1]!)) dupes.push(m[1]!);
      top.add(m[1]!);
    }
  }
  assert.deepEqual(dupes, [], `duplicate keys silently overwrite earlier ones: ${dupes.join(", ")}`);
});

test("every permission mode the picker offers has a label and subtitle", () => {
  const msgs = JSON.parse(RAW) as { agent_editor: Record<string, string> };
  const stem = (m: string) => m.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
  for (const mode of PERMISSION_MODE_OPTS) {
    const key = mode === "bypassPermissions" ? "bypass" : stem(mode);
    for (const part of ["label", "subtitle"]) {
      assert.ok(
        msgs.agent_editor[`permission_${key}_${part}`],
        `mode "${mode}" renders a raw message key: agent_editor.permission_${key}_${part} is missing`,
      );
    }
  }
});
