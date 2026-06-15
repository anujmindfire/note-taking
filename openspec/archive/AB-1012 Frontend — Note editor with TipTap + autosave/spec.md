# Spec — AB-1012: Frontend — Note Editor with TipTap + Autosave

**Status:** Draft — awaiting approval
**Ticket:** AB-1012
**Branch:** feature/frontend/AB-1012-note-editor-autosave
**FRS References:** §4.2.1, §4.2.2, §4.2.3
**SDS References:** §3.2, §3.3
**Layer:** Frontend only
**Depends on:** AB-1011 (notes list page + all backend endpoints live)

---

## Summary

Implements the `/notes/:id` protected route — the full-screen note editor where authenticated users edit a note's title and body via TipTap (StarterKit, HTML output) with a 2-second debounced autosave persisting changes to `PATCH /api/notes/:id`. Includes a tag management panel (attach/detach existing tags), a save-status indicator, and a back button to `/notes`. Note cards on the list page become clickable to open the editor. `getContentPreview()` is updated to strip HTML before truncating.

---

## In Scope

- `/notes/:id` protected route added to `App.tsx`
- `NoteEditorPage` component: title input + TipTap canvas + tag panel + status bar + back button
- TipTap editor with `@tiptap/starter-kit` — Markdown input rules and keyboard shortcuts only; no visual toolbar
- Inline `<input>` for title above the editor; participates in autosave
- `useAutosave(noteId, title, content)` hook — 2s debounce, pending guard, change validation, retry-once (3s delay), "Save failed" persistent status on double failure
- `useNote(id)` hook — `useQuery` → `GET /api/notes/:id`
- `useUpdateNote()` hook — `useMutation` → `PATCH /api/notes/:id`
- Save-status indicator: `"Saving…"` / `"Saved"` / `"Save failed"`
- Tag panel: attached tags as removable chips; dropdown of user's unattached tags for adding
- `useAttachTag()` hook — `useMutation` → `POST /api/notes/:id/tags/:tagId`
- `useDetachTag()` hook — `useMutation` → `DELETE /api/notes/:id/tags/:tagId`
- `NoteCard` updated: card body is a clickable link navigating to `/notes/:id`; delete button uses `stopPropagation`
- `stripHtml(html)` helper added to `src/lib/noteUtils.ts`
- `getContentPreview()` updated to call `stripHtml()` before slicing
- MSW handlers extended for `GET /api/notes/:id`, `PATCH /api/notes/:id`, tag attach/detach

## Out of Scope

