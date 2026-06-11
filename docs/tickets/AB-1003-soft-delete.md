# Ticket AB-1003 — Note Soft Delete

**FRS Reference:** §4.2.4 Soft Deletion & Recovery  
**Branch:** `feature/backend/AB-1003-soft-delete`  
**Depends on:** AB-1002  
**Layer:** Backend only

---

## Requirement

Add soft-delete capability to notes. Deleted notes are hidden from normal list/get endpoints but retain their data. The `deletedAt` column already exists in the schema.

---

## Acceptance Criteria

1. `DELETE /api/notes/:id` sets `deletedAt` to current timestamp (soft delete). Returns 204.
2. `GET /api/notes` excludes notes where `deletedAt IS NOT NULL`.
3. `GET /api/notes/:id` returns 404 for soft-deleted notes (treats them as not found).
4. `PATCH /api/notes/:id` returns 404 for soft-deleted notes.
5. Only the note owner can delete their own notes.

---

## Error Scenarios

| Case | Code | HTTP |
| :--- | :--- | :--- |
| Delete a note not owned by user | `NOTE_NOT_FOUND` | 404 |
| Delete already-deleted note | `NOTE_NOT_FOUND` | 404 |
| Missing auth | `UNAUTHORIZED` | 401 |

---

## Out of Scope

- Note restore/recovery endpoint
- 30-day permanent purge job (FRS §4.2.4 retention)
- Trash view (listing deleted notes)
