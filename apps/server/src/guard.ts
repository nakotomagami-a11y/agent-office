// The server's only origin check, applied to every request by `handle()` and, in
// the desktop app, to every page too by apps/web's proxy.ts. No imports on purpose:
// the web proxy loads this file, and it must not drag the domain in with it.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

const forbidden = () => Response.json({ error: "forbidden" }, { status: 403 });
const hostNotAllowed = () => Response.json({ error: "host_not_allowed" }, { status: 403 });

/** A 403 for a request that must not reach a handler, or null to let it through. */
export function guard(req: Request): Response | null {
  const host = req.headers.get("host");
  if (!host || !LOOPBACK_HOST.test(host)) return hostNotAllowed();

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
