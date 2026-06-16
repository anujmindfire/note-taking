import { test, expect } from "@playwright/test";
import { E2E_USER } from "../helpers/auth";

const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:5173";

// S1–S4 use fresh contexts with no storageState.
// browser.newContext() does NOT inherit baseURL from playwright.config.ts,
// so we must pass it explicitly on every manual context creation.
// S5–S6 use the storageState injected by the chromium project config.

test("S1: Register new account", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();

  const uniqueEmail = `s1-${Date.now()}@test.com`;
  await page.goto("/register");
  await page.locator("#email").fill(uniqueEmail);
  await page.locator("#password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("**/notes");
  await expect(page.getByText("JotDown")).toBeVisible();

  await ctx.close();
});

test("S2: Login with valid credentials", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();

  await page.goto("/login");
  await page.locator("#email").fill(E2E_USER.email);
  await page.locator("#password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("**/notes");
  await expect(page.getByText(E2E_USER.email)).toBeVisible();

  await ctx.close();
});

test("S3: Login with wrong password shows error", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: BASE_URL });
  const page = await ctx.newPage();

  await page.goto("/login");
  await page.locator("#email").fill(E2E_USER.email);
  await page.locator("#password").fill("WrongPass1");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/login/);
  await expect(
    page.locator("[data-sonner-toast]").or(page.getByText(/invalid/i))
  ).toBeVisible({ timeout: 5000 });

  await ctx.close();
});

test("S4: Auth guard — unauthenticated user redirected to /login", async ({
  browser,
}) => {
  const ctx = await browser.newContext({ baseURL: BASE_URL }); // no storageState = anonymous
  const page = await ctx.newPage();

  await page.goto("/notes");
  await expect(page).toHaveURL(/\/login/);

  await ctx.close();
});

// S5 uses the storageState injected by the chromium project config
test("S5: Guest route — authenticated user redirected from /login to /notes", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/notes/);
});

// S6 uses the storageState injected by the chromium project config
test("S6: Logout clears session and re-enables auth guard", async ({
  page,
}) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "Logout" }).click();

  await expect(page).toHaveURL(/\/login/);

  // Navigating to /notes after logout should still redirect to /login
  await page.goto("/notes");
  await expect(page).toHaveURL(/\/login/);
});
