// GET/PUT /api/agents/<id>/body — read or overwrite the agent's system-prompt body.
// PUT backs up the current body to a timestamped history file (max 10) and preserves
// the agent file's frontmatter.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { agents } from "@agent-office/domain/services";
import { AGENTS_DIR } from "@agent-office/domain/services/infra/paths";
import { writeFileAtomic } from "@agent-office/domain/services/infra/fs-atomic";
import { notFound, validateIdParam, readBoundedText } from "@/lib/api-helpers";

const BODY_MAX_BYTES = 1 * 1024 * 1024; // 1 MB

type Params = { params: Promise<{ id: string }> };

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
  if (current) agents.backupAgentBody(id, current.body);

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
