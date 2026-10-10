// The Agent Office HTTP API as one web-standard handler: Request in, Response out.
// apps/web mounts it under /api; main.ts serves it on its own.
import { log } from "@agent-office/domain/services/infra/log";
import { guard } from "./guard";
import { ROUTES } from "./route-table";
import { allowedMethods, createRouter, isHttpMethod, type RouteEntry } from "./router";

export function createHandler(routes: readonly RouteEntry[]): (request: Request) => Promise<Response> {
  const match = createRouter(routes);
  return async (request) => {
    const denied = guard(request);
    if (denied) return denied;

    const found = match(new URL(request.url).pathname);
    if (!found) return Response.json({ error: "not_found" }, { status: 404 });

    const { module } = found.entry;
    const method = request.method.toUpperCase();
    const handler = isHttpMethod(method)
      ? module[method] ?? (method === "HEAD" ? module.GET : undefined)
      : undefined;
    const allow = allowedMethods(module).join(", ");

    if (!handler) {
      if (method === "OPTIONS") return new Response(null, { status: 204, headers: { Allow: allow } });
      return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: allow } });
    }

    try {
      return await handler.call(module, request, { params: Promise.resolve(found.params) });
    } catch (err) {
      log.error("server.unhandled", { method, route: found.entry.path, err: err instanceof Error ? err.stack ?? err.message : String(err) });
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
  };
}

export const handle = createHandler(ROUTES);
