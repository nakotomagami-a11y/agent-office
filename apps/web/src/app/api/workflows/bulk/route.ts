import { NextResponse } from "next/server";
import { store } from "@agent-office/domain/services";
import { validateBody } from "@/lib/validation";
import { workflowsBulkSchema } from "@/lib/validation-schemas";

export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(workflowsBulkSchema, raw);
  if (error) return error;
  const inserted = store.bulkInsertWorkflows(data.workflows);
  return NextResponse.json({ inserted });
}
