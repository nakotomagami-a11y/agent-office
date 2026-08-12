import { NextResponse } from "next/server";
import { skills } from "@agent-office/domain/services";
import { notFound, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ name: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: name, error } = validateIdParam((await params).name);
  if (error) return error;
  const skill = skills.readInstalledSkill(name);
  if (!skill) return notFound();
  return NextResponse.json(skill);
}

export async function DELETE(_request: Request, { params }: Params) {
  const { value: name, error } = validateIdParam((await params).name);
  if (error) return error;
  return NextResponse.json({ removed: skills.uninstallSkill(name) });
}
