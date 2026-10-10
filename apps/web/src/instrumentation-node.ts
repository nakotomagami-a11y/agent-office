/**
 * Node-only side of the instrumentation hook: boots the embedded Agent Office
 * server (`@agent-office/server`). Imported dynamically from instrumentation.ts
 * under the nodejs runtime guard, so the edge bundle never compiles it.
 *
 * The import is static so a malformed env (validated when boot.ts loads) still
 * stops Next from starting, and boot() seeds starter skills synchronously before
 * its first await, i.e. before the first request. The rest is fire-and-forget:
 * Next's build-time hook invocation never resolves a top-level `await`, so
 * `next build` would hang. `next build` runs this hook too, and a build is not
 * a server: no discovery entry, no loops.
 */
import { boot } from "@agent-office/server/boot";

void boot({ serve: process.env.NEXT_PHASE !== "phase-production-build" }).catch((err: unknown) =>
  console.warn("[server] boot failed:", err),
);
