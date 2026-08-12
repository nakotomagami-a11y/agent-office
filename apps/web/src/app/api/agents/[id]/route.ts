import { existsSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { agents } from "@agent-office/domain/services";
import { AGENTS_DIR } from "@agent-office/domain/services/paths";
import { writeFileAtomic } from "@agent-office/domain/services/fs-atomic";
import { validateBody } from "@/lib/validation";
import { agentBodySchema } from "@/lib/validation-schemas";
import { notFound, tryService, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

const MAX_BODY_HISTORY = 10;

function listBodyHistoryFiles(id: string): string[] {
  if (!existsSync(AGENTS_DIR)) return [];
  const prefix = `${id}.body.`;
  return readdirSync(AGENTS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".md"))
    .sort();
}

function backupAgentBody(id: string, bodyText: string): void {
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = join(AGENTS_DIR, `${id}.body.${ts}.md`);
    writeFileAtomic(backupPath, bodyText);
    // Prune oldest if over cap
    const files = listBodyHistoryFiles(id);
    const excess = files.length - MAX_BODY_HISTORY;
    for (let i = 0; i < excess; i++) {
      try { unlinkSync(join(AGENTS_DIR, files[i]!)); } catch { /* best-effort */ }
    }
  } catch {
    // Backup failure must never block the save
  }
}

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const agent = agents.readAgent(id);
  if (!agent) return notFound();
  return NextResponse.json(agent.info);
}

export async function PUT(request: Request, { params }: Params) {
  const { value: id, error: paramError } = validateIdParam((await params).id);
  if (paramError) return paramError;
  const raw: unknown = await request.json();
  const { data: body, error } = validateBody(agentBodySchema, raw);
  if (error) return error;

  // Back up current body text before overwriting
  const current = agents.readAgent(id);
  if (current?.body) {
    backupAgentBody(id, current.body);
  }

  return tryService(() => ({ id: agents.writeAgent({ ...body, id }) }));
}

export async function DELETE(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  const ok = agents.deleteAgent(id);
  return ok ? NextResponse.json({ deleted: id }) : notFound();
}
