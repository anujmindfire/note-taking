# Spec — AB-1004: Notes CRUD + Soft Delete

**Status:** Archived
**Ticket:** AB-1004
**Branch:** feature/backend/AB-1004-notes-crud-soft-delete
**FRS References:** FRS §4.2.1 (Create Note), §4.2.2 (List Notes), §4.2.3 (Get Note), §4.2.4 (Update Note), §4.2.5 (Delete Note / Soft Delete)
**SDS References:** SDS-NoteApp §5 (Note model), §6 (Three-layer architecture), §7 (Soft delete pattern)
**Layer:** Backend only
**Depends on:** AB-1002 (auth — `requireAuth` middleware, JWT, `AuthenticatedRequest`)

---

## Summary

Implements full CRUD for the Note resource behind JWT authentication. All five endpoints (list, create, get by id, partial update, delete) enforce ownership: a user can only read or modify their own notes. Delete is a soft delete — it sets `deletedAt` to the current timestamp rather than removing the row. Soft-deleted notes are invisible to all read and write operations. Creating or updating a note triggers a version snapshot via `VersionService.snapshot` as a non-blocking side-effect (failure is logged and swallowed). The list endpoint supports pagination, sorting, and optional tag-based filtering via query parameters.

---

## In Scope

- `GET /api/notes` — list all active (non-deleted) notes owned by the authenticated user, paginated, with sorting and optional tag filtering
- `POST /api/notes` — create a new note; title defaults to `"Untitled"`, content defaults to `""`
- `GET /api/notes/:id` — retrieve a single active owned note by UUID
- `PATCH /api/notes/:id` — partially update title and/or content of an active owned note
- `DELETE /api/notes/:id` — soft-delete an active owned note (sets `deletedAt`, returns 204)
- Auth guard (`requireAuth`) on all five endpoints
- Zod validation (`createNoteSchema`, `updateNoteSchema`, `listNotesQuerySchema`) from `@noteapp/shared`
- Three-layer implementation: `NoteRepository` → `NoteService` → `noteRoutes`
- `NOTE_NOT_FOUND` (404) returned uniformly for: note does not exist, note belongs to another user, note is already soft-deleted
- Version snapshot side-effect on create and update (non-blocking)

## Out of Scope

