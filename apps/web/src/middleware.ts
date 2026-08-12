import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function middleware(req: NextRequest) {
  if (!SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin");
    if (origin) {
      const host = req.headers.get("host") ?? "";
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
      if (originHost !== host) {
        return NextResponse.json({ error: "forbidden" }, { status: 403 });
      }
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
