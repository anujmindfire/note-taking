import { test, expect } from "@playwright/test";

let noteUrl: string;

test("S7: Create a note", async ({ page }) => {
  await page.goto("/notes");
  await page.getByRole("button", { name: "New Note" }).click();

  await page.waitForURL(/\/notes\/.+/);
  noteUrl = page.url();

  await expect(page.locator('[aria-label="Note title"]')).toBeVisible();
});

test("S8: Edit note — autosave fires and updates note list", async ({
  page,
}) => {
  await page.goto(noteUrl);

  await page.locator('[aria-label="Note title"]').fill("Playwright E2E Test Note");

  // TipTap EditorContent renders div.ProseMirror[contenteditable] — fill() does
  // not work on contenteditable; use click + keyboard.type instead.
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("This note was written by playwright.");

  // Wait for the PATCH /api/notes/:id autosave response (2s debounce + network)
  await page.waitForResponse(
    (r) =>
      r.url().includes("/api/notes/") &&
      r.request().method() === "PATCH" &&
      r.status() === 200,
    { timeout: 10_000 }
  );

  // Autosave status shows "Saved" (NoteEditorPage.tsx saveStatus === "saved")
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });

  // Navigate back and verify title updated in the notes list
  await page.goto("/notes");
  // Multiple note cards may exist from prior runs (no DB reset); .first() avoids strict mode
  await expect(page.getByText("Playwright E2E Test Note").first()).toBeVisible();
});
