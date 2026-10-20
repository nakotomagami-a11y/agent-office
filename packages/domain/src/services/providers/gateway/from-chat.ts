// A non-streamed Chat Completion → an Anthropic Messages response body.
import { randomUUID } from "node:crypto";
import { z } from "zod";

const completionSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().nullish(),
      tool_calls: z.array(z.object({ id: z.string(), function: z.object({ name: z.string(), arguments: z.string() }) })).nullish(),
    }),
    finish_reason: z.string().nullish(),
  })).min(1),
  usage: z.object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    prompt_tokens_details: z.object({ cached_tokens: z.number().optional() }).nullish(),
  }).nullish(),
});

function toolInput(args: string): unknown {
  try {
    return JSON.parse(args) as unknown;
  } catch {
    return {};
  }
}

/** Null when the body is not a completion, or the completion is empty. */
export function fromChatCompletion(raw: unknown, model: string, names: Map<string, string> = new Map()): Record<string, unknown> | null {
  const parsed = completionSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { message, finish_reason } = parsed.data.choices[0]!;
  const content: Array<Record<string, unknown>> = [];
  if (message.content) content.push({ type: "text", text: message.content });
  for (const call of message.tool_calls ?? []) {
    content.push({ type: "tool_use", id: call.id, name: names.get(call.function.name) ?? call.function.name, input: toolInput(call.function.arguments) });
  }
  if (content.length === 0) return null;
  const usage = parsed.data.usage;
  const cached = usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const toolUse = content.some((c) => c.type === "tool_use");
  return {
    id: `msg_${randomUUID()}`, type: "message", role: "assistant", model, content,
    stop_reason: toolUse ? "tool_use" : finish_reason === "length" ? "max_tokens" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: Math.max(0, (usage?.prompt_tokens ?? 0) - cached), output_tokens: usage?.completion_tokens ?? 0, cache_read_input_tokens: cached },
  };
}
