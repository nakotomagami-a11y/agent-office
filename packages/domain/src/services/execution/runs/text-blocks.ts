/**
 * A run's saved output, kept in paragraphs where the live views split it. The CLI's text blocks carry
 * no separator, so a turn saved as their plain concatenation read as one run-on paragraph ("…exist in
 * the conventions?The 400-line ceiling…"). Only a tool call splits: a text block that just continues
 * the previous one (the CLI's continuation past the output-token limit) can start mid-word or mid-table.
 */
export interface SavedOutput {
  output: string;
  toolSinceText: boolean;
}

export function noteToolCall(run: SavedOutput): void {
  run.toolSinceText = true;
}

/** A text block starts: after a tool call it is a new paragraph. */
export function startTextBlock(run: SavedOutput): void {
  if (run.toolSinceText) run.output += textBlockSeparator(run.output);
  run.toolSinceText = false;
}

export function textBlockSeparator(output: string): string {
  if (output === "" || output.endsWith("\n\n")) return "";
  return output.endsWith("\n") ? "\n" : "\n\n";
}

/** A sub-agent's (Task) text streams through the same pipe, tagged with the tool call that spawned
 *  it. It is not the agent's own reply: saved into the output it would be posted as the agent's
 *  mission outbox (missions/posting.ts), and shown as the agent speaking. */
export function isOwnText(evt: { parent_tool_use_id?: string | null }): boolean {
  return !(typeof evt.parent_tool_use_id === "string" && evt.parent_tool_use_id !== "");
}
