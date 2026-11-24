import "server-only";
import { randomUUID } from "node:crypto";
import type { Transaction } from "@libsql/client";
import { cookies } from "next/headers";
import { database } from "./db";
import { COOKIE_NAME, SESSION_SECONDS, signSession, verifySessionToken } from "./jwt";

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function createSession(userId: string, transaction?: Transaction) {
  const db = await database();
  const id = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + SESSION_SECONDS;
  const token = await signSession(userId, id, expiresAt);
  const insert = { sql: "INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", args: [id, userId, now, expiresAt] };
  if (transaction) {
    await transaction.execute(insert);
  } else {
    await db.batch([
      { sql: "DELETE FROM sessions WHERE expires_at <= ?", args: [now] },
      insert,
    ], "write");
  }
  return { token, expiresAt };
}

export async function getCurrentSession() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  const payload = await verifySessionToken(token);
  if (!payload) return null;
  const db = await database();
  const { rows } = await db.execute({
    sql: `SELECT users.id, users.name, users.email, users.created_at AS joined_at,
      sessions.id AS session_id, sessions.created_at, sessions.expires_at
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ? AND sessions.user_id = ? AND sessions.expires_at > ?`,
    args: [payload.sessionId, payload.userId, Math.floor(Date.now() / 1000)],
  });
  const row = rows[0];
  if (!row) return null;
  const iso = (value: unknown) => new Date(Number(value) * 1000).toISOString();
  return {
    user: { id: String(row.id), name: String(row.name), email: String(row.email), createdAt: iso(row.joined_at) },
    session: { id: String(row.session_id), createdAt: iso(row.created_at), expiresAt: iso(row.expires_at) },
  };
}

export async function revokeSession(token?: string) {
  const payload = await verifySessionToken(token);
  if (payload) {
    const db = await database();
    await db.execute({ sql: "DELETE FROM sessions WHERE id = ? AND user_id = ?", args: [payload.sessionId, payload.userId] });
  }
}
