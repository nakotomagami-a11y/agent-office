import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const LOOPBACK_HOST = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i;

const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });
const hostNotAllowed = () => NextResponse.json({ error: "host_not_allowed" }, { status: 403 });

export function proxy(req: NextRequest) {
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
  return NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
