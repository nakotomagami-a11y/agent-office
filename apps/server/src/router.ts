// Path matching for the route table. Handlers keep Next's route-handler signature
// `(request, { params: Promise<...> })`, so a route file reads the same whether
// Next or the standalone server calls it.

export type Params = Record<string, string>;

export interface RouteContext {
  params: Promise<Params>;
}

export const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
export const isHttpMethod = (v: unknown): v is HttpMethod =>
  typeof v === "string" && (HTTP_METHODS as readonly string[]).includes(v);

// Method syntax on purpose: it keeps parameters bivariant, so a handler typed
// `{ params: Promise<{ id: string }> }` fits without a cast.
export interface RouteModule {
  GET?(request: Request, ctx: RouteContext): Response | Promise<Response>;
  HEAD?(request: Request, ctx: RouteContext): Response | Promise<Response>;
  POST?(request: Request, ctx: RouteContext): Response | Promise<Response>;
  PUT?(request: Request, ctx: RouteContext): Response | Promise<Response>;
  PATCH?(request: Request, ctx: RouteContext): Response | Promise<Response>;
  DELETE?(request: Request, ctx: RouteContext): Response | Promise<Response>;
  OPTIONS?(request: Request, ctx: RouteContext): Response | Promise<Response>;
}

export interface RouteEntry {
  /** `/api/agents/[id]` — the folder path the route file lives in. */
  path: string;
  module: RouteModule;
}

interface Compiled {
  entry: RouteEntry;
  segments: { name: string; dynamic: boolean }[];
}

export interface RouteMatch {
  entry: RouteEntry;
  params: Params;
}

function compile(entry: RouteEntry): Compiled {
  const segments = entry.path.split("/").filter(Boolean).map((s) => {
    const dynamic = s.startsWith("[") && s.endsWith("]");
    return { name: dynamic ? s.slice(1, -1) : s, dynamic };
  });
  return { entry, segments };
}

/** Static beats dynamic at the first segment where two routes differ, as in Next.
 *  Length first: only same-length routes compete, and without it the comparator is
 *  not a total order, so the result depended on the table's order. */
function bySpecificity(a: Compiled, b: Compiled): number {
  if (a.segments.length !== b.segments.length) return a.segments.length - b.segments.length;
  for (let i = 0; i < a.segments.length; i++) {
    const d = Number(a.segments[i]!.dynamic) - Number(b.segments[i]!.dynamic);
    if (d !== 0) return d;
  }
  return 0;
}

export function createRouter(routes: readonly RouteEntry[]): (pathname: string) => RouteMatch | null {
  const compiled = routes.map(compile).sort(bySpecificity);
  return (pathname) => {
    let parts: string[];
    try {
      parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return null;
    }
    for (const { entry, segments } of compiled) {
      if (segments.length !== parts.length) continue;
      const params: Params = {};
      const hit = segments.every((seg, i) => {
        if (seg.dynamic) params[seg.name] = parts[i]!;
        return seg.dynamic || seg.name === parts[i];
      });
      if (hit) return { entry, params };
    }
    return null;
  };
}

export function allowedMethods(module: RouteModule): HttpMethod[] {
  const allowed = HTTP_METHODS.filter((m) => module[m]);
  if (module.GET && !module.HEAD) allowed.push("HEAD");
  if (!module.OPTIONS) allowed.push("OPTIONS");
  return allowed;
}
