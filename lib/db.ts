import "server-only";
import { createClient, type Client } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

let client: Client | undefined;
let ready: Promise<void> | undefined;

export async function database(): Promise<Client> {
  if (!client) {
    const url = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required. Run npm run setup.");
    if (process.env.VERCEL && url.startsWith("file:")) {
      throw new Error("Vercel requires a persistent remote libSQL database; local files are ephemeral.");
    }
    if (url.startsWith("file:")) mkdirSync(dirname(resolve(url.slice(5))), { recursive: true });
    client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined });
  }
  if (!ready) {
    ready = client.batch([
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL
      )`,
      "CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)",
      "CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)",
      `CREATE TABLE IF NOT EXISTS auth_limits (
        key TEXT PRIMARY KEY, count INTEGER NOT NULL, resets_at INTEGER NOT NULL
      )`,
    ], "write").then(() => undefined).catch((error) => { ready = undefined; throw error; });
  }
  await ready;
  return client;
}
