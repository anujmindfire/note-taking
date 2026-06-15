# Spec — AB-1011: Frontend — Notes List Page

**Status:** Draft — awaiting approval
**Ticket:** AB-1011
**Branch:** feature/frontend/AB-1011-notes-list-page
**FRS References:** §4.2.2, §4.2.4, §4.1.3
**SDS References:** §3.1, §3.2
**Layer:** Frontend only
**Depends on:** AB-1010 (auth pages + frontend scaffold), AB-1009 (all backend endpoints)

---

## Summary

Implements the `/notes` dashboard: a protected page where authenticated users see all their
non-deleted notes, filter by tags, sort, paginate, create new notes, and delete notes from
the list. Also adds the persistent top navbar (user email + logout button) and the left tag
sidebar — both of which appear on all future protected pages. Four new TanStack Query hooks
cover `GET /api/notes`, `GET /api/tags`, `POST /api/notes`, and `DELETE /api/notes/:id`.

---

## In Scope

- Top `Navbar` component: app name/logo, authenticated user's email, logout button
- Left `TagSidebar` component: lists all user tags with note counts; multi-select tag filter
- `NoteCard` component: title, 150-char content preview, tag chips, updated date, delete icon
- `DeleteNoteDialog` component: AlertDialog confirmation before soft-delete
- `NotesPage` layout wiring sidebar + main content area
- Sort controls dropdown: Recently updated / Least recently updated / Newest created / Oldest created
- Numbered pagination controls (prev/next + page X of N display)
- Empty state when no notes exist
- Loading skeleton placeholders while fetching
- `useNotes(query)` — `useQuery` → `GET /api/notes`
- `useTags()` — `useQuery` → `GET /api/tags`
- `useCreateNote()` — `useMutation` → `POST /api/notes` → navigate to `/notes/:id`
- `useDeleteNote()` — `useMutation` → `DELETE /api/notes/:id`
- Filter/sort/page state stored in URL search params for bookmarkability
- New shadcn/ui components: `alert-dialog.tsx`, `badge.tsx`, `skeleton.tsx`, `select.tsx`
- `src/lib/noteUtils.ts` — `getContentPreview()` helper
- `App.tsx` updated: replace `/notes` placeholder with `<NotesPage />`
- MSW handlers extended for new endpoints

## Out of Scope

