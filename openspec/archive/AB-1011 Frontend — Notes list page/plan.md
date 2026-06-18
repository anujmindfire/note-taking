# Plan — AB-1011: Frontend — Notes list page

**Based on spec:** openspec/archive/AB-1011 Frontend — Notes list page/spec.md
**Spec status:** Archived

---

## Overview

Implements the `/notes` dashboard: a protected page where authenticated users see all their non-deleted notes, filter by tag, sort, paginate, create new notes, and soft-delete notes from the list. Ships the persistent top `Navbar` (app name + user email + logout) and the left `TagSidebar` (multi-select tag filter with note counts) that appear on all future protected pages. Four TanStack Query hooks cover `GET /api/notes`, `GET /api/tags`, `POST /api/notes`, and `DELETE /api/notes/:id`. Filter, sort, and page state live entirely in URL search params. No database or shared-package changes.

---

## Phase 1 — UI Scaffold

Add shadcn/ui primitives and the content preview utility before any component depends on them.

### Files

| Action | File | What changes |
|--------|------|-------------|
| CREATE | `apps/frontend/src/components/ui/alert-dialog.tsx` | shadcn AlertDialog — wraps `@radix-ui/react-alert-dialog` |
| CREATE | `apps/frontend/src/components/ui/badge.tsx` | shadcn Badge — used for tag chips on NoteCard |
| CREATE | `apps/frontend/src/components/ui/select.tsx` | shadcn Select — used for sort dropdown |
| CREATE | `apps/frontend/src/components/ui/skeleton.tsx` | shadcn Skeleton — used for loading placeholders |
| CREATE | `apps/frontend/src/lib/noteUtils.ts` | Exports `getContentPreview` and `stripHtml` helpers |
| MODIFY | `apps/frontend/src/mocks/handlers.ts` | Add MSW handlers for `GET /api/notes`, `GET /api/tags`, `DELETE /api/notes/:id` |
| MODIFY | `apps/frontend/package.json` | Add `@radix-ui/react-alert-dialog`, `@radix-ui/react-select` if not already present |

### `noteUtils.ts` — exact shape

```typescript
export function stripHtml(html: string): string
// Strips HTML tags via regex, collapses whitespace, trims

export function getContentPreview(content: string, maxLen = 150): string
// Calls stripHtml, trims, returns first maxLen chars + "…" if longer
```

### MSW handler contract

```typescript
// GET /api/notes → { data: INoteResponse[], meta: INotesPageMeta }
// GET /api/tags  → { data: ITagResponse[] }
// DELETE /api/notes/:id → 204 no body
```

### Checkpoint 1

```bash
pnpm build
pnpm lint
```

---

## Phase 2 — TanStack Query Hooks

All hooks import types exclusively from `@noteapp/shared`.

### Files

| Action | File | What changes |
|--------|------|-------------|
| CREATE | `apps/frontend/src/hooks/useNotes.ts` | `useQuery(["notes", query])` → `GET /api/notes` |
| CREATE | `apps/frontend/src/hooks/useTags.ts` | `useQuery(["tags"])` → `GET /api/tags` |
| CREATE | `apps/frontend/src/hooks/useCreateNote.ts` | `useMutation` → `POST /api/notes` → navigate to `/notes/:id` |
| CREATE | `apps/frontend/src/hooks/useDeleteNote.ts` | `useMutation` → `DELETE /api/notes/:id` → invalidate + toast |

### Hook signatures — exact shapes

```typescript
// hooks/useNotes.ts
interface INotesResult {
  notes: INoteResponse[];
  meta: INotesPageMeta;
}
export function useNotes(query: TListNotesQuery): UseQueryResult<INotesResult>
// queryKey: ["notes", query]
// queryFn: serialises query to URLSearchParams, sends GET /notes?...
// throwOnError: false; meta.onError: toast.error(getErrorMessage(err))

// hooks/useTags.ts
export function useTags(): UseQueryResult<ITagResponse[]>
// queryKey: ["tags"]
// queryFn: GET /tags → unwraps res.data.data

// hooks/useCreateNote.ts
export function useCreateNote(): UseMutationResult<INoteResponse, Error, TCreateNoteInput>
// mutationFn: POST /notes → unwraps res.data.data
// onSuccess: navigate(`/notes/${note.id}`)
// onError: toast.error(getErrorMessage(err))

// hooks/useDeleteNote.ts
export function useDeleteNote(): UseMutationResult<void, Error, string>
// mutationFn: (noteId: string) => DELETE /notes/${noteId} → returns undefined
// onSuccess: invalidateQueries(["notes"]) + invalidateQueries(["search"]) + toast.success("Note deleted")
// onError: toast.error(getErrorMessage(err))
```

Note: `useDeleteNote` additionally invalidates the `["search"]` query key (present because of the search feature added in a later ticket; does not conflict with AB-1011 scope).

### Checkpoint 2

```bash
pnpm build
pnpm lint
```

---

## Phase 3 — Page Components

### Files

| Action | File | What changes |
|--------|------|-------------|
| CREATE | `apps/frontend/src/components/Navbar.tsx` | Fixed top bar: app name, user email from Zustand, Logout button |
| CREATE | `apps/frontend/src/components/TagSidebar.tsx` | Left sidebar: tag list, multi-select filter, note count badge |
| CREATE | `apps/frontend/src/components/NoteCard.tsx` | Card: title, content preview, tag chips, formatted date, trash icon |
| CREATE | `apps/frontend/src/components/DeleteNoteDialog.tsx` | AlertDialog wrapping `useDeleteNote` mutation |
| CREATE | `apps/frontend/src/pages/NotesPage.tsx` | Top-level page: URL param state, layout wiring, pagination |

### Component prop interfaces — exact shapes

