# Tasks — AB-1016: E2E — Playwright Full User Journey

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Workspace Bootstrap

- [ ] Create `e2e/package.json`
  - [ ] Name: `@noteapp/e2e`
  - [ ] DevDependencies: `@playwright/test: 1.49.1`, `dotenv: 16.4.7`
  - [ ] Scripts: `"test"`, `"test:ui"`, `"test:report"`
- [ ] Create `e2e/.gitignore` — entries: `.auth/`, `playwright-report/`, `test-results/`, `.env.test`
- [ ] Create `e2e/.env.test.example` — document `TEST_DATABASE_URL` and `BASE_URL` vars
- [ ] Modify `pnpm-workspace.yaml` — add `'e2e'` to packages list
- [ ] Modify root `package.json` — add scripts:
  - `"e2e": "pnpm --filter @noteapp/e2e playwright test"`
  - `"e2e:ui": "pnpm --filter @noteapp/e2e playwright test --ui"`

**Checkpoint 1:**
- [ ] `pnpm install` — no errors; `@noteapp/e2e` workspace recognized
- [ ] `pnpm --filter @noteapp/e2e playwright install chromium`

---

## Phase 2 — Playwright Configuration & Global Setup

- [ ] Create `e2e/playwright.config.ts`
  - [ ] `dotenv.config({ path: ".env.test" })` at top
  - [ ] `testDir: "./tests"`, `fullyParallel: false`, `timeout: 30_000`
  - [ ] `retries: process.env.CI ? 2 : 0`
  - [ ] `use.baseURL: process.env.BASE_URL ?? "http://localhost:5173"`
  - [ ] Two projects: `setup` (matches `global.setup.ts`) + `chromium` (depends on `setup`; `storageState: ".auth/user.json"`)

- [ ] Create `e2e/global.setup.ts`
  - [ ] `execSync` DB reset: `pnpm --filter @noteapp/backend prisma migrate reset --force --skip-seed` with `DATABASE_URL=TEST_DATABASE_URL`
  - [ ] Register seed user `e2e@test.com / E2eTest123` via `request.post("/api/auth/register")`
  - [ ] Browser login: fill `#email` + `#password` → click "Sign in" → `waitForURL("**/notes")`
  - [ ] Save state: `page.context().storageState({ path: ".auth/user.json" })`

- [ ] Create `e2e/.auth/` directory (gitignored; `user.json` generated at runtime — do not commit)

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`

---

## Phase 3 — Frontend: Tag Creation UI

Required for S11 — `TagSidebar` has no create UI; `useCreateTag` hook does not exist.

- [ ] Create `apps/frontend/src/hooks/useCreateTag.ts`
  - [ ] `useMutation` accepting `TCreateTagInput`
  - [ ] `POST /api/tags` via `api` instance; returns `ITagResponse` (201)
  - [ ] `onSuccess`: invalidate `['tags']`

- [ ] Create `apps/frontend/src/components/TagCreateDialog.tsx`
  - [ ] Props: `{ open: boolean; onOpenChange: (open: boolean) => void }`
  - [ ] Tag name field: `<Label htmlFor="tag-name">` + `<Input id="tag-name" aria-label="Tag name">`
  - [ ] Color field: `<Label htmlFor="tag-color">` + `<Input id="tag-color" type="color" aria-label="Color">`
  - [ ] Submit button text: `"Create tag"` (exact — test selectors depend on this)
  - [ ] Calls `useCreateTag` on submit; closes dialog on success

- [ ] Modify `apps/frontend/src/components/TagSidebar.tsx`
  - [ ] Add `useState<boolean>(false)` for `createOpen`
  - [ ] Add button below "Tags" heading: `aria-label="New tag"`, text "New tag", Plus icon
  - [ ] Render `<TagCreateDialog open={createOpen} onOpenChange={setCreateOpen} />`

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`
- [ ] `pnpm test` — all Vitest tests green (no regressions)

---

## Phase 4 — E2E Test Suite

All files go in `e2e/tests/`. All spec files use storageState from the `chromium` project config
(except fresh-context tests in `auth.spec.ts` that explicitly create new browser contexts).

- [ ] Create `e2e/tests/auth.spec.ts` — S1–S6
  - [ ] AC-S1: Register new account — `/register` UI → redirect to `/notes`
  - [ ] AC-S2: Login valid credentials — fresh context → `/login` → redirect to `/notes`
  - [ ] AC-S3: Login wrong password — stays on `/login`; error toast shown
  - [ ] AC-S4: Auth guard — fresh context; navigate `/notes` → redirected to `/login`
  - [ ] AC-S5: Guest route redirect — auth storageState; navigate `/login` → redirected to `/notes`
  - [ ] AC-S6: Logout — click Logout → `/login`; navigate `/notes` → still `/login`

- [ ] Create `e2e/tests/notes.spec.ts` — S7–S8
  - [ ] AC-S7: Create a note — "New Note" button → `waitForURL("**/notes/*")` → editor visible
  - [ ] AC-S8: Edit note autosave — type title + content → `waitForResponse(PATCH /api/notes/:id)` → `getByText("Saved")` visible; title persists on return to `/notes`

- [ ] Create `e2e/tests/search.spec.ts` — S9–S10
  - [ ] `beforeAll`: create note via `request.post("/api/notes")` with "playwright" in content
  - [ ] AC-S9: Full-text match — search "playwright" → note card visible; `locator("mark")` visible
  - [ ] AC-S10: No results — search unique string → "No notes match" empty state

- [ ] Create `e2e/tests/tags.spec.ts` — S11–S13
  - [ ] `beforeAll`: create tagged + untagged notes via `request.post`
  - [ ] AC-S11: Create tag via sidebar UI — click "New tag" → dialog → fill name + color → "Create tag" → tag appears in sidebar
  - [ ] AC-S12: Attach tag to note — navigate to note editor → combobox → select tag → badge visible
  - [ ] AC-S13: Filter by tag — click tag in sidebar → URL has `tagId[]=` → only tagged note shown

- [ ] Create `e2e/tests/share.spec.ts` — S14–S16
  - [ ] `beforeAll`: create note via `request.post("/api/notes")`
  - [ ] AC-S14: Generate share link — open Share modal → "Generate link" → capture token from 201 response via `page.waitForResponse`
  - [ ] AC-S15: Anonymous view — `browser.newContext()` (no storageState) → share URL → note title visible; no Logout button
  - [ ] AC-S16: Revoke + access denied — revoke link in modal → new anon context → `getByText("This link has been revoked by the owner.")` visible

- [ ] Create `e2e/tests/versions.spec.ts` — S17–S18
  - [ ] `beforeAll`: create note (v1); edit via browser + `waitForResponse(PATCH)` to trigger v2
  - [ ] AC-S17: Version list — open History drawer → `getByRole("heading", { name: "Version history" })` visible; `locator("text=/v\\d/").count() >= 2`
  - [ ] AC-S18: Restore older version — click enabled Restore on v1 → `waitForResponse(POST .../restore)` → toast "Restored to v1" → title input reverts to original value

**Checkpoint 4 (final):**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`
- [ ] `pnpm test` — Vitest suite green
- [ ] Dev server running + `.env.test` set → `pnpm e2e` — all 18 scenarios pass
