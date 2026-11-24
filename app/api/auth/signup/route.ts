import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import { signupSchema, fieldErrors } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { createSession, cookieOptions } from "@/lib/session";
import { COOKIE_NAME, SESSION_SECONDS } from "@/lib/jwt";
import { handleError, json, readJson } from "@/lib/http";
import { limitAuth } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const result = signupSchema.safeParse(await readJson(request));
    if (!result.success) return json({ error: "Please check the highlighted fields.", fields: fieldErrors(result.error) }, 400);
    const { name, email, password } = result.data;
    await limitAuth(email, "signup");
    const passwordHash = await hashPassword(password);
    const db = await database();
    const id = randomUUID();
    // Commit account and initial session together; failed signup leaves neither.
    // The UNIQUE constraint handles simultaneous registrations for the same email.
    const transaction = await db.transaction("write");
    let token: string;
    try {
      const inserted = await transaction.execute({
        sql: "INSERT INTO users (id, name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING RETURNING id",
        args: [id, name, email, passwordHash, Math.floor(Date.now() / 1000)],
      });
      if (!inserted.rows.length) {
        await transaction.rollback();
        return json({ error: "An account with this email already exists. Please log in.", fields: { email: "This email is already registered." } }, 409);
      }
      ({ token } = await createSession(id, transaction));
      await transaction.commit();
    } finally {
      transaction.close();
    }
    const response = json({ ok: true }, 201);
    response.cookies.set(COOKIE_NAME, token, { ...cookieOptions, maxAge: SESSION_SECONDS });
    return response;
  } catch (error) { return handleError(error); }
}
