import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { guard } from "@agent-office/server/guard";

export function proxy(req: NextRequest) {
  return guard(req) ?? NextResponse.next();
}

export const config = {
  matcher: "/:path*",
};
