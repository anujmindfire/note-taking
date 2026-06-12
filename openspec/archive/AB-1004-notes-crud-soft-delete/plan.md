# Plan — AB-1004: Notes — Full CRUD + Soft Delete

**Based on:** `docs/tickets/AB-1002-notes.md` + `docs/tickets/AB-1003-soft-delete.md` + FRS §4.2.1–4.2.4
**Note:** No spec.md exists for AB-1004 — plan derived directly from ticket files and FRS.
**Spec status:** Pending (plan drafted from ticket definitions)

---

## Phase 1 — Shared Package

**No changes required.** All types and schemas already exist:

| Already present | Location |
|---|---|
| `INoteResponse`, `ITagResponse` | `packages/shared/src/types/index.ts` |
| `createNoteSchema`, `updateNoteSchema` | `packages/shared/src/schemas/index.ts` |
| `TCreateNoteInput`, `TUpdateNoteInput` | `packages/shared/src/schemas/index.ts` |
| `NOTE_NOT_FOUND` | `packages/shared/src/errors.ts` |

---

## Phase 2 — Database

**No migration required.** The `Note` model already has all needed fields:

```prisma
model Note {
  id        String    @id @default(uuid())
  userId    String
  title     String
  content   String    @default("")
  deletedAt DateTime?      // soft-delete column already present
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  noteTags  NoteTag[]
  @@index([userId])
  @@index([deletedAt])
}
```

Migration is: **NONE — schema already correct.**

---

## Phase 3 — Repository Layer

| Action | File | Methods |
|---|---|---|
| CREATE | `apps/backend/src/repositories/NoteRepository.ts` | `findAllByUserId`, `findByIdAndUserId`, `create`, `update`, `softDelete` |

**Internal domain type** (file-local, not exported from shared):

```typescript
interface INoteRecord {
  id: string;
  userId: string;
  title: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Array<{ id: string; userId: string; name: string; createdAt: Date }>;
}
```

**Method signatures and queries:**

```typescript
// Returns all active (non-deleted) notes for a user, including their tags.
// Prisma: findMany({ where: { userId, deletedAt: null }, include: { noteTags: { include: { tag: true } } } })
findAllByUserId(userId: string): Promise<INoteRecord[]>

// Returns null if note doesn't exist, belongs to another user, OR is soft-deleted.
// Prisma: findFirst({ where: { id, userId, deletedAt: null }, include: { noteTags: { include: { tag: true } } } })
findByIdAndUserId(id: string, userId: string): Promise<INoteRecord | null>

// Creates a note. Returns created note with empty tags array.
// Prisma: create({ data: { userId, title, content }, include: { noteTags: { include: { tag: true } } } })
create(data: { userId: string; title: string; content: string }): Promise<INoteRecord>

// Updates title and/or content. Returns updated note with tags.
// Prisma: update({ where: { id }, data, include: { noteTags: { include: { tag: true } } } })
update(id: string, data: { title?: string; content?: string }): Promise<INoteRecord>

// Sets deletedAt to now. Returns void.
// Prisma: update({ where: { id }, data: { deletedAt: new Date() } })
softDelete(id: string): Promise<void>
```

---

## Phase 4 — Service Layer

| Action | File | Methods |
|---|---|---|
| CREATE | `apps/backend/src/services/NoteService.ts` | `listNotes`, `getNote`, `createNote`, `updateNote`, `deleteNote` |

**Private helper** (file-local):

```typescript
function mapToResponse(note: INoteRecord): INoteResponse {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    content: note.content,
    deletedAt: note.deletedAt ? note.deletedAt.toISOString() : null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    tags: note.tags.map(t => ({
      id: t.id,
      userId: t.userId,
      name: t.name,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
```

**Method signatures:**

```typescript
// Business rules: none beyond repository delegation.
listNotes(userId: string): Promise<INoteResponse[]>

// Business rules: throws NOTE_NOT_FOUND (404) if repository returns null.
getNote(id: string, userId: string): Promise<INoteResponse>

// Business rules: none — schema defaults handle empty title/content.
createNote(userId: string, data: TCreateNoteInput): Promise<INoteResponse>

// Business rules: calls findByIdAndUserId first → throws NOTE_NOT_FOUND (404) if null.
updateNote(id: string, userId: string, data: TUpdateNoteInput): Promise<INoteResponse>

// Business rules: calls findByIdAndUserId first → throws NOTE_NOT_FOUND (404) if null.
// Then calls softDelete(id). Returns void.
deleteNote(id: string, userId: string): Promise<void>
```

No Prisma calls. All repository imports from `../repositories/NoteRepository.js`.

---

## Phase 5 — Route Layer

