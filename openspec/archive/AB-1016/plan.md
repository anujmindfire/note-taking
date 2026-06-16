# Plan — AB-1016: E2E — Playwright Full User Journey

**Based on spec:** openspec/changes/AB-1016/spec.md
**Spec status:** Approved

---

## Phase 1 — Workspace Bootstrap

Files to create/modify to register `e2e/` as a pnpm workspace:

| Action | File                    | What changes                                                                         |
| ------ | ----------------------- | ------------------------------------------------------------------------------------ |
| CREATE | `e2e/package.json`      | `@noteapp/e2e` workspace; `@playwright/test 1.49.1`, `dotenv 16.4.7` devDependencies |
| CREATE | `e2e/.gitignore`        | Ignore `.auth/`, `playwright-report/`, `test-results/`, `.env.test`                  |
| CREATE | `e2e/.env.test.example` | Documents required env vars: `TEST_DATABASE_URL`, `BASE_URL`                         |
| MODIFY | `pnpm-workspace.yaml`   | Add `'e2e'` to packages list                                                         |
| MODIFY | `package.json` (root)   | Add `"e2e"` and `"e2e:ui"` scripts                                                   |

### e2e/package.json — exact content:

```json
{
  "name": "@noteapp/e2e",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "test": "playwright test",
    "test:ui": "playwright test --ui",
    "test:report": "playwright show-report"
  },
  "devDependencies": {
    "@playwright/test": "1.49.1",
    "dotenv": "16.4.7"
  }
}
```

### Root package.json — scripts to add:

```json
"e2e":    "pnpm --filter @noteapp/e2e playwright test",
"e2e:ui": "pnpm --filter @noteapp/e2e playwright test --ui"
```

### pnpm-workspace.yaml — updated packages list:

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "e2e"
```

---

## Phase 2 — Playwright Configuration & Global Setup

| Action | File                       | Purpose                                                                           |
| ------ | -------------------------- | --------------------------------------------------------------------------------- |
| CREATE | `e2e/playwright.config.ts` | Two projects: `setup` (globalSetup) + `chromium` (storageState); baseURL from env |
| CREATE | `e2e/global.setup.ts`      | DB reset → register seed user via API → browser login → save `.auth/user.json`    |

### playwright.config.ts — exact shape:

```typescript
import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, ".env.test") });

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: ".auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
});
```

### global.setup.ts — exact shape:

```typescript
import { test as setup } from "@playwright/test";
import { execSync } from "child_process";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, ".env.test") });

const AUTH_FILE = path.join(__dirname, ".auth/user.json");
const E2E_USER = { email: "e2e@test.com", password: "E2eTest123" };

setup("seed DB and save auth state", async ({ page, request }) => {
  // 1. Reset test database — synchronous; must complete before registration
  execSync(
    "pnpm --filter @noteapp/backend prisma migrate reset --force --skip-seed",
    {
      cwd: path.resolve(__dirname, "../../"),
      env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL! },
      stdio: "inherit",
    },
  );

  // 2. Register seed user via API
  await request.post("/api/auth/register", { data: E2E_USER });

  // 3. Log in via browser to capture Zustand localStorage state correctly
  await page.goto("/login");
  await page.locator("#email").fill(E2E_USER.email);
  await page.locator("#password").fill(E2E_USER.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/notes");

  // 4. Persist full browser state (localStorage contains Zustand auth store)
  await page.context().storageState({ path: AUTH_FILE });
});
```

**Why browser login (not just API request):** The Zustand `authStore` uses `persist` middleware that writes to `localStorage`. An API-only login would return an `accessToken` but would not hydrate `localStorage` in the format Zustand expects. The browser login captures the exact shape that the SPA reads on reload.

---

## Phase 3 — Frontend: Tag Creation UI

**Required for S11.** Auditing the existing frontend reveals `TagSidebar.tsx` has no create/edit/delete UI and `useCreateTag` does not exist. S11 ("Opens tag creation UI, enters name and color, submits") cannot be implemented as a browser test without this.

Files to create/modify in `apps/frontend/src/`:

| Action | File                             | What changes                                                                     |
| ------ | -------------------------------- | -------------------------------------------------------------------------------- |
| CREATE | `hooks/useCreateTag.ts`          | TanStack Query mutation: `POST /api/tags`; invalidates `['tags']` on success     |
| CREATE | `components/TagCreateDialog.tsx` | Controlled Dialog: tag name input + color picker; calls `useCreateTag` on submit |
| MODIFY | `components/TagSidebar.tsx`      | Add "New tag" button below the "Tags" heading; renders `TagCreateDialog`         |

### useCreateTag.ts — exact signature:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ITagResponse, TCreateTagInput } from "@noteapp/shared";

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TCreateTagInput) =>
      api
        .post<{ data: ITagResponse }>("/api/tags", data)
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}
```

