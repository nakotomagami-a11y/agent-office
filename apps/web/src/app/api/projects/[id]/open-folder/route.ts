import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { projects } from "@agent-office/domain/services";
import { validateIdParam, notFound } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const { value, error } = validateIdParam(id);
  if (error) return error;

  const project = projects.readProject(value);
  if (!project) return notFound("Project");

  const cwd = project.meta.cwd;
  if (!cwd) return NextResponse.json({ error: "No cwd" }, { status: 400 });

  const app = new URL(req.url).searchParams.get("app");
  if (app === "code") {
    spawn("code", [cwd], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [cwd], { detached: true, stdio: "ignore" }).unref();
  }

  return NextResponse.json({ ok: true });
}
