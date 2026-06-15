# Tasks — AB-1012: Frontend — Note Editor with TipTap + Autosave

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Dependencies

- [ ] Install TipTap packages: `pnpm --filter frontend add @tiptap/react @tiptap/pm @tiptap/starter-kit`
- [ ] Verify packages appear in `apps/frontend/package.json`

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Utilities

- [ ] Add `stripHtml(html: string): string` to `apps/frontend/src/lib/noteUtils.ts`
  - Replace all `<tag>` occurrences with a space, collapse whitespace, trim
- [ ] Update `getContentPreview(content, maxLen)` to call `stripHtml()` before slicing
  - Existing plain-text content is unaffected (stripping plain text is a no-op)

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Hooks

- [ ] Create `apps/frontend/src/hooks/useNote.ts`
  - `useQuery<INoteResponse>` with `queryKey: ["note", id]` → `GET /api/notes/:id`
  - On any error (404, network, 401): `navigate("/notes")` + `toast.error(...)`
- [ ] Create `apps/frontend/src/hooks/useUpdateNote.ts`
  - `useMutation<INoteResponse, Error, { id: string } & TUpdateNoteInput>`
  - `mutationFn`: `api.patch(`/notes/${id}`, { title, content })` → returns `res.data.data`
- [ ] Create `apps/frontend/src/hooks/useAutosave.ts`
  - Export `SaveStatus = "idle" | "saving" | "saved" | "error"` type
  - Accept `(noteId: string, title: string, content: string)` → return `{ saveStatus: SaveStatus }`
  - Debounce 2 000 ms: reset timer on every title/content change
  - Change validation: skip PATCH if `title + content` matches `lastSavedRef`
  - Pending guard: if `isPendingRef` is true when timer fires, defer until current request resolves
  - On success: update `lastSavedRef`; call `queryClient.setQueryData(["note", noteId], updatedNote)`; set status `"saved"`
  - On first failure: set `isPendingRef = false`; schedule retry after 3 000 ms; keep status `"saving"`
  - On retry success: same as on success above
  - On retry failure: set status `"error"` (persistent)
  - Latest-Write-Wins: capture `saveCounterRef` at dispatch; ignore responses where counter no longer matches
  - New content change while status is `"error"`: reset status and restart debounce
- [ ] Create `apps/frontend/src/hooks/useAttachTag.ts`
  - `useMutation<INoteResponse, Error, { noteId: string; tagId: string }>`
  - `mutationFn`: `api.post(`/notes/${noteId}/tags/${tagId}`)` → returns `res.data.data`
  - `onSuccess`: `queryClient.invalidateQueries({ queryKey: ["note", noteId] })`
  - `onError`: `toast.error(getErrorMessage(err))`
- [ ] Create `apps/frontend/src/hooks/useDetachTag.ts`
  - `useMutation<INoteResponse, Error, { noteId: string; tagId: string }>`
  - `mutationFn`: `api.delete(`/notes/${noteId}/tags/${tagId}`)` → returns `res.data.data`
  - `onSuccess`: `queryClient.invalidateQueries({ queryKey: ["note", noteId] })`
  - `onError`: `toast.error(getErrorMessage(err))`

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — NoteEditorPage Component

- [ ] Create `apps/frontend/src/pages/NoteEditorPage.tsx`
  - Read `:id` param via `useParams()`
  - Call `useNote(id)` — render skeleton while loading; redirect + toast on error (handled inside hook)
  - Render `"← Notes"` back button calling `navigate("/notes")`
  - Render inline `<input>` for the note title (controlled, wired to autosave)
  - Initialize TipTap with `useEditor({ extensions: [StarterKit], content: note.content })` — pass `immediatelyRender: false` to suppress SSR warning; init runs once via `useEffect` when `note` first loads
  - Render `<EditorContent editor={editor} />` with appropriate prose styling
  - Call `useAutosave(id, title, editor.getHTML())` and display `saveStatus` in the status bar
    - `"saving"` → `"Saving…"`
    - `"saved"` → `"Saved"`
    - `"error"` → `"Save failed"` (red, persistent)
    - `"idle"` → no label / empty
  - Render tag panel below the editor:
    - Attached tags as `<Badge>` chips each with a `×` button calling `useDetachTag`
    - `<Select>` (shadcn) populated from `useTags()`, options filtered to exclude already-attached tag IDs; `onValueChange` calls `useAttachTag` and resets select to placeholder