- Hard delete (permanent row removal)
- Note restore (un-deleting a soft-deleted note) — delivered in a later ticket
- Tag attachment/detachment — delivered in AB-1006
- Full-text search — delivered in a later ticket
- Share links — delivered in a later ticket
- Frontend UI — backend only
- Rate limiting

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | All shared-package artefacts (`INoteResponse`, `ITagResponse`, `createNoteSchema`, `updateNoteSchema`, `NOTE_NOT_FOUND`) were already present before implementation began; no new shared-package changes were required | plan.md Phase 1 |
| A2 | The `Note` model with `deletedAt DateTime?` and all required indices already existed in `prisma/schema.prisma`; no migration was needed | plan.md Phase 2, schema.prisma |
| A3 | `findByIdAndUserId` enforces ownership and soft-delete exclusion in a single `findFirst` query with `where: { id, userId, deletedAt: null }`. Both "not found" and "wrong owner" return `null` and produce the same 404 `NOTE_NOT_FOUND` — intentional to prevent note ID enumeration | NoteRepository.ts |
| A4 | Invalid UUID values in `:id` path params are not validated by schema — a non-existent UUID causes Prisma to return `null`, which the service maps to 404 `NOTE_NOT_FOUND` | route code + plan.md |
| A5 | `updateNote` with an empty body `{}` is a no-op update: Prisma issues an UPDATE with no changed fields but `updatedAt` may still advance | plan.md |
| A6 | The version snapshot call (`VersionService.snapshot`) is fire-and-forget: if it throws, a warning is logged to `console.warn` and the note response is still returned successfully | NoteService.ts |
| A7 | `INoteResponse.tags` is always present as `ITagResponse[]`; before any tags are attached it is `[]`. Tags are loaded via Prisma `include` on every note query (no lazy loading, no N+1) | NoteRepository.ts `noteInclude` |
| A8 | The `GET /api/notes` list response envelope is `{ data: [...], meta: { total, page, limit, totalPages } }` — not the bare `{ data: [...] }` shape — because pagination metadata is included | NoteService.ts, noteRoutes.ts |
| A9 | `ITagResponse` includes `color: string \| null` and `noteCount: number`. The `noteCount` is computed by Prisma `_count` on `noteTags` filtered to non-deleted notes only | NoteRepository.ts `noteInclude` |
| A10 | A second `DELETE` on an already-soft-deleted note returns 404 `NOTE_NOT_FOUND` rather than succeeding | NoteService.ts |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| N1 | Valid title + content | Authenticated user | POST `/api/notes` `{ title: "My Note", content: "Hello world" }` | 201, `{ data: { id, userId, title, content, deletedAt: null, createdAt, updatedAt, tags: [] } }` | §4.2.1 | — |
| N2 | Body omitted — defaults applied | Authenticated user | POST `/api/notes` `{}` | 201, `{ data: { title: "Untitled", content: "" } }` | §4.2.1 | — |
| N3 | title is empty string | Authenticated user | POST `/api/notes` `{ title: "" }` | 400, `VALIDATION_ERROR`, `fields` contains `"title"` | §4.2.1 | `VALIDATION_ERROR` |
| N4 | Missing auth on create | No Authorization header | POST `/api/notes` | 401, `UNAUTHORIZED` | §4.2.1 | `UNAUTHORIZED` |
| N5 | List — user has active notes | Authenticated user with 2 active notes | GET `/api/notes` | 200, `{ data: [...], meta: { total, page, limit, totalPages } }` with both notes | §4.2.2 | — |
| N6 | List — soft-deleted note excluded | User owns 1 active + 1 soft-deleted note | GET `/api/notes` | 200, soft-deleted note absent from `data` | §4.2.2 | — |
| N7 | List — cross-user isolation | Two users each with a note | GET `/api/notes` as user A | 200, only user A's note returned | §4.2.2 | — |
| N8 | List — missing auth | No Authorization header | GET `/api/notes` | 401, `UNAUTHORIZED` | §4.2.2 | `UNAUTHORIZED` |
| N9 | Get by id — owned, active | Authenticated user owns the note | GET `/api/notes/:id` | 200, `{ data: { id, userId, title, content, … } }` | §4.2.3 | — |
| N10 | Get by id — not found | Non-existent UUID | GET `/api/notes/:id` | 404, `NOTE_NOT_FOUND` | §4.2.3 | `NOTE_NOT_FOUND` |
| N11 | Get by id — other user's note | Note belongs to user B | GET `/api/notes/:id` as user A | 404, `NOTE_NOT_FOUND` | §4.2.3 | `NOTE_NOT_FOUND` |
| N12 | Get by id — soft-deleted | Note has `deletedAt` set | GET `/api/notes/:id` as owner | 404, `NOTE_NOT_FOUND` | §4.2.3 | `NOTE_NOT_FOUND` |
| N13 | Get by id — missing auth | No Authorization header | GET `/api/notes/:id` | 401, `UNAUTHORIZED` | §4.2.3 | `UNAUTHORIZED` |
| N14 | PATCH — update title only | Authenticated owner, active note | PATCH `/api/notes/:id` `{ title: "Updated" }` | 200, `{ data: { title: "Updated", content: <original> } }`, `updatedAt` advances | §4.2.4 | — |
| N15 | PATCH — update content only | Authenticated owner, active note | PATCH `/api/notes/:id` `{ content: "Updated" }` | 200, `{ data: { content: "Updated", title: <original> } }` | §4.2.4 | — |
| N16 | PATCH — not found | Non-existent UUID | PATCH `/api/notes/:id` | 404, `NOTE_NOT_FOUND` | §4.2.4 | `NOTE_NOT_FOUND` |
| N17 | PATCH — soft-deleted note | Note has `deletedAt` set | PATCH `/api/notes/:id` as owner | 404, `NOTE_NOT_FOUND` | §4.2.4 | `NOTE_NOT_FOUND` |
| N18 | PATCH — other user's note | Note belongs to user B | PATCH `/api/notes/:id` as user A | 404, `NOTE_NOT_FOUND` | §4.2.4 | `NOTE_NOT_FOUND` |
| N19 | PATCH — title is empty string | Authenticated owner, active note | PATCH `/api/notes/:id` `{ title: "" }` | 400, `VALIDATION_ERROR`, `fields` contains `"title"` | §4.2.4 | `VALIDATION_ERROR` |
| N20 | PATCH — missing auth | No Authorization header | PATCH `/api/notes/:id` | 401, `UNAUTHORIZED` | §4.2.4 | `UNAUTHORIZED` |
| N21 | DELETE — active owned note | Authenticated owner, active note | DELETE `/api/notes/:id` | 204, no body; subsequent GET returns 404 `NOTE_NOT_FOUND` | §4.2.5 | — |
| N22 | DELETE — not found | Non-existent UUID | DELETE `/api/notes/:id` | 404, `NOTE_NOT_FOUND` | §4.2.5 | `NOTE_NOT_FOUND` |
| N23 | DELETE — other user's note | Note belongs to user B | DELETE `/api/notes/:id` as user A | 404, `NOTE_NOT_FOUND` | §4.2.5 | `NOTE_NOT_FOUND` |
| N24 | DELETE — already soft-deleted | Note already has `deletedAt` set | DELETE `/api/notes/:id` as owner | 404, `NOTE_NOT_FOUND` | §4.2.5 | `NOTE_NOT_FOUND` |
| N25 | DELETE — missing auth | No Authorization header | DELETE `/api/notes/:id` | 401, `UNAUTHORIZED` | §4.2.5 | `UNAUTHORIZED` |