- Visual formatting toolbar (bold/italic/heading buttons) — keyboard shortcuts only this ticket
- Version history viewer from the editor
- Share link generation from the editor
- Tag CRUD (create, rename, delete tags) from the editor — only attach/detach existing tags
- `beforeunload` browser prompt for in-flight saves
- Conflict resolution for concurrent multi-tab editing
- Offline / IndexedDB caching
- Trash / restore UI

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | TipTap content is serialized as an HTML string via `editor.getHTML()` before sending to `PATCH /api/notes/:id`. The `content` column accepts any string, so no backend changes are needed. | Q1 |
| A2 | Title and content share the same 2s debounce cycle. Any change to either field resets the single timer; one `PATCH` request is sent carrying both the current `title` and `content`. | Q2 |
| A3 | The editor page has a "← Notes" back button that calls `navigate("/notes")`. No `beforeunload` guard is shown — the 2s autosave cadence is considered sufficient to prevent data loss. | Q3 |
| A4 | Tag attach and detach are independent of autosave. Each fires an immediate mutation; the autosave debounce is not reset by tag operations. | Q4 |
| A5 | On retry failure the status bar shows a persistent `"Save failed"` label. No manual retry button is provided. The next content change resets the debounce and attempts a fresh save automatically. | Q5 |
| A6 | If `GET /api/notes/:id` fails for any reason (404 `NOTE_NOT_FOUND`, network error, or 401), the user is redirected to `/notes` and a `toast.error` is shown. | Q6 |
| A7 | No visual formatting toolbar is rendered. `@tiptap/starter-kit` provides Markdown input rules (`## ` → heading, `**text**` → bold, `- ` → list) and standard keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+Z). | Q7 (blank → no toolbar) |
| A8 | On autosave success the TanStack Query cache entry `["note", id]` is updated via `queryClient.setQueryData()` rather than invalidated, to avoid a background refetch while the user is editing. | Architecture |
| A9 | "Change validation" compares the current `title + content` string pair against a `lastSavedRef` (set on initial load and on each successful save). If they match, the PATCH request is skipped. | SDS §3.3 constraint 2 |
| A10 | Latest-Write-Wins: a monotonically incrementing `saveCounterRef` is captured per-dispatch; the response handler checks the counter still matches before applying the saved note to state, discarding stale responses. | SDS §3.3 constraint 6 |
| A11 | `getContentPreview()` in `noteUtils.ts` is updated to strip HTML tags before slicing to 150 characters. Stripping is a no-op for legacy plain-text content, so existing note previews are unaffected. | Architecture |
| A12 | TipTap is initialized with `editor.commands.setContent(note.content, false)` (second arg `false` = emit no update event on init). This handles both legacy plain-text values (parsed as a paragraph node) and new HTML content. | Architecture |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Load note — happy path | Auth user navigates to `/notes/:id`; API returns the note | Page renders | Title input populated; TipTap editor initialized with note HTML; tag chips shown; status shows `"Saved"` | §4.2.2 AC3 | — |
| S2 | Note not found | Auth user navigates to `/notes/:id`; API returns 404 | Page renders | Redirect to `/notes`; `toast.error("Note not found")` shown | §4.2.2 AC3 | `NOTE_NOT_FOUND` |
| S3 | Loading state | `useNote` query is pending | Page renders | Skeleton placeholders shown for title and editor body | §4.2.2 | — |
| S4 | Edit title | User modifies the title `<input>` | 2 s elapses with no further change | `PATCH /api/notes/:id` sent with updated `title` + current `content`; status → `"Saving…"` then `"Saved"` | §4.2.3 AC1 | — |
| S5 | Edit content | User types in the TipTap editor | 2 s elapses with no further change | `PATCH /api/notes/:id` sent with current `title` + updated `content`; status → `"Saving…"` then `"Saved"`; cache updated via `setQueryData` | §4.2.3 AC1 | — |
| S6 | Edit title and content | User changes title then types in editor | 2 s after the last change | Single `PATCH` with both updated `title` and `content`; status → `"Saved"` | §4.2.3 AC1 | — |
| S7 | Rapid typing resets debounce | User types continuously | Keystroke within 2 s of the previous | Timer resets; no API call until 2 s of inactivity | SDS §3.3 constraint 1 | — |
| S8 | No-op save skipped | User focuses title input and blurs without changing text | 2 s elapses | No `PATCH` sent; status unchanged (content matches `lastSavedRef`) | SDS §3.3 constraint 2 | — |
| S9 | Pending guard — save postponed | First `PATCH` is in-flight | Content changes; 2 s elapses | Autosave deferred until the in-flight request resolves; then fires immediately | SDS §3.3 constraint 3 | — |
| S10 | Save failure → retry | `PATCH /api/notes/:id` returns network error | First save attempt fails | Status stays `"Saving…"`; retry dispatched after 3 s | SDS §3.3 constraint 5 | — |
| S11 | Retry succeeds | Retry request (after 3 s) succeeds | Response arrives | Status → `"Saved"`; `lastSavedRef` updated to new content | SDS §3.3 constraint 5 | — |
| S12 | Retry fails — persistent error | Retry request also errors | Response arrives with error | Status → `"Save failed"` (persistent label in status bar) | SDS §3.3 constraint 6 | — |
| S13 | Resume editing after save failed | Status bar shows `"Save failed"` | User types new content | Status label clears; debounce resets; fresh save fires after 2 s | A5 | — |
| S14 | Back navigation | User on `/notes/:id` | Clicks `"← Notes"` button | `navigate("/notes")` called | A3 | — |
| S15 | Attach tag | User opens tag panel; selects a tag from dropdown | Selection confirmed | `POST /api/notes/:id/tags/:tagId` fired; tag chip appears; `["note", id]` invalidated | §4.3.3 AC3 | — |
| S16 | Detach tag | User clicks `×` on an attached tag chip | Click registered | `DELETE /api/notes/:id/tags/:tagId` fired; chip removed; `["note", id]` invalidated | §4.3.3 AC2 | — |
| S17 | Attach already-attached tag | Tag is already on the note | User selects the same tag | Backend returns 200 (idempotent); tag list unchanged in UI | §4.3.3 | — |
| S18 | Tag not found on attach | `POST` returns 404 | Attach fires | `toast.error` shown; tag panel state unchanged | §4.3.3 | `TAG_NOT_FOUND` |
| S19 | Click NoteCard → open editor | User on `/notes` list | Clicks the body of a `NoteCard` | Navigates to `/notes/:id` | §4.2.2 AC1 | — |
| S20 | Delete button does not navigate | User on `/notes` list | Clicks the trash icon on a `NoteCard` | Delete dialog opens; no navigation occurs (`stopPropagation` prevents card click) | §4.2.4 AC1 | — |
| S21 | Unauthenticated request | Access token is missing or expired | Any API call in the editor fires | Existing `api.ts` 401 interceptor clears auth store → redirect to `/login` | §5.2 NFR 4 | `UNAUTHORIZED` |

