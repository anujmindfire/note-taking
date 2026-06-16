import { test, expect } from "@playwright/test";
import { getAccessToken, authHeaders } from "../helpers/auth";

const BASE_URL = process.env["BASE_URL"] ?? "http://localhost:5173";

let noteId: string;
let shareToken: string;

test.beforeAll(async ({ request }) => {
  const token = await getAccessToken(request);
  const r = await request.post("/api/notes", {
    headers: authHeaders(token),
    data: { title: "Share Test Note", content: "Shared content." },
  });
  const body = await r.json();
  noteId = body.data.id as string;
});

test("S14: Generate share link — token captured from API response", async ({
  page,
}) => {
  await page.goto(`/notes/${noteId}`);

  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("dialog", { name: "Share note" })).toBeVisible();

  // Capture the full token from the 201 response (the UI only shows a truncated preview)
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/shares") && r.status() === 201
    ),
    page.getByRole("button", { name: "Generate link" }).click(),
  ]);

  const body = await response.json();
  shareToken = body.data.token as string;

  expect(shareToken.length).toBeGreaterThan(0);
});

test("S15: Anonymous user can view shared note content", async ({
  browser,
}) => {
  // Open share URL in a fresh context without storageState (anonymous user)
  const anonCtx = await browser.newContext({ baseURL: BASE_URL });
  const anonPage = await anonCtx.newPage();

  await anonPage.goto(`/shared/${shareToken}`);

  await expect(
    anonPage.getByRole("heading", { name: "Share Test Note" })
  ).toBeVisible();

  // No auth controls visible on the public share page
  await expect(
    anonPage.getByRole("button", { name: "Logout" })
  ).not.toBeVisible();

  await anonCtx.close();
});

test("S16: Revoke link — anonymous user sees access-denied message", async ({
  page,
  browser,
}) => {
  await page.goto(`/notes/${noteId}`);
  await page.getByRole("button", { name: "Share" }).click();
  await expect(page.getByRole("dialog", { name: "Share note" })).toBeVisible();

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/revoke") && r.status() === 200
    ),
    page.getByRole("button", { name: "Revoke link" }).click(),
  ]);

  await page.keyboard.press("Escape");

  const anonCtx = await browser.newContext({ baseURL: BASE_URL });
  const anonPage = await anonCtx.newPage();

  await anonPage.goto(`/shared/${shareToken}`);

  await expect(
    anonPage.getByText("This link has been revoked by the owner.")
  ).toBeVisible({ timeout: 5000 });

  await anonCtx.close();
});
