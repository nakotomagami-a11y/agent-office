import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { agents } from "@agent-office/domain/services";
import { AGENTS_DIR } from "@agent-office/domain/services/paths";
import { writeFileAtomic } from "@agent-office/domain/services/fs-atomic";
import { notFound, validateIdParam, readBoundedText } from "@/lib/api-helpers";

const BODY_MAX_BYTES = 1 * 1024 * 1024; // 1 MB

type Params = { params: Promise<{ id: string }> };

const MAX_HISTORY = 10;

/** List all history files for an agent, sorted oldest-first. */
function listHistoryFiles(id: string): string[] {
  if (!existsSync(AGENTS_DIR)) return [];
  // Pattern: <id>.body.<ISO>.md
  const prefix = `${id}.body.`;
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .sort(); // ISO timestamps sort lexicographically
}

/** Prune oldest history files beyond MAX_HISTORY. */
function pruneHistory(id: string): void {
  const files = listHistoryFiles(id);
  const excess = files.length - MAX_HISTORY;
  for (let i = 0; i < excess; i++) {
    try {
      unlinkSync(join(AGENTS_DIR, files[i]!));
    } catch {
      // best-effort
    }
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const agent = agents.readAgent(id);
  if (!agent) return notFound();
  return new Response(agent.body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function PUT(request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;

  const { text: newBody, error: bodyErr } = await readBoundedText(request, BODY_MAX_BYTES);
  if (bodyErr) return bodyErr;

  // Back up the current body before overwriting
  const current = agents.readAgent(id);
  if (current) {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFilename = `${id}.body.${ts}.md`;
    const backupPath = join(AGENTS_DIR, backupFilename);
    try {
      writeFileAtomic(backupPath, current.body);
      pruneHistory(id);
    } catch {
      // Backup failure must not block the save
    }
  }

  // Write the new body content directly to the agent file's body section.
  // Re-read the full file so we preserve frontmatter.
  const agentPath = join(AGENTS_DIR, `${id}.md`);
  if (!existsSync(agentPath)) return notFound();

  const existing = readFileSync(agentPath, "utf8");
  const fmMatch = existing.match(/^(---\n[\s\S]*?\n---\n?)/);
  const frontmatter = fmMatch ? fmMatch[1] : "";
  const newContent = frontmatter ? `${frontmatter}\n${newBody}\n` : `${newBody}\n`;
  writeFileAtomic(agentPath, newContent);

  return new Response(null, { status: 204 });
}
