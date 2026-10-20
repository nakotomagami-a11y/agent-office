// OpenAI accepts tool names of at most 64 characters from [A-Za-z0-9_-]; long MCP names
// (mcp__server__tool…) break that. Only offending names get an alias; every other name is sent
// byte-identical. The hash of the full name keeps two long names with one prefix apart.
import { createHash } from "node:crypto";
import { isToolUse, type AnthropicRequest } from "./anthropic-request";

const VALID = /^[A-Za-z0-9_-]{1,64}$/;

function aliasOf(name: string): string {
  const hash = createHash("sha256").update(name).digest("hex").slice(0, 16);
  return `${name.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 47)}_${hash}`;
}

/** original → alias, for every invalid name in the tools and in earlier assistant turns. */
export function toolAliases(req: AnthropicRequest): Map<string, string> {
  const used = req.messages.flatMap((m) => (typeof m.content === "string" ? [] : m.content.filter(isToolUse).map((b) => b.name)));
  const names = new Set([...(req.tools ?? []).map((t) => t.name), ...used]);
  return new Map([...names].filter((n) => !VALID.test(n)).map((n) => [n, aliasOf(n)]));
}

/** alias → original, for the names coming back. An unknown name passes through unchanged. */
export const reverseAliases = (aliases: Map<string, string>): Map<string, string> =>
  new Map([...aliases].map(([name, alias]) => [alias, name]));
