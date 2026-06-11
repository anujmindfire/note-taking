# Ticket AB-1004 — Tags API

**FRS Reference:** §4.3.1 Tag Creation, §4.3.2 Tag Retrieval, §4.3.3 Tag Modification & Removal  
**Branch:** `feature/backend/AB-1004-tags`  
**Depends on:** AB-1003  
**Layer:** Backend only

---

## Requirement

Implement tag management and note-tag association. Tags are user-scoped. Tag names are case-insensitively unique per user. Deleting a tag removes all note-tag associations but does NOT delete notes.

---

## Acceptance Criteria

1. `GET /api/tags` returns all tags for the authenticated user.
2. `POST /api/tags` creates a tag with `{ name }`. Normalizes name to lowercase for uniqueness check. Returns 201 `{ data: { id, name } }`.
3. `DELETE /api/tags/:id` deletes the tag and all its NoteTag associations (cascade). Returns 204.
4. `POST /api/notes/:id/tags/:tagId` attaches a tag to a note. Idempotent — attaching an already-attached tag returns 200 without error. Returns note with full tag list.
5. `DELETE /api/notes/:id/tags/:tagId` detaches a tag from a note. Idempotent — detaching a tag that isn't attached returns 200. Returns note with updated tag list.
6. Tag names are case-insensitively unique per user (`TAG_NAME_TAKEN` if duplicate).
7. Users can only manage their own tags — cross-user access returns 404.
8. Attaching/detaching tags to soft-deleted notes returns `NOTE_NOT_FOUND`.

---

## Error Scenarios

| Case | Code | HTTP |
| :--- | :--- | :--- |
| Duplicate tag name (case-insensitive) | `TAG_NAME_TAKEN` | 422 |
| Tag not found or wrong owner | `TAG_NOT_FOUND` | 404 |
| Note not found or soft-deleted | `NOTE_NOT_FOUND` | 404 |
| Missing auth | `UNAUTHORIZED` | 401 |
| Invalid request body | `VALIDATION_ERROR` | 400 |

---

## Out of Scope

- Tag color field (FRS §4.3.1 mentions color — deferred)
- Tag rename/update endpoint
- Filtering notes by tag
- Tag usage counts