### TagCreateDialog.tsx — key aria attributes (test selectors depend on these):

| Element             | Required aria attribute                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Dialog open trigger | `aria-label="New tag"` on the Button in TagSidebar                                       |
| Tag name field      | `<Label htmlFor="tag-name">` + `<Input id="tag-name" aria-label="Tag name">`             |
| Color field         | `<Label htmlFor="tag-color">` + `<Input id="tag-color" type="color" aria-label="Color">` |
| Submit button       | text "Create tag"                                                                        |

These aria attributes must be present exactly — the test selectors in Phase 4 depend on them.

### TagSidebar.tsx — change summary:

Add below the `<p>Tags</p>` heading:

```tsx
<Button
  variant="ghost"
  size="sm"
  className="w-full justify-start text-xs"
  aria-label="New tag"
  onClick={() => setCreateOpen(true)}
>
  <Plus className="mr-1.5 h-3 w-3" />
  New tag
</Button>
<TagCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
```

Add `useState<boolean>(false)` for `createOpen`.

---

## Phase 4 — E2E Test Suite

All files live in `e2e/tests/`. All spec files (except `auth.spec.ts`) inherit the `storageState` from the `chromium` project config.

| File               | Scenarios | Data setup approach                                                                                                                                         |
| ------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.spec.ts`     | S1–S6     | S1 registers a unique new user via UI; S2–S3 use fresh `browser.newContext()`; S4 uses fresh context (no state); S5 uses storageState; S6 uses storageState |
| `notes.spec.ts`    | S7–S8     | S7 creates via UI; S8 builds on S7's note within the same `describe` block                                                                                  |
| `search.spec.ts`   | S9–S10    | `beforeAll`: creates note with "playwright" in content via `request.post`                                                                                   |
| `tags.spec.ts`     | S11–S13   | S11 creates tag via UI; S12–S13 use that tag; `beforeAll` creates tagged + untagged notes via API                                                           |
| `share.spec.ts`    | S14–S16   | `beforeAll`: creates note via API; S14 generates link via UI + captures token from API response                                                             |
| `versions.spec.ts` | S17–S18   | `beforeAll`: creates note via API (v1 auto-created); edits via browser + waits for autosave (v2 created)                                                    |

---

### auth.spec.ts — test outline

```
describe("Auth journey")

  test("S1: Register new account")
    page = fresh context (no storageState)
    goto /register
    fill "#email" → unique address (s1-{timestamp}@test.com)
    fill "#password" → "E2eTest123"
    click getByRole("button", { name: "Create account" })
    expect URL → /notes
    expect getByText("Note").toBeVisible()

  test("S2: Login with valid credentials")
    page = fresh context
    goto /login
    fill "#email" → "e2e@test.com"
    fill "#password" → "E2eTest123"
    click getByRole("button", { name: "Sign in" })
    expect URL → /notes

  test("S3: Login with wrong password")
    page = fresh context
    goto /login
    fill "#email" → "e2e@test.com"
    fill "#password" → "WrongPass1"
    click getByRole("button", { name: "Sign in" })
    expect URL → still /login
    expect locator('[data-sonner-toast]') OR getByText(/invalid/i).toBeVisible()

  test("S4: Auth guard — unauthenticated redirect")
    page = fresh context (no storageState)
    goto /notes
    expect URL → /login

  test("S5: Guest route — authenticated redirect")
    page = uses storageState (chromium project default)
    goto /login
    expect URL → /notes

  test("S6: Logout")
    page = uses storageState
    goto /notes
    click getByRole("button", { name: "Logout" })
    expect URL → /login
    goto /notes
    expect URL → /login  (still redirected — session cleared)
