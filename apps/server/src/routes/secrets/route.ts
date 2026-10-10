// GET /api/secrets — list all secrets (read-path shape — no raw values).
// POST — create a secret.
import { secrets } from "@agent-office/domain/services";
import { validateBody } from "../../lib/validation";
import { secretCreateSchema } from "@agent-office/api-contract";

// List every secret (read-path shape — no raw value) with expiry + validity
// status and how many projects each is attached to.
export async function GET() {
  return Response.json(secrets.list());
}

// Create a secret. Returns the SecretWithStatus (value omitted).
export async function POST(request: Request) {
  const raw: unknown = await request.json();
  const { data, error } = validateBody(secretCreateSchema, raw);
  if (error) return error;
  try {
    const secret = secrets.create(data);
    return Response.json(secret, { status: 201 });
  } catch (err) {
    return Response.json({ error: String((err as Error).message) }, { status: 400 });
  }
}