```typescript
// Navbar.tsx — no props; reads from authStore internally
export function Navbar(): JSX.Element

// TagSidebar.tsx
interface TagSidebarProps {
  selectedTagIds: string[];
  onToggle: (id: string) => void;
}
export function TagSidebar({ selectedTagIds, onToggle }: TagSidebarProps): JSX.Element

// NoteCard.tsx
interface NoteCardProps {
  note: INoteResponse;
  onDelete: (id: string) => void;
}
export function NoteCard({ note, onDelete }: NoteCardProps): JSX.Element

// DeleteNoteDialog.tsx
interface DeleteNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noteId: string | null;
  noteTitle: string;
}
export function DeleteNoteDialog(props: DeleteNoteDialogProps): JSX.Element
```

### URL search params strategy

```typescript
// NotesPage.tsx
const [searchParams, setSearchParams] = useSearchParams();
const page    = Number(searchParams.get("page") ?? "1");
const sortBy  = (searchParams.get("sortBy") ?? "updatedAt") as "updatedAt" | "createdAt";
const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";
const tagIds  = searchParams.getAll("tagId");   // bare "tagId" key, not "tagId[]"
```

### Key behaviour wiring in NotesPage

- `handleTagToggle(id)`: reads existing `tagIds`, toggles presence, rewrites all `tagId` params, resets `page=1`
- `handleSortChange(value)`: splits composite key `"updatedAt-desc"` on `-`, writes `sortBy`/`sortDir`, resets `page=1`
- `handlePageChange(next)`: writes `page=next` only
- `deletingNoteId` / `deletingNoteTitle`: local `useState` pair controlling `DeleteNoteDialog`
- Empty state: `"No notes yet. Create your first note."` with inline New Note button
- Loading state: 6× `<Skeleton className="h-36 w-full rounded-lg" />` in a 3-column grid
- `DeleteNoteDialog` closes in `onSettled` (fires on both success and error)

### Checkpoint 3

```bash
pnpm build
pnpm lint
```

---

## Phase 4 — App Wiring

### Files

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `apps/frontend/src/App.tsx` | Replace `/notes` placeholder with `<NotesPage />` |

### Checkpoint 4

```bash
pnpm build
pnpm lint
```

---

## Phase 5 — Tests

Delegated to test-writer agent. Every spec scenario row must have a named test `AC-{id}: {scenario name}`.

### Test files

| File | Type | Spec scenarios covered |
|------|------|----------------------|
| `apps/frontend/src/__tests__/hooks/useNotes.test.ts` | Hook unit (MSW) | S1, S2, S15 |
| `apps/frontend/src/__tests__/hooks/useTags.test.ts` | Hook unit (MSW) | S1 (sidebar data) |
| `apps/frontend/src/__tests__/hooks/useCreateNote.test.ts` | Hook unit (MSW) | S9 |
| `apps/frontend/src/__tests__/hooks/useDeleteNote.test.ts` | Hook unit (MSW) | S10, S12 |
| `apps/frontend/src/__tests__/pages/NotesPage.test.tsx` | Component (RTL) | S1, S2, S3, S4, S5, S6, S7, S8, S14 |
| `apps/frontend/src/__tests__/components/NoteCard.test.tsx` | Component (RTL) | S10, S11 |
| `apps/frontend/src/__tests__/components/Navbar.test.tsx` | Component (RTL) | S13 |

### Checkpoint 5 (final)

```bash
pnpm build
pnpm lint
pnpm test
# Coverage ≥ 80% on all new files
```

---

## Checkpoints Summary

| # | Gate | After |
|---|------|-------|
| 1 | `pnpm build && pnpm lint` | UI scaffold + MSW handlers |
| 2 | `pnpm build && pnpm lint` | All four hooks |
| 3 | `pnpm build && pnpm lint` | All five components + page |
| 4 | `pnpm build && pnpm lint` | App.tsx wiring |
| 5 | `pnpm build && pnpm lint && pnpm test` | Final — all tests green, coverage ≥ 80% |

---

## Risks & Assumptions

| # | Risk / Assumption | Mitigation |
|---|------------------|-----------|
| R1 | Spec says `tagId[]` as the URL param key; implementation uses bare `tagId` (repeated) throughout `NotesPage`, `handleTagToggle`, and `useNotes`. Backend `listNotesQuerySchema` already handles repeated bare `tagId` via the `z.union` transform | Verify backend `GET /api/notes` accepts repeated `tagId` before integration testing |
| R2 | `getContentPreview` strips HTML before truncating — not described in spec A1 but necessary because the note editor (AB-1012) stores HTML content; plain truncation would produce broken markup in previews | Correct behaviour; flag to spec author for A1 wording update |
| R3 | `useNotes` uses `throwOnError: false` with `meta.onError` — TanStack Query v5 requires `QueryCache` `onError` to fire `meta.onError` callbacks. Verify `main.tsx` wires `QueryCache` `onError` correctly | Read `apps/frontend/src/main.tsx` and confirm `QueryCache` `onError` reads `meta.onError` |
| R4 | `NotesPage` imports `useSearch` and `SearchResultCard` (search feature added in a later ticket) — these must exist when AB-1011 is implemented in isolation | Confirm search-related files exist in the branch before starting Phase 3, or stub them |
| R5 | `TagSidebar` includes `TagCreateDialog` (tag CRUD from AB-1016) — out of scope for AB-1011 but must compile | Confirm `TagCreateDialog` exists in the branch or stub it with an empty export |
| R6 | Pagination controls only appear when `meta.totalPages > 1`; "Prev" disabled on page 1 is only testable when `totalPages >= 2`; MSW must return appropriate `meta` values per scenario | Ensure test MSW overrides return appropriate `meta` values |
