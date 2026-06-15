# Tasks — AB-1013: Frontend — Search UI with highlights

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

Frontend-only ticket. Phases 1–5 cover implementation; Phase 6 covers tests.

---

## Phase 1 — MSW Mock Handler

- [ ] Open `apps/frontend/src/mocks/handlers.ts`
- [ ] Add `GET /api/search` handler after the existing `http.get("/api/tags", ...)` entry
  - Return `400 VALIDATION_ERROR` when `q` is missing or whitespace-only
  - Return `200` with `{ data: [{ ...mockNote, highlight: "The <mark>{q}</mark> appears in this note" }], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } }` otherwise
  - Reuse the existing `mockNote` object — no new mock data needed

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — `useSearch` Hook

- [ ] Create `apps/frontend/src/hooks/useSearch.ts`
- [ ] Define `ISearchPageResult` interface: `{ results: ISearchResult[]; meta: INotesPageMeta }`
- [ ] Implement `useSearch(query: TSearchQuery)` using `useQuery<ISearchPageResult>`
  - `queryKey: ["search", query]`
  - `queryFn`: build `URLSearchParams` with `q`, `page`, `limit`, `tagId[]` — call `GET /api/search`
  - `enabled: query.q.trim().length > 0` — no request fires for empty or whitespace queries
  - `throwOnError: false`
  - `meta.onError`: `toast.error(getErrorMessage(err))` — same pattern as `useNotes`
- [ ] Import types from `@noteapp/shared` only: `ISearchResult`, `INotesPageMeta`, `TSearchQuery`

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — `SearchResultCard` Component

- [ ] Create `apps/frontend/src/components/SearchResultCard.tsx`
- [ ] Accept props `{ result: ISearchResult; onDelete: (id: string) => void }`
- [ ] Card container: `role="button"`, `tabIndex={0}`, `onClick` → `navigate(`/notes/${result.id}`)`, keyboard handler for Enter/Space
- [ ] Render title in `<h3>` — same `line-clamp-1` style as `NoteCard`
- [ ] Render `highlight` via `dangerouslySetInnerHTML={{ __html: result.highlight }}` on a `<p>` element
  - Apply Tailwind variants to style `<mark>` tags: `[&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:text-yellow-900 dark:[&_mark]:bg-yellow-800 dark:[&_mark]:text-yellow-100`
  - Add ESLint suppression comment above the `dangerouslySetInnerHTML` prop
- [ ] Render tag `<Badge>` chips with color styling — same pattern as `NoteCard`
- [ ] Render `formatDate(result.updatedAt)` — copy `formatDate` helper from `NoteCard` or extract to `noteUtils.ts`
- [ ] Render trash `<button>` with `aria-label="Delete note"`, `e.stopPropagation()`, calls `onDelete(result.id)` — same style as `NoteCard`

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — `NotesPage` Search Integration

- [ ] Open `apps/frontend/src/pages/NotesPage.tsx`
- [ ] Add imports: `useSearch`, `SearchResultCard`, `Search` and `X` icons from `lucide-react`, `Input` from `@/components/ui/input`
- [ ] Add `import type { ISearchResult } from "@noteapp/shared"`
- [ ] Add `rawQuery` local state: `const [rawQuery, setRawQuery] = useState<string>(searchParams.get("q") ?? "")`
  - Initialise from `searchParams.get("q")` so a direct visit to `/notes?q=foo` pre-fills the input (S9)
- [ ] Add debounce `useEffect` on `rawQuery`:
  - `setTimeout(400)` writes trimmed value to `?q=` param (non-empty) or removes `?q=` (empty/whitespace)
  - When setting `?q=`, also set `?page=1`
  - When removing `?q=` (clear path), also set `?page=1` to prevent landing on a ghost page (R5 in plan)
  - Use `{ replace: true }` on `setSearchParams` to avoid history entries
  - Return `clearTimeout` cleanup
  - Exclude `searchParams` from the dependency array — only `rawQuery` drives the timer
