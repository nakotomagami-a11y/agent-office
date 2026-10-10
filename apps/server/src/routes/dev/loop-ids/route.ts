// Dev-only: ids of recorded loops, for the /dev/loop harness.
import { db } from "@agent-office/domain/services";
import { forbidInProd } from "../../../lib/api-helpers";

export function GET() {
  const gate = forbidInProd();
  if (gate) return gate;
  return Response.json(db.listAllLoopIds());
}
