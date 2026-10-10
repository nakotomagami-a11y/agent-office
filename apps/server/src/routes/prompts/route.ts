// GET /api/prompts — recent prompts across all agents (composer history).
import { store } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(store.getAllRecentPrompts());
}