---

## API Contract

No new API endpoints. This ticket consumes existing backend endpoints:

| Method | Path | Hook | Purpose | Success | Error codes |
|--------|------|------|---------|---------|-------------|
| GET | `/api/notes/:id` | `useNote` | Load note for editing | 200 `{ data: INoteResponse }` | `NOTE_NOT_FOUND`, `UNAUTHORIZED` |
| PATCH | `/api/notes/:id` | `useUpdateNote` / `useAutosave` | Autosave title + content | 200 `{ data: INoteResponse }` | `NOTE_NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHORIZED` |
| GET | `/api/tags` | `useTags` (existing) | Populate tag panel dropdown | 200 `{ data: ITagResponse[] }` | `UNAUTHORIZED` |
| POST | `/api/notes/:id/tags/:tagId` | `useAttachTag` | Attach tag to note | 200 `{ data: INoteResponse }` | `NOTE_NOT_FOUND`, `TAG_NOT_FOUND`, `UNAUTHORIZED` |
| DELETE | `/api/notes/:id/tags/:tagId` | `useDetachTag` | Detach tag from note | 200 `{ data: INoteResponse }` | `NOTE_NOT_FOUND`, `TAG_NOT_FOUND`, `UNAUTHORIZED` |

---

## Database Changes

None. Frontend-only ticket.

---

## Shared Package Changes

None. All required types and schemas already exist:

- `INoteResponse` — note shape including `tags: ITagResponse[]`
- `ITagResponse` — tag shape
- `TUpdateNoteInput` — `{ title?: string; content?: string }` (from `updateNoteSchema`)

---

## Architecture Notes

### New and modified file structure

```
apps/frontend/src/
├── pages/
│   └── NoteEditorPage.tsx          ← NEW: title input + TipTap + tag panel + status bar
├── hooks/
│   ├── useNote.ts                  ← NEW: useQuery["note", id] → GET /api/notes/:id
│   ├── useUpdateNote.ts            ← NEW: useMutation → PATCH /api/notes/:id
│   ├── useAutosave.ts              ← NEW: debounce + pending guard + retry logic
│   ├── useAttachTag.ts             ← NEW: useMutation → POST /api/notes/:id/tags/:tagId
│   └── useDetachTag.ts             ← NEW: useMutation → DELETE /api/notes/:id/tags/:tagId
├── components/
│   └── NoteCard.tsx                ← MODIFIED: card body wrapped in Link to /notes/:id
└── lib/
    └── noteUtils.ts                ← MODIFIED: add stripHtml(); update getContentPreview()
```

### App.tsx change

Add a protected `/notes/:id` route after the existing `/notes` route:

