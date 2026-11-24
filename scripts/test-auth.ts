import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { SignJWT } from "jose";

// Run against a local server with the same environment/database as this process.
// The unique addresses make cleanup safe even when using the development DB.
const base = new URL(process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("Integration tests only run against a local server.");
}
if (!process.env.DATABASE_URL?.startsWith("file:")) {
  throw new Error("Integration tests require a local file: DATABASE_URL, including the atomic-signup failure test.");
}
const origin = base.origin;
const suffix = randomBytes(8).toString("hex");
const email = `auth-flow-${suffix}@example.test`;
const missingEmail = `auth-missing-${suffix}@example.test`;
const rateEmail = `auth-rate-${suffix}@example.test`;
const atomicEmail = `auth-atomic-${suffix}@example.test`;
const password = `Authent-${randomBytes(20).toString("base64url")}`;
const credentials = { name: "Test Authent", email, password, confirmPassword: password };
let passed = 0;

async function request(path: string, options: RequestInit = {}) {
  return fetch(new URL(path, origin), { ...options, redirect: "manual" });
}

async function post(path: string, body: unknown, cookie?: string) {
  return request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sessionCookie(response: Response) {
  const header = response.headers.getSetCookie().find((value) => value.startsWith("harbor_session="));
  assert.ok(header, "A successful sign-in must set the session cookie");
  assert.match(header, /;\s*HttpOnly/i);
  assert.match(header, /;\s*SameSite=Lax/i);
  assert.match(header, /;\s*Path=\//i);
  if (process.env.TEST_EXPECT_SECURE === "true") assert.match(header, /;\s*Secure/i);
  return header.split(";", 1)[0];
}

async function check(name: string, test: () => Promise<void>) {
  await test();
  passed += 1;
  console.log(`PASS ${name}`);
}

function redirectsToLogin(response: Response) {
  assert.ok([302, 303, 307, 308].includes(response.status), `Expected redirect, received ${response.status}`);
  const destination = response.headers.get("location");
  assert.ok(destination);
  assert.equal(new URL(destination, origin).pathname, "/login");
}

async function cleanup() {
  if (!process.env.DATABASE_URL) return;
  const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
  try {
    // Explicit deletes also work when a client has foreign-key checks disabled.
    for (const address of [email, atomicEmail]) {
      await db.execute({
        sql: "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)",
        args: [address],
      });
      await db.execute({ sql: "DELETE FROM users WHERE email = ?", args: [address] });
    }
    if (process.env.JWT_SECRET) {
      for (const address of [email, missingEmail, rateEmail, atomicEmail]) {
        for (const action of ["login", "signup"]) {
          const key = createHmac("sha256", process.env.JWT_SECRET).update(`${action}:${address}`).digest("hex");
          await db.execute({ sql: "DELETE FROM auth_limits WHERE key = ?", args: [key] });
        }
      }
    }
  } finally {
    db.close();
  }
}

async function main() {
  let cookie = "";
  await check("logged-out dashboard redirects to login", async () => {
    redirectsToLogin(await request("/dashboard"));
  });
  await check("logged-out session API returns 401", async () => {
    assert.equal((await request("/api/auth/session")).status, 401);
  });
  await check("signup validates required fields and email/password", async () => {
    for (const body of [{}, { ...credentials, email: "invalid", password: "short", confirmPassword: "short" }]) {
      const response = await post("/api/auth/signup", body);
      assert.equal(response.status, 400);
      const result = await response.json();
      assert.ok(result.error);
      assert.ok(result.fields && Object.keys(result.fields).length);
    }
  });
  await check("signup rejects mismatched passwords", async () => {
    const response = await post("/api/auth/signup", { ...credentials, confirmPassword: "different-password" });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields?.confirmPassword);
  });
  await check("login validates required fields", async () => {
    const response = await post("/api/auth/login", {});
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields);
  });
  await check("cross-origin requests are rejected", async () => {
    const response = await request("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.example" },
      body: JSON.stringify(credentials),
    });
    assert.equal(response.status, 403);
  });
  await check("requests without Origin are rejected", async () => {
    const response = await request("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials),
    });
    assert.equal(response.status, 403);
  });
  await check("unsupported content types are rejected", async () => {
    const response = await request("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "text/plain", Origin: origin }, body: JSON.stringify(credentials),
    });
    assert.equal(response.status, 415);
  });
  await check("malformed JSON returns a clear client error", async () => {
    const response = await request("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: "{bad-json",
    });
    assert.equal(response.status, 400);
  });
  await check("oversized request bodies are rejected", async () => {
    const response = await post("/api/auth/signup", { ...credentials, name: "x".repeat(100_000) });
    assert.equal(response.status, 413);
  });
  await check("signup creates an account and a protected session cookie", async () => {
    const response = await post("/api/auth/signup", { ...credentials, email: email.toUpperCase() });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).ok, true);
    cookie = sessionCookie(response);
    assert.equal(cookie.slice("harbor_session=".length).split(".").length, 3, "Session must contain a signed JWT");
  });
  await check("authenticated session returns the saved profile without password data", async () => {
    const response = await request("/api/auth/session", { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    const result = await response.json();
    assert.equal(result.user.email, email);
    assert.equal(result.user.name, credentials.name);
    assert.ok(Date.parse(result.user.createdAt));
    assert.ok(Date.parse(result.session.expiresAt) > Date.now());
    assert.doesNotMatch(JSON.stringify(result), /password|password_hash|passwordHash/i);
  });
  await check("authenticated dashboard is accessible", async () => {
    const response = await request("/dashboard", { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(email));
  });
  await check("failed session creation rolls back the entire signup", async () => {
    const db = createClient({ url: process.env.DATABASE_URL! });
    // This test-only trigger targets one generated address. Both interpolated
    // values contain only our fixed prefix and a random hexadecimal suffix.
    const trigger = `test_session_failure_${suffix}`;
    try {
      await db.execute(`CREATE TRIGGER ${trigger} BEFORE INSERT ON sessions
        WHEN (SELECT email FROM users WHERE id = NEW.user_id) = '${atomicEmail}'
        BEGIN SELECT RAISE(ABORT, 'test session insertion failure'); END`);
      const response = await post("/api/auth/signup", { ...credentials, email: atomicEmail });
      assert.equal(response.status, 500);
      assert.ok(!(response.headers.get("set-cookie") ?? "").includes("harbor_session="), "Failed signup must not issue a session cookie");
      const result = await db.execute({ sql: "SELECT id FROM users WHERE email = ?", args: [atomicEmail] });
      assert.equal(result.rows.length, 0, "Failed session creation must not leave an account committed");
    } finally {
      try { await db.execute(`DROP TRIGGER IF EXISTS ${trigger}`); }
      finally { db.close(); }
    }
  });
  await check("duplicate signup does not create a second account", async () => {
    const response = await post("/api/auth/signup", credentials);
    assert.equal(response.status, 409);
    assert.ok((await response.json()).error);
  });
  await check("wrong passwords and unknown accounts return the same generic error", async () => {
    const wrong = await post("/api/auth/login", { email, password: "wrong-password" });
    const missing = await post("/api/auth/login", { email: missingEmail, password: "wrong-password" });
    assert.equal(wrong.status, 401);
    assert.equal(missing.status, 401);
    assert.equal((await wrong.json()).error, (await missing.json()).error);
  });
  await check("tampered JWTs cannot access the API or dashboard", async () => {
    const [name, token] = cookie.split("=");
    const parts = token.split(".");
    parts[2] = `${parts[2][0] === "a" ? "b" : "a"}${parts[2].slice(1)}`;
    const forged = `${name}=${parts.join(".")}`;
    assert.equal((await request("/api/auth/session", { headers: { Cookie: forged } })).status, 401);
    redirectsToLogin(await request("/dashboard", { headers: { Cookie: forged } }));
  });
  if (process.env.JWT_SECRET) {
    await check("expired JWTs cannot access the API or dashboard", async () => {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: "HS256" })
        .setIssuer("harbor-auth").setAudience("harbor-web")
        .setSubject("expired-test").setJti("expired-session")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 120)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
        .sign(new TextEncoder().encode(process.env.JWT_SECRET));
      const expired = `harbor_session=${token}`;
      assert.equal((await request("/api/auth/session", { headers: { Cookie: expired } })).status, 401);
      redirectsToLogin(await request("/dashboard", { headers: { Cookie: expired } }));
    });
  } else {
    console.log("SKIP expired JWT signature test: JWT_SECRET is not set in the test process.");
  }
  await check("logout clears the cookie and invalidates a copied JWT", async () => {
    const response = await post("/api/auth/logout", {}, cookie);
    assert.equal(response.status, 200);
    const cleared = response.headers.getSetCookie().find((value) => value.startsWith("harbor_session="));
    assert.ok(cleared);
    assert.ok(/Max-Age=0/i.test(cleared) || /Expires=Thu, 01 Jan 1970/i.test(cleared));
    assert.equal((await request("/api/auth/session", { headers: { Cookie: cookie } })).status, 401);
    redirectsToLogin(await request("/dashboard", { headers: { Cookie: cookie } }));
  });
  await check("login works after logout and issues a fresh session", async () => {
    const response = await post("/api/auth/login", { email, password });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ok, true);
    const newCookie = sessionCookie(response);
    assert.ok(newCookie !== cookie, "Logging back in must issue a fresh JWT");
    assert.equal((await request("/api/auth/session", { headers: { Cookie: newCookie } })).status, 200);
    assert.equal((await post("/api/auth/logout", {}, newCookie)).status, 200);
  });
  await check("repeated invalid logins are rate limited", async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      assert.equal((await post("/api/auth/login", { email: rateEmail, password: "wrong-password" })).status, 401);
    }
    const response = await post("/api/auth/login", { email: rateEmail, password: "wrong-password" });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get("retry-after")) > 0);
  });
  console.log(`\n${passed} authentication integration checks passed.`);
}

async function run() {
  try {
    await main();
  } catch (error) {
    console.error("Authentication integration test failed:", error);
    process.exitCode = 1;
  } finally {
    try {
      await cleanup();
    } catch (error) {
      console.error("Could not clean up the uniquely named test account:", error);
      process.exitCode = 1;
    }
  }
}

void run();
