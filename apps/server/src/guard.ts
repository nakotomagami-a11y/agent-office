// The server's only origin check, applied by `handle()` and, in the desktop app, to every page by apps/web's
// proxy.ts. Any web page can GET here without CORS, so /api takes only same-origin or typed-URL fetches.
// No imports on purpose: the web proxy loads this file, and it must not drag the domain in with it.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const API_FETCH_SITES = new Set(["same-origin", "none"]);

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

const forbidden = () => Response.json({ error: "forbidden" }, { status: 403 });

/** Read the way the router reads it: `//api` and `/%61pi` are /api too, and an undecodable path is treated as one. */
function isApiPath(pathname: string): boolean {
  const first = pathname.split("/").find(Boolean) ?? "";
  try {
    return decodeURIComponent(first).toLowerCase() === "api";
  } catch {
    return true;
  }
}
const hostNotAllowed = () => Response.json({ error: "host_not_allowed" }, { status: 403 });

/** A 403 for a request that must not reach a handler, or null to let it through. `api`: the caller serves only API. */
export function guard(req: Request, opts: { api?: boolean } = {}): Response | null {
  const host = req.headers.get("host");
  if (!host || !LOOPBACK_HOST.test(host)) return hostNotAllowed();

  const site = req.headers.get("sec-fetch-site");
  if (site && !API_FETCH_SITES.has(site) && (opts.api || isApiPath(new URL(req.url).pathname))) return forbidden();

  if (!SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return forbidden();
      }
      if (originHost !== host.toLowerCase()) return forbidden();
    }
  }
  return null;
}