```tsx
<Route
  path="/notes/:id"
  element={<ProtectedRoute><NoteEditorPage /></ProtectedRoute>}
/>
```

### Hook signatures

```typescript
// hooks/useNote.ts
export function useNote(id: string): UseQueryResult<INoteResponse>
// queryKey: ["note", id]
// onError / on 404: navigate("/notes") + toast.error(...)

// hooks/useUpdateNote.ts
export function useUpdateNote(): UseMutationResult<INoteResponse, Error, { id: string } & TUpdateNoteInput>
// mutationFn: ({ id, ...body }) => api.patch(`/notes/${id}`, body).then(r => r.data.data)

// hooks/useAutosave.ts
export type SaveStatus = "idle" | "saving" | "saved" | "error"
export function useAutosave(
  noteId: string,
  title: string,
  content: string
): { saveStatus: SaveStatus }
// Debounce 2000 ms; pending guard via isPendingRef; change validation vs lastSavedRef;
// retry once after 3000 ms; sets saveStatus accordingly.

// hooks/useAttachTag.ts
export function useAttachTag(): UseMutationResult<INoteResponse, Error, { noteId: string; tagId: string }>
// onSuccess: queryClient.invalidateQueries({ queryKey: ["note", noteId] })
// onError: toast.error(getErrorMessage(err))

// hooks/useDetachTag.ts
export function useDetachTag(): UseMutationResult<INoteResponse, Error, { noteId: string; tagId: string }>
// onSuccess: queryClient.invalidateQueries({ queryKey: ["note", noteId] })
// onError: toast.error(getErrorMessage(err))
```

### Autosave state machine

```
idle
  └─[user changes title or content]──► debouncing

debouncing
  ├─[change within 2 s]──────────────► debouncing (timer reset)
  ├─[2 s elapsed, isPending=true]────► postponed (fires after current request resolves)
  ├─[2 s elapsed, content unchanged]─► idle (no-op)
  └─[2 s elapsed, isPending=false]───► saving

saving
  ├─[success]────────────────────────► saved (lastSavedRef updated; cache setQueryData)
  └─[failure]────────────────────────► retrying (setTimeout 3000 ms)

retrying
  ├─[success]────────────────────────► saved
  └─[failure]────────────────────────► error ("Save failed" shown)

error
  └─[user changes title or content]──► debouncing (status cleared)
```

### Content preview update

```typescript
// src/lib/noteUtils.ts
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

export function getContentPreview(content: string, maxLen = 150): string {
  const text = stripHtml(content).trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}
```

### NoteCard navigation

The card's outer `<div>` gains an `onClick` handler calling `navigate(`/notes/${note.id}`)`. The trash `<button>` calls `e.stopPropagation()` before invoking `onDelete` to prevent the click from bubbling up to the card.

Alternatively, wrap the card in `<Link>` and the trash button in a `<span onClick={e => { e.preventDefault(); onDelete(id) }}>`. Either approach satisfies S19 and S20.

### Tag panel design

Located below the editor canvas, above the status bar:

- Attached tags rendered as `<Badge>` chips, each with a `×` icon button wired to `useDetachTag`
- A `<Select>` (shadcn) populated from `useTags()`, filtered to exclude already-attached tag IDs; selecting a value calls `useAttachTag` and resets the select to its placeholder

### Test file plan

| File | Type | Scenarios covered |
|------|------|-------------------|
| `src/__tests__/hooks/useNote.test.ts` | Hook | S1, S2, S3 |
| `src/__tests__/hooks/useUpdateNote.test.ts` | Hook | S5 |
| `src/__tests__/hooks/useAutosave.test.ts` | Hook | S4–S13 |
| `src/__tests__/hooks/useAttachTag.test.ts` | Hook | S15, S17, S18 |
| `src/__tests__/hooks/useDetachTag.test.ts` | Hook | S16 |
| `src/__tests__/pages/NoteEditorPage.test.tsx` | Component | S1, S2, S3, S14, S21 |
| `src/__tests__/components/NoteCard.test.tsx` | Component (update) | S19, S20 |