- [ ] Add loading skeleton for title and editor body (while `useNote` is pending)
- [ ] Verify: no business logic outside hooks; component only orchestrates rendering

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — NoteCard Update + Routing

- [ ] Update `apps/frontend/src/components/NoteCard.tsx`
  - Add `onClick={() => navigate(`/notes/${note.id}`)}` (or wrap body in `<Link>`) to the card container
  - Add `e.stopPropagation()` to the trash `<button>` so delete does not trigger card navigation
  - Add `cursor-pointer` class to the card container
- [ ] Update `apps/frontend/src/App.tsx`
  - Import `NoteEditorPage`
  - Add protected route: `<Route path="/notes/:id" element={<ProtectedRoute><NoteEditorPage /></ProtectedRoute>} />`
  - Place before the wildcard `path="*"` route

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — MSW Handlers

- [ ] Extend `apps/frontend/src/mocks/handlers.ts` with:
  - `GET /api/notes/:id` → return a mock `INoteResponse`
  - `PATCH /api/notes/:id` → return the updated mock `INoteResponse`
  - `POST /api/notes/:id/tags/:tagId` → return mock `INoteResponse` with tag appended
  - `DELETE /api/notes/:id/tags/:tagId` → return mock `INoteResponse` with tag removed

**Checkpoint 6:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 7 — Tests

Delegate to test-writer agent. Every scenario in spec.md must have at least one test.

**Hook tests** (`apps/frontend/src/__tests__/hooks/`):

- [ ] `useNote.test.ts`
  - [ ] AC-S1: Load note — happy path (returns INoteResponse)
  - [ ] AC-S2: Note not found — redirects to /notes + toast.error
  - [ ] AC-S3: Loading state — isLoading true before data resolves

- [ ] `useUpdateNote.test.ts`
  - [ ] AC-S5: Edit content — PATCH called with correct body; returns updated note

- [ ] `useAutosave.test.ts`
  - [ ] AC-S4: Edit title — debounce fires PATCH after 2 s
  - [ ] AC-S5: Edit content — debounce fires PATCH after 2 s
  - [ ] AC-S6: Edit title and content — single PATCH with both fields
  - [ ] AC-S7: Rapid typing — timer resets; only one PATCH after inactivity
  - [ ] AC-S8: No-op save skipped — no PATCH when content unchanged
  - [ ] AC-S9: Pending guard — save deferred while first request in-flight
  - [ ] AC-S10: Save failure → retry fired after 3 s
  - [ ] AC-S11: Retry succeeds — status → "saved"
  - [ ] AC-S12: Retry fails — status → "error"
  - [ ] AC-S13: Resume editing after save failed — debounce resets; new save fires

- [ ] `useAttachTag.test.ts`
  - [ ] AC-S15: Attach tag — POST fires; ["note", id] query invalidated
  - [ ] AC-S17: Attach already-attached tag — POST fires (idempotent, backend 200)
  - [ ] AC-S18: Tag not found on attach — toast.error shown

- [ ] `useDetachTag.test.ts`
  - [ ] AC-S16: Detach tag — DELETE fires; ["note", id] query invalidated

**Component tests** (`apps/frontend/src/__tests__/`):

- [ ] `pages/NoteEditorPage.test.tsx`
  - [ ] AC-S1: Load note — title input and editor populated from API response
  - [ ] AC-S2: Note not found — redirects to /notes
  - [ ] AC-S3: Loading state — skeletons rendered while query pending
  - [ ] AC-S14: Back navigation — clicking "← Notes" navigates to /notes
  - [ ] AC-S21: Unauthenticated — 401 response triggers auth clear + redirect to /login

- [ ] `components/NoteCard.test.tsx` (update existing file)
  - [ ] AC-S19: Click NoteCard body — navigates to /notes/:id
  - [ ] AC-S20: Click delete button — stopPropagation; no navigation; dialog opens

**Checkpoint 7 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on all new files