- Note editor / `/notes/:id` page (next ticket)
- Tag CRUD from the notes list (create, rename, delete tags)
- Search UI (separate ticket)
- Share links UI (separate ticket)
- Version history UI (separate ticket)
- Infinite scroll or "load more" pagination
- Page size selector (fixed at 20)
- Trash / soft-deleted notes view
- Drag-and-drop reordering

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | Content preview: first 150 characters of the `content` string, trimmed, appended with "…" if longer. Empty content shows no preview line. | Q1 answer |
| A2 | Pagination uses numbered prev/next controls. Page size is fixed at 20 (backend default). No UI control to change limit. | Q2 answer |
| A3 | Tag sidebar shows all tags from `GET /api/tags` (default sort: name asc). Multi-select by clicking; clicking a selected tag deselects it. | Q3 answer |
| A4 | "New Note" button immediately calls `POST /api/notes` with `{ title: "Untitled", content: "" }` then navigates to `/notes/:id`. No modal. | Q4 answer |
| A5 | Note cards expose a delete (trash) icon. Clicking it opens an AlertDialog. Confirming calls `DELETE /api/notes/:id` and invalidates the notes query. | Q5 answer |
| A6 | Sort dropdown has four options mapping to `{ sortBy, sortDir }`: "Recently updated" (`updatedAt desc`, default), "Least recently updated" (`updatedAt asc`), "Newest created" (`createdAt desc`), "Oldest created" (`createdAt asc`). | Q6 answer |
| A7 | Navbar is a fixed top bar rendered inside the `/notes` protected layout. It shows the app name, the authenticated user's email (from Zustand `authStore`), and a Logout button wired to `useLogout` from AB-1010. | Q7 answer |
| A8 | Filter state (page, sortBy, sortDir, tagId[]) lives in URL search params via `useSearchParams`. Direct URL access with params produces the correct filtered view. | Architecture |
| A9 | Multi-tag filtering passes all selected tag UUIDs as `?tagId[]=uuid1&tagId[]=uuid2`. The backend applies AND semantics (notes must have ALL selected tags). | Existing backend schema |
| A10 | `useCreateNote` on success navigates to `/notes/:id` and does NOT invalidate the notes list cache (the user is leaving the page). | Architecture |
| A11 | `useDeleteNote` on success: invalidates `["notes"]` query key and shows `toast.success("Note deleted")`. On error: shows `toast.error(getErrorMessage(err))`. | Architecture |
| A12 | `useTags` query key is `["tags"]`. `useNotes` query key is `["notes", query]` so any param change triggers a fresh fetch. | Architecture |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Load notes — notes exist | Authenticated user on `/notes`, API returns ≥1 notes | Page loads | Note cards rendered; pagination controls shown; tag sidebar populated | §4.2.2 AC1 | — |
| S2 | Load notes — empty state | Authenticated user, `GET /api/notes` returns `data: []` | Page loads | Empty state shown: "No notes yet. Create your first note." with "New Note" button | §4.2.2 AC1 | — |
| S3 | Filter by one tag | User clicks a tag in the sidebar | Tag selected (highlighted) | URL updated `?tagId[]=uuid`; re-fetch with filter; only matching notes shown | §4.2.2 AC1 | — |
| S4 | Filter by multiple tags | User clicks two tags in sidebar | Both tags selected | URL `?tagId[]=uuid1&tagId[]=uuid2`; notes having both tags shown | §4.2.2 AC1 | — |
| S5 | Clear tag filter | User clicks an already-selected tag | Tag deselected | Tag removed from URL; page resets to 1; unfiltered list shown | §4.2.2 AC1 | — |
| S6 | Change sort | User selects "Oldest created" from sort dropdown | Sort applied | URL updated `?sortBy=createdAt&sortDir=asc&page=1`; re-fetched | §4.2.2 AC1 | — |
| S7 | Paginate forward | User on page 1, clicks "Next" | Page advances | URL `?page=2`; page 2 notes fetched and rendered | §4.2.2 AC1 | — |
| S8 | Paginate backward | User on page 2, clicks "Prev" | Page decreases | URL `?page=1`; page 1 notes shown; "Prev" disabled on page 1 | §4.2.2 AC1 | — |
| S9 | Create new note | User clicks "New Note" | `POST /api/notes` with `{ title: "Untitled", content: "" }` | On success: navigate to `/notes/:id`; on error: `toast.error` shown | §4.2.1 AC1 | — |
| S10 | Delete note — confirm | User clicks trash icon; AlertDialog opens; user confirms | `DELETE /api/notes/:id` called | Note removed from list; `toast.success("Note deleted")`; notes query invalidated | §4.2.4 AC1 | — |
| S11 | Delete note — cancel | User clicks trash icon; AlertDialog opens; user cancels | No API call | Dialog closes; note remains in list | §4.2.4 AC1 | — |
| S12 | Delete note — API error | `DELETE /api/notes/:id` returns error | Confirm clicked | `toast.error` with API error message; note stays; dialog closes | §4.2.4 AC1 | `NOTE_NOT_FOUND` |
| S13 | Logout from navbar | User clicks "Logout" in navbar | `useLogout` mutation fires | `POST /api/auth/logout` → auth store cleared → navigate to `/login` | §4.1.3 AC1, AC3 | — |
| S14 | Loading state | `useNotes` query is pending | Page first renders | Skeleton placeholders shown in place of note cards | §4.2.2 | — |
| S15 | Notes fetch error | `GET /api/notes` returns network/API error | Page loads | `toast.error` shown with error message; empty list displayed | §4.2.2 | — |

---

## API Contract

No new API endpoints. This ticket consumes existing backend endpoints:

| Method | Path | Hook | Query Params | Success | Error codes handled |
|--------|------|------|-------------|---------|---------------------|
| GET | `/api/notes` | `useNotes` | `page`, `limit`, `sortBy`, `sortDir`, `tagId[]` | 200 `{ data: INoteResponse[], meta: INotesPageMeta }` | `UNAUTHORIZED` |
| GET | `/api/tags` | `useTags` | — | 200 `{ data: ITagResponse[] }` | `UNAUTHORIZED` |
| POST | `/api/notes` | `useCreateNote` | — | 201 `{ data: INoteResponse }` | `VALIDATION_ERROR` |
| DELETE | `/api/notes/:id` | `useDeleteNote` | — | 204 (no body) | `NOTE_NOT_FOUND`, `UNAUTHORIZED` |

