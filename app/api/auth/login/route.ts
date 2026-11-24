import { database } from "@/lib/db";
import { loginSchema, fieldErrors } from "@/lib/validation";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/password";
import { createSession, cookieOptions } from "@/lib/session";
import { COOKIE_NAME, SESSION_SECONDS } from "@/lib/jwt";
import { handleError, json, readJson } from "@/lib/http";
import { limitAuth } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const result = loginSchema.safeParse(await readJson(request));
    if (!result.success) return json({ error: "Please check the highlighted fields.", fields: fieldErrors(result.error) }, 400);
    const { email, password } = result.data;
    await limitAuth(email, "login");
    const db = await database();
    const { rows } = await db.execute({ sql: "SELECT id, password_hash FROM users WHERE email = ?", args: [email] });
    const user = rows[0];
    const valid = await verifyPassword(password, user ? String(user.password_hash) : DUMMY_PASSWORD_HASH);
    if (!user || !valid) return json({ error: "Email or password is incorrect." }, 401);
    const { token } = await createSession(String(user.id));
    const response = json({ ok: true });
    response.cookies.set(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
    return response;
  } catch (error) { return handleError(error); }
}
