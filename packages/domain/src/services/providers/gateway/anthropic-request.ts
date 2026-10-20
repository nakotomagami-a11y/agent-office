// The Anthropic Messages request the claude CLI sends, parsed (never cast). Unknown block types
// (thinking, redacted_thinking, server tools) parse as `other` and are dropped by the translator.
import { z } from "zod";

const textBlock = z.object({ type: z.literal("text"), text: z.string() });
const imageBlock = z.object({
  type: z.literal("image"),
  source: z.object({ type: z.string(), media_type: z.string().optional(), data: z.string().optional(), url: z.string().optional() }),
});
const otherBlock = z.object({ type: z.string() }).passthrough();
const toolResultPart = z.union([textBlock, imageBlock, otherBlock]);
const toolUseBlock = z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() });
const toolResultBlock = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  content: z.union([z.string(), z.array(toolResultPart)]).optional(),
  is_error: z.boolean().optional(),
});
const block = z.union([textBlock, imageBlock, toolUseBlock, toolResultBlock, otherBlock]);

export const anthropicRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(z.object({ role: z.enum(["user", "assistant", "system"]), content: z.union([z.string(), z.array(block)]) })),
  system: z.union([z.string(), z.array(z.object({ type: z.string(), text: z.string().optional() }))]).optional(),
  tools: z.array(z.object({ name: z.string(), description: z.string().optional(), input_schema: z.record(z.unknown()).optional() })).optional(),
  tool_choice: z.object({ type: z.string(), name: z.string().optional() }).optional(),
  max_tokens: z.number().int().positive(),
  stream: z.boolean().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  stop_sequences: z.array(z.string()).optional(),
});

export type AnthropicRequest = z.infer<typeof anthropicRequestSchema>;
export type AnthropicBlock = z.infer<typeof block>;
export type ToolResultPart = z.infer<typeof toolResultPart>;

export const isText = (b: AnthropicBlock | ToolResultPart): b is z.infer<typeof textBlock> => b.type === "text" && "text" in b;
export const isImage = (b: AnthropicBlock | ToolResultPart): b is z.infer<typeof imageBlock> => b.type === "image" && "source" in b;
export const isToolUse = (b: AnthropicBlock): b is z.infer<typeof toolUseBlock> => b.type === "tool_use" && "id" in b;
export const isToolResult = (b: AnthropicBlock): b is z.infer<typeof toolResultBlock> => b.type === "tool_result" && "tool_use_id" in b;
