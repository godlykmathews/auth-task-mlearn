import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { hashPassword, verifyPassword } from "../lib/password";
import { signSession, verifySessionToken } from "../lib/jwt";
import { loginSchema, signupSchema } from "../lib/validation";

process.env.JWT_SECRET = randomBytes(48).toString("base64url");

test("signup normalizes identity but preserves password whitespace", () => {
  const result = signupSchema.parse({ name: "  Alice  ", email: " ALICE@example.com ", password: " password ", confirmPassword: " password " });
  assert.equal(result.name, "Alice");
  assert.equal(result.email, "alice@example.com");
  assert.equal(result.password, " password ");
});

test("rejects missing fields, malformed emails, short/long passwords and mismatches", () => {
  for (const value of [{}, { email: "bad", password: "12345678" }, { email: "a@b.com", password: "short" }, { email: "a@b.com", password: "x".repeat(129) }]) {
    assert.equal(loginSchema.safeParse(value).success, false);
  }
  assert.equal(signupSchema.safeParse({ name: "A", email: "a@b.com", password: "password", confirmPassword: "different" }).success, false);
});

test("password hashes use unique salts and reject incorrect passwords", async () => {
  const first = await hashPassword("correct horse battery staple");
  const second = await hashPassword("correct horse battery staple");
  assert.notEqual(first, second);
  assert.ok(await verifyPassword("correct horse battery staple", first));
  assert.equal(await verifyPassword("wrong password", first), false);
  assert.equal(await verifyPassword("anything", "invalid"), false);
});

test("JWT verifies identity, rejects tampering, expiry and wrong audience", async () => {
  const token = await signSession("user-1", "session-1", Math.floor(Date.now() / 1000) + 60);
  assert.deepEqual(await verifySessionToken(token), { userId: "user-1", sessionId: "session-1" });
  const parts = token.split(".");
  parts[1] = Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url");
  assert.equal(await verifySessionToken(parts.join(".")), null);
  const expired = await signSession("user-1", "session-1", Math.floor(Date.now() / 1000) - 1);
  assert.equal(await verifySessionToken(expired), null);
  const wrongAudience = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("user-1").setJti("session-1")
    .setIssuedAt().setExpirationTime("1h").setIssuer("harbor-auth").setAudience("wrong-app")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));
  assert.equal(await verifySessionToken(wrongAudience), null);
  assert.equal(await verifySessionToken(), null);
});
