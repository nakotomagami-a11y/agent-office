"use client";

import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Map from Claude Code tool name to icon-set name. Anything unmapped falls
 * back to the generic wrench icon.
 */
const TOOL_ICONS: Record<string, IconName> = {
  Read: "folder",
  Write: "edit",
  Edit: "edit",
  Bash: "terminal-ao",
  WebFetch: "globe",
  WebSearch: "search",
  Agent: "list",
};

export function iconForTool(tool: string) {
  const name = (TOOL_ICONS[tool] ?? "wrench") as IconName;
  return <Icon name={name} size={12} />;
}