---

## Database Changes

None. Frontend-only ticket.

---

## Shared Package Changes

None. All required types (`INoteResponse`, `ITagResponse`, `INotesPageMeta`), Zod schemas
(`createNoteSchema`, `listNotesQuerySchema`), and error codes are already defined.

---

## Architecture Notes

### New file structure

```
apps/frontend/src/
├── pages/
│   └── NotesPage.tsx                 sidebar + main content layout
├── components/
│   ├── Navbar.tsx                    logo | user email | logout button
│   ├── TagSidebar.tsx                tag list, multi-select filter
│   ├── NoteCard.tsx                  title, preview, tags, date, delete icon
│   ├── DeleteNoteDialog.tsx          AlertDialog wrapping useDeleteNote
│   └── ui/
│       ├── alert-dialog.tsx          shadcn AlertDialog (new)
│       ├── badge.tsx                 shadcn Badge (new, for tag chips)
│       ├── select.tsx                shadcn Select (new, for sort dropdown)
│       └── skeleton.tsx              shadcn Skeleton (new, for loading state)
└── hooks/
    ├── useNotes.ts                   useQuery["notes", query] → GET /api/notes
    ├── useTags.ts                    useQuery["tags"] → GET /api/tags
    ├── useCreateNote.ts              useMutation → POST /api/notes → navigate /notes/:id
    └── useDeleteNote.ts              useMutation → DELETE /api/notes/:id → invalidate + toast
```

### URL search params strategy

```typescript
// URL: /notes?page=2&sortBy=updatedAt&sortDir=desc&tagId[]=uuid1&tagId[]=uuid2
const [searchParams, setSearchParams] = useSearchParams();
const page    = Number(searchParams.get("page") ?? "1");
const sortBy  = (searchParams.get("sortBy") ?? "updatedAt") as "updatedAt" | "createdAt";
const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";
const tagIds  = searchParams.getAll("tagId[]");
```

Changing any filter resets `page` to 1 via `setSearchParams`.

### Hook shapes

```typescript
// hooks/useNotes.ts
export function useNotes(query: TListNotesQuery):
  UseQueryResult<{ notes: INoteResponse[]; meta: INotesPageMeta }>

// hooks/useTags.ts
export function useTags(): UseQueryResult<ITagResponse[]>

// hooks/useCreateNote.ts
export function useCreateNote(): UseMutationResult<INoteResponse, Error, TCreateNoteInput>
// onSuccess: navigate("/notes/:id")
// onError: toast.error(getErrorMessage(err))

// hooks/useDeleteNote.ts
export function useDeleteNote(): UseMutationResult<void, Error, string>
// mutationFn: (noteId: string) => api.delete(`/notes/${noteId}`)
// onSuccess: queryClient.invalidateQueries(["notes"]) + toast.success("Note deleted")
// onError: toast.error(getErrorMessage(err))
```

### Content preview helper

```typescript
// src/lib/noteUtils.ts (new)
export function getContentPreview(content: string, maxLen = 150): string {
  const trimmed = content.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen).trimEnd() + "…";
}
```

### App.tsx change

Replace the `/notes` placeholder route element with `<NotesPage />`.

### Test file plan

| File | Type | Scenarios |
|------|------|-----------|
| `src/__tests__/hooks/useNotes.test.ts` | Hook unit | S1, S2, S15 |
| `src/__tests__/hooks/useTags.test.ts` | Hook unit | S1 (sidebar data) |
| `src/__tests__/hooks/useCreateNote.test.ts` | Hook unit | S9 |
| `src/__tests__/hooks/useDeleteNote.test.ts` | Hook unit | S10, S12 |
| `src/__tests__/pages/NotesPage.test.tsx` | Component | S1, S2, S3, S4, S5, S6, S7, S8, S14 |
| `src/__tests__/components/NoteCard.test.tsx` | Component | S10, S11 |
| `src/__tests__/components/Navbar.test.tsx` | Component | S13 |
