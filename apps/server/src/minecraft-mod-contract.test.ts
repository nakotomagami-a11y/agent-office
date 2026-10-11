import assert from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { API_ROUTES } from "@agent-office/api-contract";
import { EFFORT_OPTS, PERMISSION_MODE_OPTS } from "@agent-office/domain/config/agent-opts";
import { MODEL_IDS } from "@agent-office/domain/config/models";
import { RUN_ERROR_CODES } from "@agent-office/domain/config/run-errors";
import { MAX_UPLOAD_BYTES } from "@agent-office/domain/services/infra/paths";
import { z } from "zod";

// The Minecraft mod is Java, so it cannot import the contract: core/Routes.java, Protocol.java and RunErrors.java
// mirror what it uses, and this holds each mirror to its TypeScript source (rules mod.api-paths-one-place,
// mod.status-vocab). A server change the mod would misread fails here, not in the game.
const repo = (path: string) => new URL(`../../../${path}`, import.meta.url);
const read = (path: string) => readFileSync(repo(path), "utf8").replace(/\r\n/g, "\n");
const MOD_CORE = "apps/minecraft-mod/src/main/java/dev/agentoffice/mc/core";

/** Routes.java methods that are not an API_ROUTES entry. */
const HELPERS = ["conversationsOf"];

function javaRoutes(): Map<string, string> {
  const out = new Map<string, string>();
  const method = /public static String (\w+)\([^)]*\)\s*\{\s*return ([^;]+);/g;
  for (const [, name, body] of read(`${MOD_CORE}/Routes.java`).matchAll(method)) {
    const literal = /^"([^"]+)"$/.exec(body!.trim());
    const filled = /^fill\("([^"]+)"/.exec(body!.trim());
    out.set(name!, literal?.[1] ?? filled?.[1] ?? "");
  }
  return out;
}

test("Routes.java builds every path exactly as API_ROUTES does", () => {
  const routes = javaRoutes();
  assert.ok(routes.size > 10, "read the mod's routes");
  const wrong: string[] = [];
  for (const [name, template] of routes) {
    if (HELPERS.includes(name)) continue;
    const entry = (API_ROUTES as Record<string, unknown>)[name];
    if (entry === undefined) {
      wrong.push(`${name}: no API_ROUTES.${name}`);
      continue;
    }
    const expected = typeof entry === "string"
      ? entry
      : (entry as (...a: string[]) => string)(...Array.from({ length: (entry as () => string).length }, (_, i) => `__arg${i}__`));
    let i = 0;
    const actual = template.replace(/\{[^}]+\}/g, () => `__arg${i++}__`);
    if (actual !== expected) wrong.push(`${name}: mod builds ${actual || "(not a template)"}, contract ${expected}`);
  }
  assert.deepStrictEqual(wrong, []);
});

test("every Routes.java method that is not a route is a known helper", () => {
  const routes = javaRoutes();
  const unknown = [...routes.keys()].filter((n) => !(n in API_ROUTES) && !HELPERS.includes(n));
  assert.deepStrictEqual(unknown, []);
  for (const h of HELPERS) assert.ok(routes.has(h), `Routes.${h} is gone: drop it from HELPERS`);
});

/** Protocol.java's nested class → the values of its String constants. */
function javaVocabularies(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [, name, body] of read(`${MOD_CORE}/Protocol.java`).matchAll(/public static final class (\w+) \{([\s\S]*?)\n {4}\}/g)) {
    out.set(name!, [...body!.matchAll(/public static final String \w+ = "([^"]*)";/g)].map((m) => m[1]!));
  }
  return out;
}

/** The string members of a TypeScript union, as written in its source. */
function union(source: string, pattern: RegExp): string[] {
  const m = pattern.exec(source);
  assert.ok(m, `found ${pattern} in the domain's source`);
  return [...m[1]!.matchAll(/"([^"]+)"/g)].map((s) => s[1]!);
}

test("Protocol.java uses only words the server sends", () => {
  const types = read("packages/domain/src/types/index.ts");
  const runs = read("packages/domain/src/services/execution/runs/types.ts");
  const server: Record<string, string[]> = {
    Conversation: union(types, /export type ConversationStatus = ([^;]+);/),
    Turn: union(types, /export interface PersistedRun \{[\s\S]*?\n {2}status: ([^;]+);/),
    SubAgent: union(types, /export type SubAgentStatus = ([^;]+);/),
    Event: [.../export type SseEvent =([\s\S]*?)\n\n/.exec(runs)![1]!.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]!),
  };
  const vocabularies = javaVocabularies();
  assert.deepStrictEqual([...vocabularies.keys()].sort(), Object.keys(server).sort(), "a Protocol class per mirrored vocabulary");
  const unknown = [...vocabularies].flatMap(([name, values]) => values.filter((v) => !server[name]!.includes(v)).map((v) => `${name}: ${v}`));
  assert.deepStrictEqual(unknown, []);
});

