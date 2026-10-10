// ALL /api/* — the whole API lives in @agent-office/server (apps/server); this
// route mounts it inside the Next process so the desktop app stays one server.
import { handle } from "@agent-office/server";

export const dynamic = "force-dynamic";

export { handle as GET, handle as HEAD, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS };
