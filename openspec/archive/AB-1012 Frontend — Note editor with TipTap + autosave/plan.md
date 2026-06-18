# Plan — AB-1012: Frontend — Note editor with TipTap + autosave

**Based on spec:** openspec/archive/AB-1012 Frontend — Note editor with TipTap + autosave/spec.md
**Spec status:** Archived

---

## Overview

Implements the `/notes/:id` protected route — a full-screen note editor where authenticated users edit a note's title (inline `<input>`) and body (TipTap `StarterKit`, HTML output) with a 2-second debounced autosave that persists changes to `PATCH /api/notes/:id`. Includes a tag management panel (attach/detach existing tags via `useAttachTag` / `useDetachTag`), a save-status indicator (`"Saving…"` / `"Saved"` / `"Save failed"`), and a back button to `/notes`. `NoteCard` becomes clickable to open the editor. `getContentPreview()` is updated to strip HTML before truncating via a new `stripHtml()` helper. No new backend endpoints or shared-package types are introduced.

---

## Dependencies

| Package | Version installed |
|---------|------------------|
| `@tiptap/react` | 2.10.3 |
| `@tiptap/pm` | 2.10.3 |
| `@tiptap/starter-kit` | 2.10.3 |

All three packages live in `apps/frontend/package.json` under `dependencies`.

---

## Phase 1 — TipTap Dependencies

### Files

| Action | File | What changes |
|--------|------|--------------|
| MODIFY | `apps/frontend/package.json` | Add `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` at `2.10.3` |

### Checkpoint 1

```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 2 — Utilities (`noteUtils.ts`)

### Files

| Action | File | What changes |
|--------|------|--------------|
| MODIFY | `apps/frontend/src/lib/noteUtils.ts` | Add `stripHtml()`; update `getContentPreview()` to call it |

### `stripHtml` — exact shape

```typescript
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
```

### `getContentPreview` — exact shape

```typescript
export function getContentPreview(content: string, maxLen = 150): string {
  const text = stripHtml(content).trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}
```

### Checkpoint 2

```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 3 — Hooks

### Files

| Action | File | What changes |
|--------|------|--------------|
| CREATE | `apps/frontend/src/hooks/useNote.ts` | `useQuery` → `GET /api/notes/:id` |
| CREATE | `apps/frontend/src/hooks/useUpdateNote.ts` | `useMutation` → `PATCH /api/notes/:id` |
| CREATE | `apps/frontend/src/hooks/useAutosave.ts` | Debounce + pending guard + retry + `initLastSaved` |
| CREATE | `apps/frontend/src/hooks/useAttachTag.ts` | `useMutation` → `POST /api/notes/:id/tags/:tagId` |
| CREATE | `apps/frontend/src/hooks/useDetachTag.ts` | `useMutation` → `DELETE /api/notes/:id/tags/:tagId` |

### `useNote` — exact shape

```typescript
export function useNote(id: string): UseQueryResult<INoteResponse>
// queryKey: ["note", id]
// queryFn: api.get<{ data: INoteResponse }>(`/notes/${id}`).then(r => r.data.data)
// retry: false
// Error navigation (toast + navigate("/notes")) is handled in NoteEditorPage via a useEffect
// watching isError — NOT inside the hook
```

### `useUpdateNote` — exact shape

```typescript
type UpdateNoteVars = { id: string } & TUpdateNoteInput;

export function useUpdateNote(): UseMutationResult<INoteResponse, Error, UpdateNoteVars>
// mutationFn: ({ id, ...body }) =>
//   api.patch<{ data: INoteResponse }>(`/notes/${id}`, body).then(r => r.data.data)
```

Note: `useAutosave` calls `api.patch` directly. `useUpdateNote` exists as a standalone mutation hook for test coverage purposes.

### `useAutosave` — exact shape

