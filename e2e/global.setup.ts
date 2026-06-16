import { test as setup } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { E2E_USER } from "./helpers/auth";

dotenv.config({ path: path.join(__dirname, ".env.test") });

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

setup("seed DB and save auth state", async ({ page, request }) => {
  // 1. Reset test database only when TEST_DATABASE_URL is explicitly configured.
  //    Without it we skip the reset (dev DB is used; tests handle existing data gracefully).
  if (process.env["TEST_DATABASE_URL"]) {
    execSync(
      "pnpm --filter @noteapp/backend prisma migrate reset --force --skip-seed",
      {
        cwd: path.resolve(__dirname, "../../"),
        env: { ...process.env, DATABASE_URL: process.env["TEST_DATABASE_URL"] },
        stdio: "inherit",
      }
    );
  }

  // 2. Register seed user — idempotent: ignore EMAIL_TAKEN if already exists.
  const registerRes = await request.post("/api/auth/register", {
    data: E2E_USER,
  });
  if (!registerRes.ok()) {
    const body = await registerRes.json();
    if ((body as { error?: { code?: string } })?.error?.code !== "EMAIL_TAKEN") {
      throw new Error(
        `E2E seed user registration failed: ${JSON.stringify(body)}`
      );
    }
  }

  // 3. Log in via browser to capture the Zustand authStore localStorage state.
  //    The Zustand authStore uses persist middleware (key: "auth") that writes to
  //    localStorage. An API-only login would not populate that key.
  await page.goto("/login");
  await page.locator("#email").fill(E2E_USER.email);
  await page.locator("#password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/notes");

  // 4. Persist full browser state (localStorage + cookies)
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
