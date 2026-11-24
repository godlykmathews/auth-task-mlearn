import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";

const email = `browser-${randomBytes(8).toString("hex")}@example.test`;
const password = `Authent-${randomBytes(18).toString("base64url")}`;
const name = "Browser Tester";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required to clean up browser test records.");
  const db = createClient({ url: process.env.DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN });
  try {
    await db.execute({
      sql: "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = ?)", args: [email],
    });
    await db.execute({ sql: "DELETE FROM users WHERE email = ?", args: [email] });
    if (process.env.JWT_SECRET) {
      for (const action of ["signup", "login"]) {
        const key = createHmac("sha256", process.env.JWT_SECRET).update(`${action}:${email}`).digest("hex");
        await db.execute({ sql: "DELETE FROM auth_limits WHERE key = ?", args: [key] });
      }
    }
  } finally {
    db.close();
  }
});

test("signup shows useful field errors and supports revealing passwords", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Please enter your name.", { exact: true })).toBeVisible();
  await expect(page.getByText("Please enter your email address.", { exact: true })).toBeVisible();
  await expect(page.getByText("Please enter your password.", { exact: true })).toBeVisible();
  await expect(page.getByText("Please confirm your password.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();

  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill("not-an-email");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Confirm password", { exact: true }).fill("short");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Enter a valid email address, like you@example.com.", { exact: true })).toBeVisible();
  await expect(page.getByText("Your password must be at least 8 characters.", { exact: true })).toBeVisible();

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill("different-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByText("Your passwords don’t match. Please try again.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide password", exact: true }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show confirm password", exact: true }).click();
  await expect(page.getByLabel("Confirm password", { exact: true })).toHaveAttribute("type", "text");
});

test("signup, protected dashboard, logout, and login work in the browser", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/login-desktop.png", fullPage: true });
  await page.goto("/signup");
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Welcome, Browser." })).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });

  const cookie = (await context.cookies()).find((item) => item.name === "harbor_session");
  expect(cookie, "The server should set the session cookie").toBeDefined();
  expect(cookie!.httpOnly).toBe(true);
  expect(cookie!.sameSite).toBe("Lax");
  expect(cookie!.secure).toBe(true);
  expect(cookie!.path).toBe("/");
  expect(await page.evaluate(() => document.cookie.includes("harbor_session"))).toBe(false);

  await page.getByRole("button", { name: "Log out", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login\?loggedOut=1$/);
  await expect(page.locator("form").getByRole("status")).toContainText("You’re logged out.");
  expect((await context.cookies()).some((item) => item.name === "harbor_session")).toBe(false);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login(?:\?.*)?$/);

  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("definitely-wrong-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.locator("form").getByRole("alert")).toBeVisible();
  await expect(page.locator("form").getByRole("alert")).toContainText(/email|password/i);
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).first().click();
  await expect(page).toHaveURL(/\/login\?loggedOut=1$/);
});

test("mobile signup stays readable without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/signup");
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/signup-mobile.png", fullPage: true });
});
