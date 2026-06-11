# Ticket AB-1002 — Notes CRUD API

**FRS Reference:** §4.2.1 Document Creation, §4.2.2 Document Retrieval, §4.2.3 Document Editing  
**Branch:** `feature/backend/AB-1002-notes`  
**Depends on:** AB-1001 (auth middleware must exist)  
**Layer:** Backend only

---

## Requirement

Implement full CRUD for notes. All endpoints require authentication. Notes are strictly user-scoped — users cannot read or modify other users' notes.

---

## Acceptance Criteria

1. `POST /api/notes` creates a note for the authenticated user. `title` defaults to "Untitled" if blank. Returns 201 with note object.
2. `GET /api/notes` returns all active (non-deleted) notes for the authenticated user.
3. `GET /api/notes/:id` returns a single note. Returns 404 if not found or owned by another user.
4. `PATCH /api/notes/:id` updates `title` and/or `content`. Updates `updatedAt`. Returns updated note.
5. Notes are strictly scoped: users cannot access other users' notes.

---

## Error Scenarios

| Case | Code | HTTP |
| :--- | :--- | :--- |
| Note not found or wrong owner | `NOTE_NOT_FOUND` | 404 |
| Missing/invalid auth token | `UNAUTHORIZED` | 401 |
| Invalid request body | `VALIDATION_ERROR` | 400 |

---

## Out of Scope

- Soft delete (AB-1003)
- Tags on notes (AB-1004)
- Pagination and sorting
- Search (FRS §4.4)
