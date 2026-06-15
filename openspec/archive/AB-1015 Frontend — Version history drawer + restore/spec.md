# Spec — AB-1015: Frontend — Version history drawer + restore

**Status:** Draft — awaiting approval
**Ticket:** AB-1015
**Branch:** feature/frontend/AB-1015-version-history-drawer
**FRS References:** §4.6.2, §4.6.3
**SDS References:** §6 (NoteVersion model)
**Layer:** Frontend only
**Depends on:** AB-1009 (version backend — GET /versions, POST /restore already implemented)

---

## Summary

Adds a version history drawer to the NoteEditorPage. A "History" button in the top bar opens a Sheet that lists all version snapshots for the current note, newest first. Each row shows the version number and timestamp. The newest version is marked "Current" and its Restore button is disabled. Clicking Restore on any other version immediately calls `POST /api/notes/:noteId/versions/:versionId/restore`, patches the editor title and content directly from the response, resets the autosave baseline, closes the drawer, and shows a success toast. All three version endpoints (`GET /versions`, `GET /versions/:id`, `POST /versions/:id/restore`) and the `INoteVersion` type and `VERSION_NOT_FOUND` error code are already implemented in the backend and shared package — no backend or shared changes are required.

---

## In Scope

- "History" button (Clock icon) in the NoteEditorPage top bar alongside Share
- `VersionHistoryDrawer` Sheet component with version list
- `useVersions` TanStack Query hook — `GET /api/notes/:noteId/versions`
- `useRestoreVersion` mutation hook — `POST /api/notes/:noteId/versions/:versionId/restore`
- Version rows: `v{N} · {MMM d, h:mm a}` format + Restore button
- "Current" badge on the newest version; Restore disabled for that row
- Restore: immediate (no confirmation dialog), patches editor state from response, closes drawer, toasts success
- Error handling: `VERSION_NOT_FOUND`, `NOTE_NOT_FOUND` → `toast.error`, drawer stays open
- Loading skeleton while versions are fetching
- Empty state when note has no versions
- Error state if the versions fetch itself fails

## Out of Scope

- Full-content preview of a version before restoring
- Confirmation dialog for restore
- Pagination of the version list
- Restore of soft-deleted notes (backend already guards this)
- Any new backend endpoints or shared package types/schemas/error codes

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | Restore button is disabled (not hidden) on the "Current" (newest) row — restoring to the current version is a no-op from the user's perspective | User answer Q6 + Q3 |
| A2 | After successful restore, `initLastSaved(title, content)` is called with the restored values to reset the autosave debounce baseline, preventing an immediate redundant auto-save | Architecture — useAutosave contract |
| A3 | Success toast message: `"Restored to v{N}"` where `{N}` is the version number of the restored snapshot | Derived from UX convention |
| A4 | The versions query (`["versions", noteId]`) is invalidated on restore success so re-opening the drawer shows the new snapshot created by the restore | FRS §4.6.3 AC2 |
| A5 | The drawer fetches versions only when `open === true` (enabled flag on useVersions) — not on page load | Performance — lazy fetch |
| A6 | The Sheet component is installed via shadcn/ui (`@radix-ui/react-dialog` variant); if not present it must be added before implementation | shadcn/ui dependency |
| A7 | Date format for each row is `MMM d, h:mm a` via `date-fns` (e.g. "Jun 14, 3:42 PM"), consistent with `format(new Date(createdAt), "MMM d, h:mm a")` | User answer Q2 |
| A8 | The drawer can be opened at any time regardless of the current autosave status (`saving`, `saved`, `error`, `idle`) | No FRS restriction |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Drawer open — versions exist | User is on NoteEditorPage; note has ≥ 2 versions | Clicks History button | Sheet opens; version rows listed newest-first; each row shows `v{N} · {date}`; Restore button present on each non-current row | §4.6.2 AC1 | — |
| S2 | Drawer open — no versions | User is on NoteEditorPage; note has 0 versions | Clicks History button | Sheet opens; shows empty state "No versions yet." | §4.6.2 AC1 | — |
| S3 | Drawer open — loading skeleton | User is on NoteEditorPage | Clicks History button while fetch is in-flight | Sheet opens; skeleton placeholder rows visible; version list absent | §4.6.2 AC1 | — |
| S4 | Restore a non-current version — success | Drawer open; v2 exists; v3 is Current | Clicks Restore on v2 row | `POST /api/notes/:id/versions/:v2id/restore` called; editor title and content update to v2 values; drawer closes; `toast.success("Restored to v2")` | §4.6.3 AC1, AC2 | — |
| S5 | Current version Restore is disabled | Drawer open; newest version row visible | — | Restore button on the "Current" row is disabled (not clickable) | §4.6.3 AC3 | — |
| S6 | Restore — VERSION_NOT_FOUND | Drawer open; version was purged after drawer opened | Clicks Restore | `toast.error` with server message; drawer stays open; editor unchanged | §4.6.3 AC1 | `VERSION_NOT_FOUND` |
| S7 | Restore — NOTE_NOT_FOUND | Note deleted externally between page load and restore click | Clicks Restore | `toast.error` with server message; drawer stays open | §4.6.3 AC1 | `NOTE_NOT_FOUND` |
| S8 | Versions fetch fails | Network or server error on GET /versions | Drawer opens | Error state shown inside drawer (e.g. "Failed to load versions."); retry possible by closing and reopening | §4.6.2 AC1 | — |