```

**Selector reference:**

| Element         | Playwright selector                                    |
| --------------- | ------------------------------------------------------ |
| Email input     | `page.locator("#email")`                               |
| Password input  | `page.locator("#password")`                            |
| Register submit | `page.getByRole("button", { name: "Create account" })` |
| Login submit    | `page.getByRole("button", { name: "Sign in" })`        |
| Logout button   | `page.getByRole("button", { name: "Logout" })`         |
| App title       | `page.getByText("Note")`                               |
| Error toast     | `page.locator('[data-sonner-toast]')`                  |

Note: S2 and S3 must NOT use the chromium storageState (they test the login flow from scratch); they require a fresh `browser.newContext()` created within the test.

---

### notes.spec.ts — test outline

```
describe("Notes journey")
  shared: let noteUrl: string

  test("S7: Create a note")
    goto /notes
    click getByRole("button", { name: "New Note" })
    expect URL → /notes/{uuid}    (waitForURL)
    noteUrl = page.url()
    expect locator('[aria-label="Note title"]').toBeVisible()

  test("S8: Edit note — autosave fires")
    goto noteUrl
    fill locator('[aria-label="Note title"]') → "Playwright E2E Test Note"
    locator(".ProseMirror").click()
    keyboard.type("This note was written by playwright.")
    [waitForResponse]: Promise.all([
      page.waitForResponse(r => r.url().includes("/notes/") && r.request().method() === "PATCH"),
      idle — typing stops
    ])
    expect getByText("Saved").toBeVisible()
    goto /notes
    expect getByText("Playwright E2E Test Note").toBeVisible()
```

**Key implementation notes:**

- `waitForResponse` on the PATCH `/api/notes/:id` response is more reliable than a fixed sleep.
- TipTap `EditorContent` renders a `div.ProseMirror[contenteditable="true"]`. `page.fill()` does **not** work on contenteditable — use `.click()` followed by `page.keyboard.type()`.
- The autosave status span shows `"Saved"` (from `NoteEditorPage.tsx` line 97), **not** `"Synced"` as written in the spec. Tests assert `page.getByText("Saved")`.

---

### search.spec.ts — test outline

```
describe("Search journey")

  beforeAll:
    request.post("/api/notes", {
      title: "Playwright Search Note",
      content: "playwright is an excellent end-to-end testing framework."
    })

  test("S9: Full-text search — match with highlight")
    goto /notes
    locator('[aria-label="Search notes"]').fill("playwright")
    waitForResponse GET /api/search
    expect locator('[role="button"]').first().toBeVisible()   (note card)
    expect locator("mark").first().toBeVisible()              (highlighted term)

  test("S10: Full-text search — no results")
    goto /notes
    locator('[aria-label="Search notes"]').fill("xyzzy_e2e_nonexistent_abc")
    waitForResponse GET /api/search
    expect getByText(/No notes match/).toBeVisible()
```

**Selector reference:**

| Element            | Playwright selector                                                                 |
| ------------------ | ----------------------------------------------------------------------------------- |
| Search input       | `page.locator('[aria-label="Search notes"]')`                                       |
| Search result card | `page.locator('[role="button"]')` (NoteCard/SearchResultCard)                       |
| Highlighted term   | `page.locator("mark")` (rendered via `dangerouslySetInnerHTML` in SearchResultCard) |
| No-results message | `page.getByText(/No notes match/)`                                                  |

---

### tags.spec.ts — test outline

```
describe("Tags journey")
  shared: let tagName = "e2e-sidebar-tag", noteId: string

  beforeAll:
    r1 = await request.post("/api/notes", { title: "Tagged Note", content: "" })
    noteId = (await r1.json()).data.id
    await request.post("/api/notes", { title: "Untagged Note", content: "" })

  test("S11: Create tag via sidebar UI")
    goto /notes
    click getByRole("button", { name: "New tag" })
    expect getByRole("dialog").toBeVisible()
    fill getByLabel("Tag name") → tagName
    fill getByLabel("Color") → "#3b82f6"
    click getByRole("button", { name: "Create tag" })
    expect getByRole("button", { name: tagName }).toBeVisible()  (in TagSidebar)

  test("S12: Attach tag to note")
    goto /notes/${noteId}
    click getByRole("combobox") with placeholder text "Add tag…"
    click getByRole("option", { name: tagName })
    expect getByText(tagName)  (as a Badge in tag panel at bottom of editor)
      .toBeVisible()

  test("S13: Filter notes by tag")
    goto /notes
    click getByRole("button", { name: tagName })    (TagSidebar button)
    expect URL to contain "tagId[]="
    expect getByText("Tagged Note").toBeVisible()
    expect getByText("Untagged Note").not.toBeVisible()
