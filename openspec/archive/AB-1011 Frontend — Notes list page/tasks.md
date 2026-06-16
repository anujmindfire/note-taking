# Tasks — AB-1011: Frontend — Notes List Page

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — UI Scaffold

Add new shadcn/ui primitives and the content preview utility.

- [ ] Add `@radix-ui/react-alert-dialog`, `@radix-ui/react-select` to `apps/frontend/package.json` dependencies
- [ ] Create `apps/frontend/src/components/ui/alert-dialog.tsx` — shadcn AlertDialog
- [ ] Create `apps/frontend/src/components/ui/badge.tsx` — shadcn Badge
- [ ] Create `apps/frontend/src/components/ui/select.tsx` — shadcn Select
- [ ] Create `apps/frontend/src/components/ui/skeleton.tsx` — shadcn Skeleton
- [ ] Create `apps/frontend/src/lib/noteUtils.ts` — export `getContentPreview(content, maxLen?)` returning 150-char truncated preview with "…"
- [ ] Extend `apps/frontend/src/mocks/handlers.ts` with:
  - [ ] `GET /api/notes` handler returning `{ data: [...], meta: { total, page, limit, totalPages } }`
  - [ ] `GET /api/tags` handler returning `{ data: [...] }`
  - [ ] `DELETE /api/notes/:id` handler returning 204

**Checkpoint 1:**

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm --filter @noteapp/frontend lint`

---

## Phase 2 — Hooks

- [ ] Create `apps/frontend/src/hooks/useNotes.ts`
  - [ ] `useQuery(["notes", query], ...)` → `GET /api/notes` with query params serialised
  - [ ] Returns `{ data: { notes: INoteResponse[]; meta: INotesPageMeta } }`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`
- [ ] Create `apps/frontend/src/hooks/useTags.ts`
  - [ ] `useQuery(["tags"], ...)` → `GET /api/tags`
  - [ ] Returns `ITagResponse[]`
- [ ] Create `apps/frontend/src/hooks/useCreateNote.ts`
  - [ ] `useMutation` → `POST /api/notes` with `{ title: "Untitled", content: "" }`
  - [ ] `onSuccess`: navigate to `/notes/:id`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`
- [ ] Create `apps/frontend/src/hooks/useDeleteNote.ts`
  - [ ] `useMutation` with `(noteId: string)` → `DELETE /api/notes/${noteId}`
  - [ ] `onSuccess`: `queryClient.invalidateQueries(["notes"])` + `toast.success("Note deleted")`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`

**Checkpoint 2:**

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm --filter @noteapp/frontend lint`

---

## Phase 3 — Page Components

- [ ] Create `apps/frontend/src/components/Navbar.tsx`
  - [ ] Shows app name ("Note")
  - [ ] Reads `user.email` from `useAuthStore`
  - [ ] Renders "Logout" button wired to `useLogout` from AB-1010
- [ ] Create `apps/frontend/src/components/TagSidebar.tsx`
  - [ ] Calls `useTags()` and renders tag list
  - [ ] Each tag shows color swatch, name, and note count badge
  - [ ] Props: `selectedTagIds: string[]`, `onToggle: (id: string) => void`
  - [ ] Highlights selected tags; skeleton rows while loading
- [ ] Create `apps/frontend/src/components/NoteCard.tsx`
  - [ ] Props: `note: INoteResponse`, `onDelete: (id: string) => void`
  - [ ] Shows: title (or "Untitled" if empty), `getContentPreview(note.content)` if non-empty, tag chips (Badge), formatted `updatedAt`, trash icon button
  - [ ] Trash icon calls `onDelete(note.id)`
- [ ] Create `apps/frontend/src/components/DeleteNoteDialog.tsx`
  - [ ] Props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `noteId: string | null`, `noteTitle: string`
  - [ ] Uses `useDeleteNote()` internally
  - [ ] "Delete" button triggers mutation; dialog closes on success or error
- [ ] Create `apps/frontend/src/pages/NotesPage.tsx`
  - [ ] Reads URL search params: `page`, `sortBy`, `sortDir`, `tagId[]`
  - [ ] Calls `useNotes(query)` with params; derives `TListNotesQuery` from URL
  - [ ] Layout: fixed `<Navbar />` at top; left `<TagSidebar />` (160–240 px); main content area
  - [ ] Main area header: "New Note" button (calls `useCreateNote.mutate`) + sort `<Select>`
  - [ ] Renders `<NoteCard />` for each note; `<Skeleton />` rows while loading
  - [ ] Empty state: "No notes yet. Create your first note." when `data.notes.length === 0` and not loading
  - [ ] Pagination: "Prev" button (disabled on page 1), "Page X of N", "Next" button (disabled on last page)
  - [ ] Tag toggle: calls `setSearchParams` to add/remove `tagId[]` and reset `page=1`
  - [ ] Sort change: calls `setSearchParams` to update `sortBy`/`sortDir` and reset `page=1`
  - [ ] Renders `<DeleteNoteDialog />` controlled by local `deletingNoteId` state

**Checkpoint 3:**

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm --filter @noteapp/frontend lint`