| Action | File | Change |
|---|---|---|
| CREATE | `apps/backend/src/routes/noteRoutes.ts` | 5 routes below |
| MODIFY | `apps/backend/src/app.ts` | Uncomment `app.use("/api/notes", noteRoutes)` |

**Route definitions** (all behind `requireAuth`):

| Method | Path | Validation | Service call | Response |
|---|---|---|---|---|
| `GET` | `/` | none | `NoteService.listNotes(userId)` | `200 { data: [...] }` |
| `POST` | `/` | `validate(createNoteSchema)` | `NoteService.createNote(userId, body)` | `201 { data: note }` |
| `GET` | `/:id` | none | `NoteService.getNote(id, userId)` | `200 { data: note }` |
| `PATCH` | `/:id` | `validate(updateNoteSchema)` | `NoteService.updateNote(id, userId, body)` | `200 { data: note }` |
| `DELETE` | `/:id` | none | `NoteService.deleteNote(id, userId)` | `204 (no body)` |

Route handlers follow the exact same pattern as `authRoutes.ts`: errors delegated via `next(err)`.

---

## Phase 6 — Tests

| File | Type | Scenarios |
|---|---|---|
| `apps/backend/src/__tests__/unit/services/NoteService.test.ts` | Unit | N1–N10 (service-level) |
| `apps/backend/src/__tests__/integration/routes/notes.test.ts` | Integration | N1–N25 |

**Scenario table:**

| ID | Endpoint | Scenario | Expected |
|---|---|---|---|
| N1 | POST /notes | Valid title + content | 201, note object with id/userId/title/content/tags=[] |
| N2 | POST /notes | Body omitted (no title, no content) | 201, title="Untitled", content="" |
| N3 | POST /notes | title="" (empty string sent) | 400 VALIDATION_ERROR |
| N4 | POST /notes | Missing auth | 401 UNAUTHORIZED |
| N5 | GET /notes | User has active notes | 200, array of notes |
| N6 | GET /notes | Soft-deleted note excluded | 200, soft-deleted not in result |
| N7 | GET /notes | Cross-user isolation | 200, only caller's notes returned |
| N8 | GET /notes | Missing auth | 401 UNAUTHORIZED |
| N9 | GET /notes/:id | Note exists and owned | 200, note object |
| N10 | GET /notes/:id | Note not found | 404 NOTE_NOT_FOUND |
| N11 | GET /notes/:id | Note owned by other user | 404 NOTE_NOT_FOUND |
| N12 | GET /notes/:id | Note is soft-deleted | 404 NOTE_NOT_FOUND |
| N13 | GET /notes/:id | Missing auth | 401 UNAUTHORIZED |
| N14 | PATCH /notes/:id | Update title only | 200, updated note, updatedAt changes |
| N15 | PATCH /notes/:id | Update content only | 200, updated note |
| N16 | PATCH /notes/:id | Note not found | 404 NOTE_NOT_FOUND |
| N17 | PATCH /notes/:id | Note is soft-deleted | 404 NOTE_NOT_FOUND |
| N18 | PATCH /notes/:id | Note owned by other user | 404 NOTE_NOT_FOUND |
| N19 | PATCH /notes/:id | title="" (empty string) | 400 VALIDATION_ERROR |
| N20 | PATCH /notes/:id | Missing auth | 401 UNAUTHORIZED |
| N21 | DELETE /notes/:id | Active note, valid owner | 204, no body |
| N22 | DELETE /notes/:id | Note not found | 404 NOTE_NOT_FOUND |
| N23 | DELETE /notes/:id | Note owned by other user | 404 NOTE_NOT_FOUND |
| N24 | DELETE /notes/:id | Note already soft-deleted | 404 NOTE_NOT_FOUND |
| N25 | DELETE /notes/:id | Missing auth | 401 UNAUTHORIZED |

Unit tests mock `NoteRepository` and verify service business rules in isolation.
Integration tests hit the real test DB via `DATABASE_URL`, following the same `beforeEach` cleanup pattern as `auth.test.ts`.

---

## Checkpoints

After each phase run:

```bash
pnpm build          # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test           # all green
```

Stop on any failure. Fix before continuing.

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|---|---|
| A1 | No spec.md for AB-1004 — plan derived from ticket docs | Ticket definitions and FRS §4.2 are unambiguous; proceed |
| A2 | `INoteResponse.tags` is `ITagResponse[]` — must return tags even pre-AB-1005 | Repository includes `noteTags → tag` via Prisma; tags=[] until tags are created |
| A3 | `updateNote` with empty `{}` body — all fields optional, no-op update | Prisma `update` with no-op data is safe; updatedAt still advances |
| A4 | Validate middleware only validates `req.body`, not `req.params` | Invalid UUID `:id` → Prisma returns null → 404 via service; no param schema needed |
