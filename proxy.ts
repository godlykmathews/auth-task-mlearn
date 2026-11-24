import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifySessionToken } from "./lib/jwt";

// Next.js 16 renamed middleware.ts to proxy.ts. The dashboard also verifies
// the session against the database, so a revoked JWT cannot access its data.
export async function proxy(request: NextRequest) {
  const payload = await verifySessionToken(request.cookies.get(COOKIE_NAME)?.value);
  if (!payload) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/dashboard/:path*"] };
