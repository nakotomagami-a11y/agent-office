// User analysis file — read/stat access for the "About You" Settings tab.
//
// The file itself is authored by the `user-analyst` agent (see
// ~/.claude/agents/user-analyst.md). This module only exposes the read side:
// current markdown + timestamp + word count. Writes happen out-of-band when
// the agent runs.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { APP_STATE_DIR } from "./paths";

export const USER_ANALYSIS_PATH = join(APP_STATE_DIR, "user_analysis.md");

export interface UserAnalysis {
  markdown: string | null;
  updatedAt: string | null;
  wordCount: number | null;
}

/**
 * Rough word count — splits on any whitespace after stripping code fences and
 * front-matter. Purely for UI ("~1,847 words · updated 3m ago"). Never used
 * for billing or truncation, so a fuzzy count is fine.
 */
function countWords(markdown: string): number {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^---\n[\s\S]*?\n---/m, " ");
  const tokens = stripped.trim().split(/\s+/).filter(Boolean);
  return tokens.length;
}

/**
 * Read the current analysis. Returns null-fields when the file does not exist
 * yet (first-run case — the UI shows an empty state and offers "Generate").
 */
export function readUserAnalysis(): UserAnalysis {
  if (!existsSync(USER_ANALYSIS_PATH)) {
    return { markdown: null, updatedAt: null, wordCount: null };
  }
  const markdown = readFileSync(USER_ANALYSIS_PATH, "utf8");
  const updatedAt = statSync(USER_ANALYSIS_PATH).mtime.toISOString();
  return { markdown, updatedAt, wordCount: countWords(markdown) };
}
