// Anthropic Messages → OpenAI Chat Completions. Thinking, cache hints, metadata and the CLI's beta
// fields have no Chat Completions meaning and are dropped; signed thinking from a resumed Claude
// session must never reach another backend.
import {
  isImage, isText, isToolResult, isToolUse, type AnthropicBlock, type AnthropicRequest, type ToolResultPart,
} from "./anthropic-request";
import { toolAliases } from "./tool-names";

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

/** Null for a turn that was thinking only (a resumed Claude session): Chat Completions rejects an empty one. */
function assistantMessage(blocks: AnthropicBlock[], alias: (name: string) => string): ChatMessage | null {
  const text = textOf(blocks);
  const calls: ChatToolCall[] = blocks.filter(isToolUse).map((b) => ({
    id: b.id, type: "function", function: { name: alias(b.name), arguments: JSON.stringify(b.input ?? {}) },
  }));
  if (!text && calls.length === 0) return null;
  return { role: "assistant", content: text || null, ...(calls.length > 0 ? { tool_calls: calls } : {}) };
}

const asParts = (c: ChatMessage["content"]): Part[] => (typeof c === "string" ? [{ type: "text", text: c }] : c ?? []);

/** Dropping a turn can leave two of one role in a row; merge them (tool replies stay one per call). */
function mergeAdjacent(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of messages) {
    const prev = out.at(-1);
    if (!prev || prev.role !== m.role || m.role === "tool") {
      out.push(m);
    } else if (m.role === "assistant") {
      const text = [prev.content, m.content].filter((c): c is string => typeof c === "string" && !!c).join("\n\n");
      const calls = [...(prev.tool_calls ?? []), ...(m.tool_calls ?? [])];
      out[out.length - 1] = { role: "assistant", content: text || null, ...(calls.length > 0 ? { tool_calls: calls } : {}) };
    } else {
      out[out.length - 1] = { role: m.role, content: [...asParts(prev.content), ...asParts(m.content)] };
    }
  }
  return out;
}

function toMessages(req: AnthropicRequest, alias: (name: string) => string): ChatMessage[] {
  const system = typeof req.system === "string" ? req.system : (req.system ?? []).map((s) => s.text ?? "").join("\n\n");
  const out: ChatMessage[] = system ? [{ role: "system", content: system }] : [];
  for (const m of req.messages) {
    if (typeof m.content === "string") out.push({ role: m.role, content: m.content });
    else if (m.role === "user") out.push(...userMessages(m.content));
    else if (m.role === "assistant") {
      const message = assistantMessage(m.content, alias);
      if (message) out.push(message);
    } else out.push({ role: "system", content: textOf(m.content) });
  }
  return mergeAdjacent(out);
}

function toolChoice(choice: AnthropicRequest["tool_choice"], alias: (name: string) => string): unknown {
  if (!choice) return undefined;
  if (choice.type === "any") return "required";
  if (choice.type === "tool" && choice.name) return { type: "function", function: { name: alias(choice.name) } };
  return choice.type === "none" ? "none" : "auto";
}

export interface ChatOptions {
  provider: "openai" | "local";
  /** The model's own ceiling, once the upstream named it. */
  maxTokens?: number;
}

/**
 * `model` is the provider's own id, already checked against the tier map. OpenAI reasoning models
 * reject a non-default temperature, and older local servers reject `stream_options`, so neither
 * is sent where it can break a request.
 */
export function toChatRequest(req: AnthropicRequest, model: string, capParam: CapParam, opts: ChatOptions): Record<string, unknown> {
  const aliases = toolAliases(req);
  const alias = (name: string): string => aliases.get(name) ?? name;
  const tools = (req.tools ?? []).filter((t) => t.input_schema).map((t) => ({
    type: "function", function: { name: alias(t.name), description: t.description ?? "", parameters: t.input_schema },
  }));
  return {
    model,
    messages: toMessages(req, alias),
    [capParam]: Math.min(req.max_tokens, opts.maxTokens ?? OUTPUT_TOKEN_CAP),
    ...(tools.length > 0 ? { tools, tool_choice: toolChoice(req.tool_choice, alias) } : {}),
    ...(opts.provider === "local" && req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(opts.provider === "local" && req.top_p !== undefined ? { top_p: req.top_p } : {}),
    ...(req.stop_sequences?.length ? { stop: req.stop_sequences } : {}),
    ...(req.stream ? { stream: true, ...(opts.provider === "openai" ? { stream_options: { include_usage: true } } : {}) } : {}),
  };
}