```typescript
// SaveStatus is imported from @noteapp/shared, not defined locally
export type SaveStatus = "idle" | "saving" | "saved" | "error"

export function useAutosave(
  noteId: string,
  title: string,
  content: string
): { saveStatus: SaveStatus; initLastSaved: (t: string, c: string) => void }
```

Internal constants and refs:

| Identifier | Value / Type | Purpose |
|-----------|------|---------|
| `DEBOUNCE_MS` | `2000` | Debounce delay before PATCH fires |
| `RETRY_DELAY_MS` | `3000` | Retry delay after first failure |
| `lastSavedRef` | `{ title: string; content: string } \| null` | Baseline; `null` until `initLastSaved` called |
| `isPendingRef` | `boolean` | Blocks concurrent saves |
| `saveCounterRef` | `number` | Latest-Write-Wins monotonic counter |
| `debounceTimerRef` | `ReturnType<typeof setTimeout> \| null` | Debounce timer handle |
| `retryTimerRef` | `ReturnType<typeof setTimeout> \| null` | Retry timer handle |
| `pendingAfterSaveRef` | `boolean` | Deferred re-save flag set during in-flight request |
| `titleRef` / `contentRef` | `string` refs | Latest values for async callbacks (stale closure prevention) |
| `saveStatusRef` | `SaveStatus` ref | Mirror of state; read in debounce effect without adding to deps |

Key behaviours:

- `initLastSaved(t, c)`: sets `lastSavedRef` when null; sets status to `"saved"`. Called from `NoteEditorPage` after both editor and note data are ready.
- Debounce effect early-return guard: `if (lastSavedRef.current === null) return` — suppresses fires before `initLastSaved` is called.
- On first-attempt failure: retry via `setTimeout(RETRY_DELAY_MS)`; `isPendingRef` remains `true` during wait.
- On success: `queryClient.setQueryData<INoteResponse>(["note", noteId], updated)` — cache update, not invalidation.
- On `"error"` state + user types: `saveStatusRef.current` (not state) checked to reset status without causing an extra effect re-run.

### `useAttachTag` — exact shape

```typescript
type AttachTagVars = { noteId: string; tagId: string };

export function useAttachTag(): UseMutationResult<INoteResponse, Error, AttachTagVars>
// mutationFn: ({ noteId, tagId }) =>
//   api.post<{ data: INoteResponse }>(`/notes/${noteId}/tags/${tagId}`).then(r => r.data.data)
// onSuccess: queryClient.invalidateQueries({ queryKey: ["note", noteId] })
// onError: toast.error(getErrorMessage(err))
```

### `useDetachTag` — exact shape

```typescript
type DetachTagVars = { noteId: string; tagId: string };

export function useDetachTag(): UseMutationResult<INoteResponse, Error, DetachTagVars>
// mutationFn: ({ noteId, tagId }) =>
//   api.delete<{ data: INoteResponse }>(`/notes/${noteId}/tags/${tagId}`).then(r => r.data.data)
// onSuccess: queryClient.invalidateQueries({ queryKey: ["note", noteId] })
// onError: toast.error(getErrorMessage(err))
```

### Checkpoint 3

