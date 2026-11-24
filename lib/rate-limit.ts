import "server-only";
import { createHmac } from "node:crypto";
import { database } from "./db";
import { signingKey } from "./jwt";
import { HttpError } from "./http";

// Persisted account-based limit works across serverless instances. A platform/WAF
// IP limit should also be enabled for a public deployment (no untrusted proxy IPs).
export async function limitAuth(email: string, action: "login" | "signup") {
  const db = await database();
  const now = Math.floor(Date.now() / 1000);
  const key = createHmac("sha256", signingKey()).update(`${action}:${email}`).digest("hex");
  const { rows } = await db.execute({
    sql: `INSERT INTO auth_limits (key, count, resets_at) VALUES (?, 1, ?)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN auth_limits.resets_at <= ? THEN 1 ELSE auth_limits.count + 1 END,
        resets_at = CASE WHEN auth_limits.resets_at <= ? THEN excluded.resets_at ELSE auth_limits.resets_at END
      RETURNING count, resets_at`,
    args: [key, now + 900, now, now],
  });
  if (Number(rows[0].count) > 10) throw new HttpError(429, "Too many attempts. Please try again in 15 minutes.");
  await db.execute({ sql: "DELETE FROM auth_limits WHERE resets_at <= ?", args: [now] });
}