---

## Phase 4 — App Wiring

- [ ] Modify `apps/frontend/src/App.tsx`
  - [ ] Import `NotesPage`
  - [ ] Replace `<div>Notes page — coming soon</div>` with `<NotesPage />`

**Checkpoint 4:**

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm --filter @noteapp/frontend lint`

---

## Phase 5 — Tests

Delegate to test-writer agent. Every row in the spec scenario table must have a named test.

**Hook tests** (`apps/frontend/src/__tests__/hooks/`):

- [ ] `useNotes.test.ts`
  - [ ] AC-S1: notes exist — query resolves with notes array and meta
  - [ ] AC-S2: empty list — query resolves with empty array
  - [ ] AC-S15: API error — `toast.error` called, query enters error state
- [ ] `useTags.test.ts`
  - [ ] AC-S1: tags loaded — query resolves with tags array
- [ ] `useCreateNote.test.ts`
  - [ ] AC-S9: create success — navigate called with `/notes/:id`
  - [ ] AC-S9 error: create failure — `toast.error` called, no navigation
- [ ] `useDeleteNote.test.ts`
  - [ ] AC-S10: delete success — notes query invalidated, `toast.success` called
  - [ ] AC-S12: delete API error — `toast.error` called, no query invalidation

**Component tests** (`apps/frontend/src/__tests__/`):

- [ ] `pages/NotesPage.test.tsx`
  - [ ] AC-S1: renders note cards when notes exist
  - [ ] AC-S2: renders empty state when no notes
  - [ ] AC-S3: selecting one tag updates URL and re-fetches
  - [ ] AC-S4: selecting two tags updates URL with both tagId[] params
  - [ ] AC-S5: deselecting a tag removes it from URL and resets page to 1
  - [ ] AC-S6: changing sort dropdown updates sortBy/sortDir in URL and resets page to 1
  - [ ] AC-S7: clicking "Next" increments page param in URL
  - [ ] AC-S8: clicking "Prev" decrements page param; "Prev" disabled on page 1
  - [ ] AC-S14: skeleton placeholders shown while `useNotes` is loading
- [ ] `components/NoteCard.test.tsx`
  - [ ] AC-S10: clicking trash icon opens DeleteNoteDialog
  - [ ] AC-S11: cancelling DeleteNoteDialog makes no API call; card remains
- [ ] `components/Navbar.test.tsx`
  - [ ] AC-S13: clicking "Logout" calls `useLogout` and navigates to `/login`

**Checkpoint 5 (final):**

- [ ] `pnpm build` — 0 errors
- [ ] `pnpm --filter @noteapp/frontend lint`
- [ ] `pnpm --filter @noteapp/frontend test` — all green
- [ ] Frontend coverage ≥ 80% on new files