```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 4 — `NoteEditorPage` Component

### Files

| Action | File | What changes |
|--------|------|--------------|
| CREATE | `apps/frontend/src/pages/NoteEditorPage.tsx` | Full-screen editor page |

### State and refs

| Identifier | Kind | Purpose |
|-----------|------|---------|
| `id` | `useParams<{ id: string }>()` | Route param; non-null assertion safe — only mounted under `/notes/:id` |
| `title` | `useState("")` | Controlled title input |
| `content` | `useState("")` | HTML string from `editor.getHTML()` |
| `initializedRef` | `useRef(false)` | Prevents double-init when note and editor both become ready |
| `shareOpen` | `useState(false)` | `ShareModal` open state (added by AB-1014) |
| `historyOpen` | `useState(false)` | `VersionHistoryDrawer` open state (added by AB-1015) |

### Hooks called

1. `useNote(id!)` — `{ data: note, isLoading, isError, error }`
2. `useAutosave(id!, title, content)` — `{ saveStatus, initLastSaved }`
3. `useAttachTag()`, `useDetachTag()`, `useTags()`
4. `useEditor({ extensions: [StarterKit], content: "", immediatelyRender: false, onUpdate })` — `onUpdate` calls `setContent(e.getHTML())`

### Key `useEffect` hooks

- **Error effect** `[isError, error, navigate]`: calls `toast.error(getErrorMessage(error))` then `navigate("/notes")` when `isError` is true
- **Init effect** `[note, editor, initLastSaved]`: fires once when both `note` and `editor` are truthy and `initializedRef.current === false`; calls `editor.commands.setContent(note.content, false)`, reads back `editor.getHTML()`, sets `title`, `content`, then `initLastSaved(note.title, initialHtml)`

### Status label derivation

```typescript
const statusLabel =
  saveStatus === "saving" ? "Saving…"    :
  saveStatus === "saved"  ? "Saved"       :
  saveStatus === "error"  ? "Save failed" :
  null;
// "error" renders with text-destructive class; others with text-muted-foreground
```

### `handleRestore(note: INoteResponse)` — for VersionHistoryDrawer

```typescript
function handleRestore(note: INoteResponse) {
  setTitle(note.title);
  editor?.commands.setContent(note.content, false);
  initLastSaved(note.title, note.content);
}
```

### Loading state

- Title: `<Skeleton className="h-6 w-48" />` while `isLoading`
- Editor: three `<Skeleton>` lines (`h-4 w-full`, `h-4 w-5/6`, `h-4 w-4/6`) while `isLoading`

### Checkpoint 4

```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 5 — `NoteCard` Update + Routing

### Files

| Action | File | What changes |
|--------|------|--------------|
| MODIFY | `apps/frontend/src/components/NoteCard.tsx` | Card body becomes clickable via `navigate`; trash calls `e.stopPropagation()` |
| MODIFY | `apps/frontend/src/App.tsx` | Add `/notes/:id` protected route |

### `App.tsx` route addition

```tsx
<Route
  path="/notes/:id"
  element={<ProtectedRoute><NoteEditorPage /></ProtectedRoute>}
/>
```

Placed before the wildcard `path="*"` route, after the existing `/notes` route.

### Checkpoint 5

```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 6 — MSW Handlers

### Files

| Action | File | What changes |
|--------|------|--------------|
| MODIFY | `apps/frontend/src/mocks/handlers.ts` | Add four new handlers |

### New handlers

| Method | Path pattern | Response |
|--------|-------------|----------|
| GET | `/api/notes/:id` | `{ data: INoteResponse }` with `tags: []` |
| PATCH | `/api/notes/:id` | `{ data: INoteResponse }` reflecting request body |
| POST | `/api/notes/:id/tags/:tagId` | `{ data: INoteResponse }` with tag appended |
| DELETE | `/api/notes/:id/tags/:tagId` | `{ data: INoteResponse }` with tag removed |

### Checkpoint 6

```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 7 — Tests

### Files

| Action | File | Scenarios covered |
|--------|------|------------------|
| CREATE | `apps/frontend/src/__tests__/hooks/useNote.test.ts` | S1, S2, S3 |
| CREATE | `apps/frontend/src/__tests__/hooks/useUpdateNote.test.ts` | S5 |
| CREATE | `apps/frontend/src/__tests__/hooks/useAutosave.test.ts` | S4–S13 |
| CREATE | `apps/frontend/src/__tests__/hooks/useAttachTag.test.ts` | S15, S17, S18 |
| CREATE | `apps/frontend/src/__tests__/hooks/useDetachTag.test.ts` | S16 |
| CREATE | `apps/frontend/src/__tests__/pages/NoteEditorPage.test.tsx` | S1, S2, S3, S14, S21 |
| MODIFY | `apps/frontend/src/__tests__/components/NoteCard.test.tsx` | S19, S20 |