```

**Notes:**

- The "Add tag…" `<SelectTrigger>` renders as `role="combobox"` (shadcn/ui); target with `page.getByRole("combobox")` since it is the only combobox on the editor page.
- S12 depends on S11 having run (tag must exist before attaching). Tests run serially within the file (`fullyParallel: false`); shared `tagName` is module-level.

---

### share.spec.ts — test outline

```
describe("Share journey")
  shared: let noteId: string, shareToken: string

  beforeAll:
    r = await request.post("/api/notes", { title: "Share Test Note", content: "Shared content." })
    noteId = (await r.json()).data.id

  test("S14: Generate share link")
    goto /notes/${noteId}
    click getByRole("button", { name: "Share" })
    expect getByRole("dialog", { name: "Share note" }).toBeVisible()
    [capture token]:
      const [response] = await Promise.all([
        page.waitForResponse(r => r.url().includes("/shares") && r.status() === 201),
        page.getByRole("button", { name: "Generate link" }).click()
      ])
    const body = await response.json()
    shareToken = body.data.token
    expect shareToken.length > 0

  test("S15: Anonymous view via share link")
    anonCtx = await browser.newContext()    // no storageState
    anonPage = await anonCtx.newPage()
    await anonPage.goto(`/shared/${shareToken}`)
    expect anonPage.getByRole("heading", { name: "Share Test Note" }).toBeVisible()
    expect anonPage.getByRole("button", { name: "Logout" }).not.toBeVisible()
    await anonCtx.close()

  test("S16: Revoke link — access denied")
    goto /notes/${noteId}
    click getByRole("button", { name: "Share" })
    click getByRole("button", { name: "Revoke link" })    (aria-label="Revoke link")
    waitForResponse matching revoke endpoint
    anonCtx2 = await browser.newContext()
    anonPage2 = await anonCtx2.newPage()
    await anonPage2.goto(`/shared/${shareToken}`)
    expect anonPage2.getByText("This link has been revoked by the owner.").toBeVisible()
    await anonCtx2.close()
```

**Why capture token from API response (not DOM):** `ShareModal` renders only `link.token.slice(0, 16)…` in the UI. The full token needed to construct `/shared/:token` is only available in the 201 response body. `page.waitForResponse` captures it reliably before the test proceeds.

---

### versions.spec.ts — test outline

```
describe("Version history journey")
  shared: let noteId: string
  const originalTitle = "Versions Test Note"
  const editedTitle   = "Versions Test Note v2"

  beforeAll:
    r = await request.post("/api/notes", {
      title: originalTitle,
      content: "original content"
    })
    noteId = (await r.json()).data.id
    // v1 is auto-created by backend on note creation (FRS §4.2.1 AC4)

    // Create v2: edit via browser + wait for autosave
    await page.goto(`/notes/${noteId}`)
    await page.locator('[aria-label="Note title"]').fill(editedTitle)
    await page.locator(".ProseMirror").click()
    await page.keyboard.type("edited content for version 2")
    await page.waitForResponse(r =>
      r.url().includes(`/notes/${noteId}`) && r.request().method() === "PATCH"
    )

  test("S17: Version list appears after autosave")
    goto /notes/${noteId}
    click getByRole("button", { name: "History" })
    expect getByRole("heading", { name: "Version history" }).toBeVisible()   (SheetTitle)
    expect locator("text=/v\\d/").count() >= 2
    click getByRole("button", { name: "Close" })   (Sheet close)

  test("S18: Restore an older version")
    goto /notes/${noteId}
    click getByRole("button", { name: "History" })
    // v2 is index 0 (current — Restore button disabled)
    // v1 is index 1 (enabled Restore)
    enabledRestore = getByRole("button", { name: "Restore" })
      .filter({ hasNot: page.locator("[disabled]") })
      .first()
    click enabledRestore
    waitForResponse POST /versions/:versionId/restore
    expect getByText(/Restored to v1/).toBeVisible()   (sonner toast)
    expect locator('[aria-label="Note title"]').inputValue() === originalTitle
