/**
 * Messages ⇄ Chat Completions, against a sanitized request the real CLI 2.1.296 sent.
 *
 *   pnpm --filter @agent-office/domain test src/services/providers/gateway/translate.test.ts
 */
import assert from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { anthropicRequestSchema } from "./anthropic-request";
import { OUTPUT_TOKEN_CAP, toChatRequest, type ChatMessage } from "./to-chat";
import { AnthropicStreamWriter, parseChatChunk } from "./from-chat-stream";
import { fromChatCompletion } from "./from-chat";

const fixture: unknown = JSON.parse(readFileSync(join(import.meta.dirname, "cli-2.1.296-request.fixture.json"), "utf8"));
const body = fixture && typeof fixture === "object" && "body" in fixture ? fixture.body : null;

const events = (frames: string[]) => frames.map((f) => {
  const data: unknown = JSON.parse(f.split("\ndata: ")[1]!);
  return data as { type: string; index?: number; delta?: Record<string, unknown>; content_block?: Record<string, unknown>; usage?: Record<string, number> };
});

test("the real CLI request parses, and translates to Chat Completions", () => {
  const req = anthropicRequestSchema.parse(body);
  const chat = toChatRequest(req, "gpt-mid", "max_completion_tokens");
  const messages = chat.messages as ChatMessage[];
  assert.deepStrictEqual(messages.map((m) => m.role), ["system", "user", "system", "assistant", "tool", "system"]);
  assert.deepStrictEqual(messages[3]!.tool_calls, [{ id: "toolu_1", type: "function", function: { name: "Bash", arguments: '{"command":"echo hi","description":"say hi"}' } }]);
  assert.deepStrictEqual(messages[4], { role: "tool", tool_call_id: "toolu_1", content: "hi" });
  assert.equal(chat.max_completion_tokens, Math.min(32000, OUTPUT_TOKEN_CAP));
  assert.deepStrictEqual((chat.tools as Array<{ function: { name: string } }>).map((t) => t.function.name), ["Bash", "Read"]);
  assert.deepStrictEqual(chat.stream_options, { include_usage: true });
  for (const dropped of ["thinking", "context_management", "output_config", "metadata", "system", "max_tokens"]) assert.ok(!(dropped in chat), dropped);
});

test("thinking blocks (signed ones from a resumed Claude session included) never reach another backend", () => {
  const req = anthropicRequestSchema.parse({
    model: "m", max_tokens: 10, messages: [{ role: "assistant", content: [
      { type: "thinking", thinking: "secret plan", signature: "sig" }, { type: "redacted_thinking", data: "x" }, { type: "text", text: "hi" },
    ] }],
  });
  const json = JSON.stringify(toChatRequest(req, "m", "max_tokens"));
  assert.ok(!json.includes("secret plan") && !json.includes("sig"));
  assert.ok(json.includes('"content":"hi"'));
});

test("images become data URIs, also when a tool result carries them", () => {
  const image = { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } };
  const req = anthropicRequestSchema.parse({ model: "m", max_tokens: 10, messages: [{ role: "user", content: [
    { type: "tool_result", tool_use_id: "t1", content: [{ type: "text", text: "shot" }, image] }, image,
  ] }] });
  const messages = toChatRequest(req, "m", "max_tokens").messages as ChatMessage[];
  assert.deepStrictEqual(messages[0], { role: "tool", tool_call_id: "t1", content: "shot" });
  assert.deepStrictEqual(messages[1]!.content, [
    { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
  ]);
});

test("a streamed answer with text, then two tool calls, becomes Anthropic events in CLI order", () => {
  const w = new AnthropicStreamWriter("gpt-mid");
  const chunks = [
    { choices: [{ delta: { content: "Let me " } }] },
    { choices: [{ delta: { content: "look." } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_a", function: { name: "Bash", arguments: '{"command":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"ls"}' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 1, id: "call_b", function: { name: "Read", arguments: "{}" } }] }, finish_reason: "tool_calls" }] },
    { choices: [], usage: { prompt_tokens: 100, completion_tokens: 7, prompt_tokens_details: { cached_tokens: 40 } } },
  ];
  const frames = chunks.flatMap((c) => w.push(parseChatChunk(c)!));
  const all = events([...frames, ...w.end()!]);
  assert.deepStrictEqual(all.map((e) => e.type), [
    "message_start", "content_block_start", "content_block_delta", "content_block_delta", "content_block_stop",
    "content_block_start", "content_block_delta", "content_block_delta", "content_block_stop",
    "content_block_start", "content_block_delta", "content_block_stop", "message_delta", "message_stop",
  ]);
  assert.deepStrictEqual(all[5]!.content_block, { type: "tool_use", id: "call_a", name: "Bash", input: {} });
  assert.deepStrictEqual(all.at(-2)!.delta, { stop_reason: "tool_use", stop_sequence: null });
  assert.deepStrictEqual(all.at(-2)!.usage, { input_tokens: 60, output_tokens: 7, cache_read_input_tokens: 40 });
});

test("finish reasons map; an empty completion is reported, never a silent empty answer", () => {
  const w = new AnthropicStreamWriter("m");
  w.push(parseChatChunk({ choices: [{ delta: { content: "x" }, finish_reason: "length" }] })!);
  assert.deepStrictEqual(events(w.end()!).find((e) => e.type === "message_delta")!.delta, { stop_reason: "max_tokens", stop_sequence: null });
  const empty = new AnthropicStreamWriter("m");
  empty.push(parseChatChunk({ choices: [{ delta: {}, finish_reason: "stop" }] })!);
  assert.equal(empty.end(), null);
  assert.equal(parseChatChunk({ choices: "nope" }), null);
});

test("a non-streamed completion converts, with tool input parsed", () => {
  const msg = fromChatCompletion({
    choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "Read", arguments: '{"path":"a"}' } }] }, finish_reason: "tool_calls" }],
    usage: { prompt_tokens: 5, completion_tokens: 2 },
  }, "m");
  assert.deepStrictEqual(msg?.content, [{ type: "tool_use", id: "c1", name: "Read", input: { path: "a" } }]);
  assert.equal(msg?.stop_reason, "tool_use");
  assert.equal(fromChatCompletion({ choices: [{ message: { content: "" } }] }, "m"), null);
});