### Autosave test notes

- Use `vi.useFakeTimers()` and `vi.advanceTimersByTimeAsync(2000)` to trigger debounce
- Use `vi.advanceTimersByTimeAsync(3000)` to trigger retry
- Mock `api.patch` via `vi.spyOn` or MSW handler to simulate success / network error
- S9 (pending guard): requires two rapid fires with first request still awaiting — use a promise that resolves after timer advances

### Checkpoint 7 (final)

```bash
pnpm build
pnpm lint --max-warnings 0
pnpm test
# Coverage ≥ 80% on all new files
```

---

## Autosave State Machine

```
idle
  └─[initLastSaved called]──────────────► saved (baseline set)

saved / idle
  └─[title or content changes]──────────► debouncing

debouncing
  ├─[change within 2 s]─────────────────► debouncing (timer reset)
  ├─[2 s elapsed, lastSavedRef = null]──► (effect returns early — initLastSaved not yet called)
  ├─[2 s elapsed, isPending = true]─────► postponed (pendingAfterSaveRef = true)
  ├─[2 s elapsed, content unchanged]────► idle (no-op, PATCH skipped)
  └─[2 s elapsed, isPending = false]────► saving

saving (isPendingRef = true)
  ├─[success, counter matches]──────────► saved (lastSavedRef updated; setQueryData)
  └─[failure, counter matches]──────────► retrying (setTimeout 3000 ms)

retrying
  ├─[success, counter matches]──────────► saved
  └─[failure, counter matches]──────────► error ("Save failed" shown)
          finally: isPendingRef = false; deferred flush if pendingAfterSaveRef

error
  └─[title or content changes]──────────► idle (status cleared via saveStatusRef check)
                                           then immediately debouncing
```

---

## Risks & Assumptions

| # | Risk / Assumption | Mitigation |
|---|------------------|------------|
| R1 | TipTap `contenteditable` updates are async — `editor.getHTML()` in `onUpdate` may lag behind keystroke state in the same render cycle | `onUpdate` sets React state via `setContent(e.getHTML())`, ensuring each render reflects the committed ProseMirror document |
| R2 | `useAutosave` debounce effect fires before `initLastSaved` is called — would trigger premature PATCH with empty strings | Effect early-return guard: `if (lastSavedRef.current === null) return` — skips entirely until baseline is set |
| R3 | `initLastSaved` is a `useCallback` with `[setSaveStatus]` deps; calling it after baseline is set is a no-op for the null guard — restore path relies on content mismatch triggering a new save cycle after 2 s | Acceptable per spec assumption A5; restored content will autosave after 2 s |
| R4 | Autosave timing tests: `vi.useFakeTimers()` must be set up before hook renders; must use `vi.advanceTimersByTimeAsync` (async variant) because `doSave` is an `async` function | Test setup: `vi.useFakeTimers()` in `beforeEach`, `vi.useRealTimers()` in `afterEach` |
| R5 | `saveCounterRef` Latest-Write-Wins guard discards stale responses when two saves fire in quick succession — flaky if tests do not advance counter correctly | Tests for S9 and S10–S12 must assert final `saveStatus` value, not intermediate states |
| R6 | `NoteCard` now calls `useNavigate()` internally — existing tests that render `NoteCard` outside a `MemoryRouter` will throw | Wrap `NoteCard` in `<MemoryRouter>` in all tests, or confirm existing setup already provides a router |
| R7 | `useNote` does NOT handle navigation on error internally; error navigation is `NoteEditorPage`'s responsibility via a `useEffect` | Tests for S2 must render `NoteEditorPage` (not `useNote` in isolation) to assert redirect behaviour |
| R8 | TipTap `useEditor` with `immediatelyRender: false` suppresses SSR hydration warning; passing `false` as second arg to `setContent` suppresses the `update` event on init, preventing `useAutosave` from treating initial population as a user-driven change | Required; matches spec assumption A12 |