```

**Key notes:**

- `VersionHistoryDrawer` renders as a `Sheet` (shadcn). The Sheet title is "Version history"; close via the Sheet's built-in close button.
- Version entries show `v{number} · {date}` format; match with regex `/v\d/`.
- The Restore button for the current version (`index === 0`) has `disabled` attribute. Filter it out: `.filter({ hasNot: page.locator("[disabled]") })`.

---

## Checkpoints

**After Phase 1 (workspace wired):**

```bash
pnpm install
pnpm --filter @noteapp/e2e playwright install chromium
```

**After Phase 3 (TagSidebar addition):**

```bash
pnpm build            # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test             # Vitest suite still green (no backend changes)
```

**After Phase 4 (test files written, app running):**

```bash
# Prerequisite: pnpm dev running; TEST_DATABASE_URL and BASE_URL set in e2e/.env.test
pnpm e2e              # all 18 scenarios pass
```

`pnpm test --coverage` (Vitest) is unaffected by this ticket — E2E tests are not included in the Vitest coverage report.

---

## Risks & Assumptions

| #   | Risk / Assumption                                                                                                         | Mitigation                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | `TagSidebar` has no create UI; `useCreateTag` hook does not exist — S11 is unimplementable as a browser test without them | Phase 3 adds `useCreateTag.ts`, `TagCreateDialog.tsx`, and the "New tag" button to `TagSidebar`. If scope creep concern: fall back to creating tags via API in `beforeAll` and re-scope S11 to verify tag appearance in sidebar only |
| R2  | `global.setup.ts` calls `execSync` for DB reset — requires `TEST_DATABASE_URL` to differ from `DATABASE_URL`              | Enforced by `process.env.TEST_DATABASE_URL!` (TypeScript non-null assertion throws at runtime if absent); documented in `.env.test.example`                                                                                          |
| R3  | TipTap `div.ProseMirror[contenteditable="true"]` does not accept `page.fill()`                                            | Use `locator(".ProseMirror").click()` + `page.keyboard.type(content)` in all tests that type note body content                                                                                                                       |
| R4  | Autosave debounce is 2s; a static sleep would be brittle                                                                  | Use `page.waitForResponse(r => r.url().includes("/notes/") && r.request().method() === "PATCH")` instead of any fixed sleep                                                                                                          |
| R5  | Share modal shows only `token.slice(0, 16)…` in the DOM — full URL cannot be reconstructed from the UI                    | Capture the full token from the `POST /api/notes/:id/shares` 201 response body using `page.waitForResponse` (documented in share.spec.ts outline)                                                                                    |
| R6  | Multiple "Restore" buttons exist in the version drawer; the current version's button has `disabled` attribute             | Use `.filter({ hasNot: page.locator("[disabled]") }).first()` to target only the enabled Restore button                                                                                                                              |
| R7  | Spec says autosave status is "Synced" — actual component text is "Saved" (`NoteEditorPage.tsx` line 97)                   | All test assertions use `getByText("Saved")`; spec wording is a minor inaccuracy                                                                                                                                                     |
| R8  | `storageState` captures Zustand `localStorage` shape at login time; shape may be stale if Zustand store key changes       | Acceptable: `global.setup.ts` re-runs before every suite and always writes a fresh `storageState` from a real browser login                                                                                                          |
