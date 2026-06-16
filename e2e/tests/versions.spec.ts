import { test, expect } from "@playwright/test";
import path from "path";
import { getAccessToken, authHeaders } from "../helpers/auth";

const ORIGINAL_TITLE = `Versions Test Note ${Date.now()}`;
const EDITED_TITLE = `Versions Test Note v2 ${Date.now()}`;
const AUTH_FILE = path.join(__dirname, "../.auth/user.json");
const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:5173";

let noteId: string;

test.beforeAll(async ({ request, browser }) => {
  const token = await getAccessToken(request);

  // Create note — backend auto-creates v1 (FRS §4.2.1 AC4)
  const r = await request.post("/api/notes", {
    headers: authHeaders(token),
    data: { title: ORIGINAL_TITLE, content: "original content" },
  });
  const body = await r.json();
  noteId = body.data.id as string;

  // Edit via browser to trigger autosave and create v2.
  // browser is worker-scoped and available in beforeAll; page is not.
  const ctx = await browser.newContext({ storageState: AUTH_FILE, baseURL: BASE_URL });
  const p = await ctx.newPage();

  await p.goto(`/notes/${noteId}`);
  await p.locator('[aria-label="Note title"]').fill(EDITED_TITLE);
  await p.locator(".ProseMirror").click();
  await p.keyboard.type("edited content for version 2");

  // Wait for PATCH /api/notes/:id to complete (autosave creates v2)
  await p.waitForResponse(
    (res) =>
      res.url().includes(`/api/notes/${noteId}`) &&
      res.request().method() === "PATCH" &&
      res.status() === 200,
    { timeout: 10_000 }
  );

  await ctx.close();
});

test("S17: Version list appears after autosave", async ({ page }) => {
  await page.goto(`/notes/${noteId}`);

  // Open VersionHistoryDrawer (Sheet component)
  await page.getByRole("button", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "Version history" })
  ).toBeVisible();

  // At least 2 version entries (v1 and v2) — entries show "v{number} · {date}"
  const versionEntries = page.locator("text=/v\\d/");
  await expect(versionEntries.first()).toBeVisible();
  expect(await versionEntries.count()).toBeGreaterThanOrEqual(2);
});

test("S18: Restore an older version updates note title", async ({ page }) => {
  await page.goto(`/notes/${noteId}`);
  await page.getByRole("button", { name: "History" }).click();
  await expect(
    page.getByRole("heading", { name: "Version history" })
  ).toBeVisible();

  // The current version (first entry) has its Restore button disabled.
  // disabled: false checks the button's own disabled attribute (not child elements).
  const enabledRestore = page
    .getByRole("button", { name: "Restore", disabled: false })
    .first();

  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/restore") && res.status() === 200
    ),
    enabledRestore.click(),
  ]);

  // Sonner toast appears after successful restore with message matching /Restored to v\d/
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: /Restored to v\d/ })
  ).toBeVisible({ timeout: 5000 });

  // Note title in editor reverts to the restored version's title
  await expect(page.locator('[aria-label="Note title"]')).toHaveValue(
    ORIGINAL_TITLE,
    { timeout: 5000 }
  );
});
