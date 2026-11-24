import { getCurrentSession } from "@/lib/session";
import { handleError, json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const current = await getCurrentSession();
    if (!current) return json({ error: "Please log in to continue." }, 401);
    // Do not expose the session ID, signing token, or password hash.
    return json({ user: current.user, session: { createdAt: current.session.createdAt, expiresAt: current.session.expiresAt } });
  } catch (error) { return handleError(error); }
}
