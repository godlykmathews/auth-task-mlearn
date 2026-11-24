import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/jwt";
import { cookieOptions, revokeSession } from "@/lib/session";
import { handleError, json, requireSameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await revokeSession((await cookies()).get(COOKIE_NAME)?.value);
    const response = json({ ok: true });
    response.cookies.set(COOKIE_NAME, "", { ...cookieOptions, maxAge: 0, expires: new Date(0) });
    return response;
  } catch (error) { return handleError(error); }
}