---

## API Contract

### GET /api/notes/:noteId/versions

**Auth required:** Yes
**Request body:** none
**Success response:** HTTP 200
```json
{ "data": [ { "id": "uuid", "noteId": "uuid", "version": 3, "title": "My note", "content": "<p>…</p>", "createdAt": "2026-06-14T10:12:00.000Z" } ] }
```
Sorted newest-first (highest `version` number first).

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 404 | `NOTE_NOT_FOUND` | Note not found or belongs to another user |

---

### GET /api/notes/:noteId/versions/:versionId

**Auth required:** Yes
**Request body:** none
**Success response:** HTTP 200
```json
{ "data": { "id": "uuid", "noteId": "uuid", "version": 2, "title": "My note", "content": "<p>…</p>", "createdAt": "2026-06-13T08:00:00.000Z" } }
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 404 | `NOTE_NOT_FOUND` | Note not found or belongs to another user |
| 404 | `VERSION_NOT_FOUND` | Version not found for this note |

---

### POST /api/notes/:noteId/versions/:versionId/restore

**Auth required:** Yes
**Request body:** none
**Success response:** HTTP 200
```json
{
  "data": {
    "id": "uuid", "userId": "uuid", "title": "Restored title",
    "content": "<p>Restored content</p>", "deletedAt": null,
    "createdAt": "2026-06-01T00:00:00.000Z", "updatedAt": "2026-06-15T12:00:00.000Z",
    "tags": []
  }
}
```
Returns the updated `INoteResponse`. A new version snapshot is created server-side.

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 404 | `NOTE_NOT_FOUND` | Note not found or belongs to another user |
| 404 | `VERSION_NOT_FOUND` | Version not found for this note |

---

## Database Changes

None. The `NoteVersion` table and all supporting migrations were shipped in AB-1009.

---

## Shared Package Changes

None. `INoteVersion`, `VERSION_NOT_FOUND`, and all relevant request/response types already exist in `@noteapp/shared`.

---

## Architecture Notes

### Editor state update after restore (option b — direct patch)

After `POST .../restore` succeeds, the component receives `INoteResponse`. NoteEditorPage:

1. Calls `setTitle(note.title)` — updates controlled title input
2. Calls `editor.commands.setContent(note.content, false)` — replaces TipTap content without adding to undo history
3. Calls `initLastSaved(note.title, note.content)` — resets the useAutosave debounce baseline so the restored content is not immediately re-saved
4. Closes the drawer (`setHistoryOpen(false)`)

The `["versions", noteId]` query is invalidated inside `useRestoreVersion.onSuccess` so the drawer reflects the newly created snapshot if re-opened.

### VersionHistoryDrawer props contract

```typescript
interface IVersionHistoryDrawerProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (note: INoteResponse) => void;
}
```

`onRestore` is invoked from the drawer's mutation `onSuccess` callback with the restored `INoteResponse`, delegating editor state updates to NoteEditorPage.

### shadcn/ui Sheet

The drawer uses shadcn/ui `Sheet` (slides from the right). If not already present in `src/components/ui/sheet.tsx`, it must be added before implementation begins (wraps `@radix-ui/react-dialog`).
