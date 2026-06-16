import { test, expect } from "@playwright/test";
import { getAccessToken, authHeaders } from "../helpers/auth";

// beforeAll creates a note with "playwright" in its content so S9 has a
// guaranteed match. Using request requires an explicit Authorization header
// because the request fixture does not read JWT from localStorage.
test.beforeAll(async ({ request }) => {
  const token = await getAccessToken(request);
  await request.post("/api/notes", {
    headers: authHeaders(token),
    data: {
      title: "Playwright Search Note",
      content: "playwright is an excellent end-to-end testing framework.",
    },
  });
});

test("S9: Full-text search — match with highlighted snippet", async ({
  page,
}) => {
  await page.goto("/notes");

  const searchInput = page.locator('[aria-label="Search notes"]');
  await searchInput.fill("playwright");

  await page.waitForResponse(
    (r) => r.url().includes("/api/search") && r.status() === 200,
    { timeout: 10_000 }
  );

  // At least one note card (role="button") is visible
  await expect(page.locator('[role="button"]').first()).toBeVisible();

  // SearchResultCard renders highlight via dangerouslySetInnerHTML with <mark> tags
  await expect(page.locator("mark").first()).toBeVisible();
});

test("S10: Full-text search — no results shows empty state", async ({
  page,
}) => {
  await page.goto("/notes");

  const searchInput = page.locator('[aria-label="Search notes"]');
  await searchInput.fill("xyzzy_e2e_nonexistent_abc123");

  await page.waitForResponse(
    (r) => r.url().includes("/api/search") && r.status() === 200,
    { timeout: 10_000 }
  );

  await expect(page.getByText(/No notes match/)).toBeVisible();
});
