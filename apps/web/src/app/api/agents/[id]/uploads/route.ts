import { NextResponse } from "next/server";
import { paths } from "@agent-office/domain/services";
import { handleUpload, listDirUploads, validateIdParam } from "@/lib/api-helpers";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return NextResponse.json(listDirUploads(paths.agentUploadsDir(id)));
}

export async function POST(request: Request, { params }: Params) {
  const { value: id, error } = validateIdParam((await params).id);
  if (error) return error;
  return handleUpload(request, paths.agentUploadsDir(id));
}