test("Protocol.Action is exactly the conversation actions the server routes", () => {
  const body = /public enum Action \{\s*([\w\s,]+);/.exec(read(`${MOD_CORE}/Protocol.java`));
  assert.ok(body, "found Protocol.Action");
  const mod = body[1]!.split(",").map((a) => `conversation${a.trim().charAt(0)}${a.trim().slice(1).toLowerCase()}`);
  const server = Object.keys(API_ROUTES).filter((k) => /^conversation(Retry|Resume|Skip|New)$/.test(k));
  assert.deepStrictEqual(mod.sort(), server.sort());
});

const WebMessages = z.object({
  errors: z.object({ run: z.record(z.object({ title: z.string() })) }),
  composer: z.object({ attachments_intro: z.string() }),
});

/** ServerMirror.java's constant → its value: a string list, a string, or a number (a product of integer literals). */
function javaMirror(): Map<string, string[] | string | number> {
  const out = new Map<string, string[] | string | number>();
  for (const [, name, value] of read(`${MOD_CORE}/ServerMirror.java`).matchAll(/public static final [\w<>]+ (\w+) =\s*([\s\S]*?);/g)) {
    const v = value!.trim();
    if (/^(List|Set)\.of\(/.test(v)) out.set(name!, [...v.matchAll(/"([^"]*)"/g)].map((m) => m[1]!));
    else if (v.startsWith('"')) out.set(name!, z.string().parse(JSON.parse(v)));
    else out.set(name!, v.split("*").reduce((p, f) => p * Number(f.trim().replace(/L$/, "").replace(/_/g, "")), 1));
  }
  return out;
}

test("ServerMirror.java holds what Agent Office holds", () => {
  const mirror = javaMirror();
  const displayName = read("apps/web/src/lib/agent-display-name.ts");
  const expected: Record<string, string[] | string | number> = {
    MODELS: ["", ...MODEL_IDS],
    EFFORTS: ["", ...EFFORT_OPTS],
    PERMISSION_MODES: ["", ...PERMISSION_MODE_OPTS],
    MAX_UPLOAD_BYTES,
    GH_TIMEOUT_MS: Number(/const TIMEOUT_MS = ([\d_]+);/.exec(read("packages/domain/src/services/review/gh.ts"))?.[1]?.replace(/_/g, "")),
    ATTACHMENTS_INTRO: WebMessages.parse(JSON.parse(read("apps/web/messages/en.json"))).composer.attachments_intro,
    NAME_VARIANTS: union(displayName, /const VARIANT_SUFFIXES = new Set\(\[([^\]]+)\]\)/),
  };
  assert.deepStrictEqual([...mirror.keys()].sort(), Object.keys(expected).sort(), "every ServerMirror value has its source here");
  for (const [name, value] of mirror) {
    const want = expected[name]!;
    if (name === "NAME_VARIANTS") assert.deepStrictEqual([...(value as string[])].sort(), [...(want as string[])].sort(), name);
    else assert.deepStrictEqual(value, want, name);
  }
});

/** Codes the web shows without an errors.run title: `stopped` is a neutral "Stopped" line, not an error card. */
const NO_WEB_TITLE = ["stopped"];

test("RunErrors.java titles every run error code as the web does", () => {
  const titles = new Map([...read(`${MOD_CORE}/RunErrors.java`).matchAll(/Map\.entry\("([^"]+)", "([^"]+)"\)/g)].map((m) => [m[1]!, m[2]!]));
  assert.deepStrictEqual([...titles.keys()].sort(), [...RUN_ERROR_CODES].sort());
  const web = WebMessages.parse(JSON.parse(read("apps/web/messages/en.json"))).errors.run;
  const differ = [...titles]
    .filter(([code, title]) => (web[code] ? web[code].title !== title : !NO_WEB_TITLE.includes(code)))
    .map(([code, title]) => `${code}: mod "${title}", web ${web[code] ? `"${web[code].title}"` : "has no title"}`);
  assert.deepStrictEqual(differ, []);
  assert.deepStrictEqual(NO_WEB_TITLE.filter((code) => web[code]), [], "the web titles it now: drop it from NO_WEB_TITLE");
});
