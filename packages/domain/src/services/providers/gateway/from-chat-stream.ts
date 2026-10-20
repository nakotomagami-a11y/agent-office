// OpenAI Chat Completions stream chunks → Anthropic Messages SSE events, in the order the claude CLI
// parses them: message_start, content blocks (text or tool_use), message_delta, message_stop.
import { randomUUID } from "node:crypto";
import { z } from "zod";

const chunkSchema = z.object({
  choices: z.array(z.object({
    delta: z.object({
      content: z.string().nullish(),
      tool_calls: z.array(z.object({
        index: z.number().int(),
        id: z.string().nullish(),
        function: z.object({ name: z.string().nullish(), arguments: z.string().nullish() }).nullish(),
      })).nullish(),
    }).nullish(),
    finish_reason: z.string().nullish(),
  })).default([]),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    prompt_tokens_details: z.object({ cached_tokens: z.number().optional() }).nullish(),
  }).nullish(),
});
export type ChatChunk = z.infer<typeof chunkSchema>;
export const parseChatChunk = (raw: unknown): ChatChunk | null => {
  const parsed = chunkSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
};

const STOP_REASON: Record<string, string> = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use", function_call: "tool_use", content_filter: "refusal" };

export type StreamEnd = { ok: true; frames: string[] } | { ok: false; reason: "empty_response" | "stream_incomplete" | "truncated_tool_call" };

/** An error object inside a 200 body or a stream chunk: the upstream failed after all. */
export function inBandError(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || !("error" in raw) || !raw.error) return null;
  const { error } = raw;
  if (typeof error === "string") return error;
  return typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "upstream error";
}

export const sse = (type: string, data: Record<string, unknown>): string =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

export class AnthropicStreamWriter {
  private started = false;
  private index = -1;
  private open: { kind: "text" } | { kind: "tool"; toolIndex: number } | null = null;
  private toolBlocks = 0;
  private sawText = false;
  private finish: string | null = null;
  private usage = { input: 0, output: 0, cached: 0 };

  /** `names`: alias → original tool name, for names the request had to alias. */
  constructor(private readonly model: string, private readonly names: Map<string, string> = new Map()) {}

  push(chunk: ChatChunk): string[] {
    const out = this.start();
    if (chunk.usage) this.usage = {
      input: chunk.usage.prompt_tokens ?? this.usage.input,
      output: chunk.usage.completion_tokens ?? this.usage.output,
      cached: chunk.usage.prompt_tokens_details?.cached_tokens ?? this.usage.cached,
    };
    for (const choice of chunk.choices) {
      if (choice.delta?.content) out.push(...this.text(choice.delta.content));
      for (const call of choice.delta?.tool_calls ?? []) out.push(...this.tool(call));
      if (choice.finish_reason) this.finish = choice.finish_reason;
    }
    return out;
  }

  /**
   * A dropped connection is not a finished turn, and a tool call cut off by the length limit is
   * not a tool call: both are errors, as is a completion with nothing in it.
   */
  end(sawDone: boolean): StreamEnd {
    if (!this.sawText && this.toolBlocks === 0) return { ok: false, reason: "empty_response" };
    if (!this.finish && !sawDone) return { ok: false, reason: "stream_incomplete" };
    if (this.finish === "length" && this.toolBlocks > 0) return { ok: false, reason: "truncated_tool_call" };
    const stop = this.toolBlocks > 0 ? "tool_use" : STOP_REASON[this.finish ?? "stop"] ?? "end_turn";
    const usage = { input_tokens: Math.max(0, this.usage.input - this.usage.cached), output_tokens: this.usage.output, cache_read_input_tokens: this.usage.cached };
    return { ok: true, frames: [...this.start(), ...this.close(), sse("message_delta", { delta: { stop_reason: stop, stop_sequence: null }, usage }), sse("message_stop", {})] };
  }

  private start(): string[] {
    if (this.started) return [];
    this.started = true;
    const message = { id: `msg_${randomUUID()}`, type: "message", role: "assistant", model: this.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } };
    return [sse("message_start", { message })];
  }

  private close(): string[] {
    if (!this.open) return [];
    this.open = null;
    return [sse("content_block_stop", { index: this.index })];
  }

  private text(text: string): string[] {
    this.sawText = true;
    const out = this.open?.kind === "text" ? [] : [...this.close(), this.openBlock({ type: "text", text: "" }, { kind: "text" })];
    return [...out, sse("content_block_delta", { index: this.index, delta: { type: "text_delta", text } })];
  }

  private tool(call: NonNullable<NonNullable<ChatChunk["choices"][number]["delta"]>["tool_calls"]>[number]): string[] {
    const out: string[] = [];
    if (this.open?.kind !== "tool" || this.open.toolIndex !== call.index) {
      out.push(...this.close());
      const name = call.function?.name ?? "";
      const block = { type: "tool_use", id: call.id ?? `toolu_${randomUUID().replace(/-/g, "")}`, name: this.names.get(name) ?? name, input: {} };
      out.push(this.openBlock(block, { kind: "tool", toolIndex: call.index }));
      this.toolBlocks++;
    }
    const args = call.function?.arguments;
    if (args) out.push(sse("content_block_delta", { index: this.index, delta: { type: "input_json_delta", partial_json: args } }));
    return out;
  }

  private openBlock(contentBlock: Record<string, unknown>, open: NonNullable<AnthropicStreamWriter["open"]>): string {
    this.index++;
    this.open = open;
    return sse("content_block_start", { index: this.index, content_block: contentBlock });
  }
}
