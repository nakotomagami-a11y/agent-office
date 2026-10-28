// GET /api/account — the plan badge for the AI provider in force. A subscription's plan comes from
// `claude auth status` in the account dir; an unreadable one is `unknown`, never "free". Cached 5 min.
import { providers } from "@agent-office/domain/services";

export async function GET() {
  return Response.json(await providers.accountPlan());
}