---

## API Contract

### GET /api/notes

**Auth required:** Yes
**Query parameters (all optional):**

| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `page` | integer | `1` | min 1 |
| `limit` | integer | `20` | min 1, max 100 |
| `sortBy` | `"createdAt"` \| `"updatedAt"` | `"createdAt"` | enum |
| `sortDir` | `"asc"` \| `"desc"` | `"desc"` | enum |
| `tagId` | UUID string, repeatable | `[]` | valid UUID; OR logic |

**Success response — 200:**
```json
{
  "data": [
    {
      "id": "uuid", "userId": "uuid", "title": "string", "content": "string",
      "deletedAt": null, "createdAt": "ISO8601", "updatedAt": "ISO8601",
      "tags": [{ "id": "uuid", "userId": "uuid", "name": "string", "color": "string|null", "noteCount": 0, "createdAt": "ISO8601" }]
    }
  ],
  "meta": { "total": 0, "page": 1, "limit": 20, "totalPages": 0 }
}
```

### POST /api/notes

**Auth required:** Yes
**Request body:** `{ "title": "string (min 1, max 255, default: \"Untitled\")", "content": "string (default: \"\")" }`
**Success response — 201:** `{ "data": { ...note, "tags": [] } }`

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | `title` is empty string |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization |

### GET /api/notes/:id

**Auth required:** Yes
**Success response — 200:** `{ "data": { ...note } }`

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization |
| 404 | `NOTE_NOT_FOUND` | Not found, wrong user, or soft-deleted |

### PATCH /api/notes/:id

**Auth required:** Yes
**Request body:** `{ "title": "string (min 1, max 255) — optional", "content": "string — optional" }`
**Success response — 200:** `{ "data": { ...updatedNote } }`

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | `title` is empty string |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization |
| 404 | `NOTE_NOT_FOUND` | Not found, wrong user, or soft-deleted |

### DELETE /api/notes/:id

**Auth required:** Yes
**Success response — 204:** No body.

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization |
| 404 | `NOTE_NOT_FOUND` | Not found, wrong user, or soft-deleted |

---

## Database Changes

No migration required — schema was correct before implementation.

```prisma
model Note {
  id        String    @id @default(uuid())
  userId    String
  title     String
  content   String    @default("")
  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  user        User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  noteTags    NoteTag[]
  sharedLinks SharedLink[]
  versions    NoteVersion[]

  @@index([userId])
  @@index([deletedAt])
  @@index([userId, createdAt])
  @@index([userId, updatedAt])
}
```

`NoteTag` join table has `onDelete: Cascade` on both sides.

---

## Shared Package Changes

No new additions for AB-1004 — all artefacts were already present:

| Artefact | Location |
|----------|----------|
| `INoteResponse` | `packages/shared/src/types/index.ts` |
| `ITagResponse` | `packages/shared/src/types/index.ts` |
| `INotesPageMeta` | `packages/shared/src/types/index.ts` |
| `createNoteSchema`, `TCreateNoteInput` | `packages/shared/src/schemas/index.ts` |
| `updateNoteSchema`, `TUpdateNoteInput` | `packages/shared/src/schemas/index.ts` |
| `listNotesQuerySchema`, `TListNotesQuery` | `packages/shared/src/schemas/index.ts` |
| `NOTE_NOT_FOUND` | `packages/shared/src/errors.ts` |

---

## Architecture Notes

**Soft delete:** `DELETE` sets `deletedAt = new Date()`. All repository read methods include `deletedAt: null` in their `where` clause. A second DELETE on an already-soft-deleted note returns 404 — not 204.

**Ownership enforcement:** `findByIdAndUserId` uses `findFirst({ where: { id, userId, deletedAt: null } })`. "Not found", "wrong owner", and "soft-deleted" all collapse to `null` → 404 `NOTE_NOT_FOUND` — prevents note ID enumeration.

**Version snapshot side-effect:** `NoteService.createNote` and `NoteService.updateNote` call `VersionService.snapshot(noteId, title, content)` after the repository write. Wrapped in try/catch; failure logs `console.warn` and does not affect the response.

**Tag eager loading:** Every note query uses a `noteInclude` constant that eagerly loads tags via Prisma `include` with `_count` for `noteCount`. No N+1 queries.

**Three-layer boundaries:**
- `noteRoutes.ts` — validates with Zod middleware, reads `userId` from `req.user`, calls `NoteService`, sends response
- `NoteService.ts` — business rules, ownership guard, throws typed errors; no Prisma imports
- `NoteRepository.ts` — all Prisma queries; returns typed internal records, never raw Prisma objects