- [ ] Read `q` from URL: `const q = searchParams.get("q") ?? ""`
- [ ] Derive `isSearchMode`: `const isSearchMode = q.trim().length > 0`
- [ ] Call `useSearch({ q, page, limit: 20, tagId: tagIds })` — always call (hook rules); `enabled` is internal to the hook
- [ ] Derive unified `notes`, `meta`, `isLoading` variables by branching on `isSearchMode`
- [ ] Replace the toolbar `<div>`:
  - Add search `<Input>` with `Search` icon prefix and conditional `X` clear button (shown when `rawQuery` is non-empty)
  - Wrap sort `<Select>` in `{!isSearchMode && ...}` — hidden during search mode (S14)
  - Keep "New Note" `<Button>` always visible
- [ ] Replace notes grid render:
  - When `isSearchMode`: render `<SearchResultCard result={note as ISearchResult} onDelete=... />`
  - When not `isSearchMode`: render `<NoteCard note={note} onDelete=... />` (existing)
- [ ] Replace empty state: when `isSearchMode && notes.length === 0`, show `"No notes match '{q}'"` with an inline "Clear search" button that calls `setRawQuery("")`
- [ ] Verify: `useNotes` is still always called (do not remove it); its result is unused while `isSearchMode` is true

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — `useDeleteNote` Cache Invalidation

- [ ] Open `apps/frontend/src/hooks/useDeleteNote.ts`
- [ ] In `onSuccess`, add `void queryClient.invalidateQueries({ queryKey: ["search"] })` after the existing `["notes"]` invalidation
  - The `["search"]` prefix busts all search cache entries regardless of query params

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Every row in the spec scenario table must have at least one test.

**Hook tests** (`apps/frontend/src/__tests__/hooks/`):

- [ ] `useSearch.test.ts`
  - [ ] AC-S1: Happy path — results returned with `highlight` field populated
  - [ ] AC-S3: No results — returns empty `results` array and `meta.total = 0`
  - [ ] AC-S5: Tag filter forwarded — `tagId[]` param present in request URL
  - [ ] AC-S6: Pagination forwarded — `page=2` present in request URL
  - [ ] AC-S10: Whitespace query — `enabled` is false; no HTTP request fires
  - [ ] AC-S13: VALIDATION_ERROR — API returns 400; `toast.error` called with server message

**Component tests** (`apps/frontend/src/__tests__/components/`):

- [ ] `SearchResultCard.test.tsx`
  - [ ] AC-S2: `<mark>` tags rendered as HTML — `dangerouslySetInnerHTML` produces `<mark>` element in DOM
  - [ ] AC-S2: `<mark>` element has amber background class applied
  - [ ] AC-S1: Card click — navigates to `/notes/:id`
  - [ ] AC-S12: Delete button click — calls `onDelete` with note id; does NOT navigate (`stopPropagation`)

**Page tests** (`apps/frontend/src/__tests__/pages/NotesPage.test.tsx` — extend existing file):

- [ ] AC-S1: Typing a query triggers `SearchResultCard` grid (NoteCard grid replaced)
- [ ] AC-S2: Highlight snippet visible in rendered `SearchResultCard`
- [ ] AC-S3: Search returns empty array — "No notes match" empty state shown with clear link
- [ ] AC-S4: Soft-deleted notes — only items returned by API are rendered; no extras visible
- [ ] AC-S7: Changing query resets `?page=` to `1` in URL
- [ ] AC-S8: Clearing input removes `?q=` from URL; `NoteCard` grid restored
- [ ] AC-S9: Initial URL `?q=foo` — input pre-filled and search results render on load
- [ ] AC-S10: Whitespace-only input — `?q=` not set; notes list remains visible
- [ ] AC-S11: Search pending — skeleton placeholders shown while `isLoading` is true
- [ ] AC-S12: Deleting a note from search results — `["search"]` query cache invalidated
- [ ] AC-S14: Sort `<Select>` is not in the DOM when `?q=` is set
- [ ] AC-S14: UNAUTHORIZED — 401 response triggers auth-store clear and redirect to `/login`

**Checkpoint 6 (final):**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on all new files
