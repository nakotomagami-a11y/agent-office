// Anthropic Messages → OpenAI Chat Completions. Thinking, cache hints, metadata and the CLI's beta
// fields have no Chat Completions meaning and are dropped; signed thinking from a resumed Claude
// session must never reach another backend.
import {
  isImage, isText, isToolResult, isToolUse, type AnthropicBlock, type AnthropicRequest, type ToolResultPart,
} from "./anthropic-request";

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export interface ChatToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | Part[] | null;
  tool_calls?: ChatToolCall[];
  tool_call_id?: string;
}
export type CapParam = "max_completion_tokens" | "max_tokens";

/** The CLI asks for up to 128k output tokens; no Chat Completions model takes that. */
export const OUTPUT_TOKEN_CAP = 32_000;

function imagePart(b: ToolResultPart | AnthropicBlock): Part | null {
  if (!isImage(b)) return null;
  const { source } = b;
  if (source.type === "base64" && source.data) return { type: "image_url", image_url: { url: `data:${source.media_type ?? "image/png"};base64,${source.data}` } };
  return source.url ? { type: "image_url", image_url: { url: source.url } } : null;
}

/** A tool result's images cannot ride in a `tool` message, so they follow as user content. */
const imagesOf = (parts: Array<AnthropicBlock | ToolResultPart>): Part[] =>
  parts.flatMap((p) => {
    const image = imagePart(p);
    return image ? [image] : [];
  });

const textOf = (parts: Array<AnthropicBlock | ToolResultPart>): string =>
  parts.flatMap((b) => (isText(b) ? [b.text] : [])).join("\n\n");

function userMessages(blocks: AnthropicBlock[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const parts: Part[] = [];
  for (const b of blocks) {
    if (isToolResult(b)) {
      const content = typeof b.content === "string" ? b.content : textOf(b.content ?? []);
      out.push({ role: "tool", tool_call_id: b.tool_use_id, content: b.is_error ? `Error: ${content}` : content });
      parts.push(...imagesOf(typeof b.content === "string" ? [] : b.content ?? []));
    } else if (isText(b)) parts.push({ type: "text", text: b.text });
    else parts.push(...imagesOf([b]));
  }
  if (parts.length > 0) out.push({ role: "user", content: parts });
  return out;
}

function assistantMessage(blocks: AnthropicBlock[]): ChatMessage {
  const text = textOf(blocks);
  const calls: ChatToolCall[] = blocks.filter(isToolUse).map((b) => ({
    id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
  }));
  return { role: "assistant", content: text || null, ...(calls.length > 0 ? { tool_calls: calls } : {}) };
}

function toMessages(req: AnthropicRequest): ChatMessage[] {
  const system = typeof req.system === "string" ? req.system : (req.system ?? []).map((s) => s.text ?? "").join("\n\n");
  const out: ChatMessage[] = system ? [{ role: "system", content: system }] : [];
  for (const m of req.messages) {
    if (typeof m.content === "string") out.push({ role: m.role, content: m.content });
    else if (m.role === "user") out.push(...userMessages(m.content));
    else if (m.role === "assistant") out.push(assistantMessage(m.content));
    else out.push({ role: "system", content: textOf(m.content) });
  }
  return out;
}

function toolChoice(choice: AnthropicRequest["tool_choice"]): unknown {
  if (!choice) return undefined;
  if (choice.type === "any") return "required";
  if (choice.type === "tool" && choice.name) return { type: "function", function: { name: choice.name } };
  return choice.type === "none" ? "none" : "auto";
}

/** `model` is the provider's own id, already checked against the tier map. */
export function toChatRequest(req: AnthropicRequest, model: string, capParam: CapParam): Record<string, unknown> {
  const tools = (req.tools ?? []).filter((t) => t.input_schema).map((t) => ({
    type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema },
  }));
  return {
    model,
    messages: toMessages(req),
    [capParam]: Math.min(req.max_tokens, OUTPUT_TOKEN_CAP),
    ...(tools.length > 0 ? { tools, tool_choice: toolChoice(req.tool_choice) } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.top_p !== undefined ? { top_p: req.top_p } : {}),
    ...(req.stop_sequences?.length ? { stop: req.stop_sequences } : {}),
    ...(req.stream ? { stream: true, stream_options: { include_usage: true } } : {}),
  };
}
