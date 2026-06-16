import { test, expect } from "@playwright/test";
import { getAccessToken, authHeaders } from "../helpers/auth";

// Unique tag name prevents collision if tests run against a non-reset database
const TAG_NAME = `e2e-tag-${Date.now()}`;
let taggedNoteTitle: string;
let untaggedNoteTitle: string;
let noteId: string;

test.beforeAll(async ({ request }) => {
  const token = await getAccessToken(request);
  const headers = authHeaders(token);

  // Unique note titles prevent false "not visible" failures from stale data
  taggedNoteTitle = `e2e-tagged-${Date.now()}`;
  untaggedNoteTitle = `e2e-untagged-${Date.now()}`;

  const r1 = await request.post("/api/notes", {
    headers,
    data: { title: taggedNoteTitle, content: "" },
  });
  const body1 = await r1.json();
  noteId = body1.data.id as string;

  await request.post("/api/notes", {
    headers,
    data: { title: untaggedNoteTitle, content: "" },
  });
});

test("S11: Create tag via sidebar UI", async ({ page }) => {
  await page.goto("/notes");

  await page.getByRole("button", { name: "New tag" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByLabel("Tag name").fill(TAG_NAME);
  await page.getByLabel("Color").fill("#3b82f6");
  await page.getByRole("button", { name: "Create tag" }).click();

  // Tag button accessible name includes the note count ("TAG_NAME 0"), so use exact: false
  await expect(page.getByRole("button", { name: TAG_NAME, exact: false })).toBeVisible({
    timeout: 5000,
  });
});

test("S12: Attach tag to note via editor tag picker", async ({ page }) => {
  await page.goto(`/notes/${noteId}`);

  // The "Add tag…" SelectTrigger renders as role="combobox" (shadcn/ui)
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: TAG_NAME }).click();

  // Tag Badge visible in the tag panel at the bottom of the editor
  await expect(page.getByText(TAG_NAME)).toBeVisible({ timeout: 5000 });
});

test("S13: Filter notes by tag shows only tagged notes", async ({ page }) => {
  await page.goto("/notes");

  await page.getByRole("button", { name: TAG_NAME, exact: false }).click();
  await expect(page).toHaveURL(/tagId\[\]/);

  await expect(page.getByText(taggedNoteTitle)).toBeVisible();
  await expect(page.getByText(untaggedNoteTitle)).not.toBeVisible();
});
