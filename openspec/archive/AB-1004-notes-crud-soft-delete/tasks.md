# Tasks — AB-1004: Notes — Full CRUD + Soft Delete

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

> **Status:** COMPLETE — all phases implemented and all gates passed.

---

## Phase 1 — Shared Package

- [x] `INoteResponse`, `ITagResponse` interfaces — already present in `packages/shared/src/types/index.ts`
- [x] `createNoteSchema`, `updateNoteSchema` schemas — already present in `packages/shared/src/schemas/index.ts`
- [x] `TCreateNoteInput`, `TUpdateNoteInput` type aliases — already present
- [x] `NOTE_NOT_FOUND` error code — already present in `packages/shared/src/errors.ts`

No changes required — all shared artefacts were already in place.

**Checkpoint 1:**
- [x] `pnpm build` — 0 errors
- [x] `pnpm lint` — clean

---

## Phase 2 — Database

- [x] `Note` model with `deletedAt DateTime?` — already in `prisma/schema.prisma`
- [x] `@@index([userId])`, `@@index([deletedAt])` — already present
- [x] `NoteTag` join model with cascade delete — already present

No migration required — schema was already correct.

**Checkpoint 2:**
- [x] `pnpm build` — 0 errors
- [x] `pnpm lint` — clean

---

## Phase 3 — Repository Layer

- [x] Create `apps/backend/src/repositories/NoteRepository.ts`
- [x] Define file-local `INoteRecord` domain type (includes `tags` array)
- [x] Define `noteInclude` constant — `{ noteTags: { include: { tag: true } } }`
- [x] Define `mapRecord` helper — maps Prisma result to `INoteRecord`
- [x] Implement `findAllByUserId` — `findMany` where `{ userId, deletedAt: null }`
- [x] Implement `findByIdAndUserId` — `findFirst` where `{ id, userId, deletedAt: null }`, returns null for not found / wrong owner / soft-deleted
- [x] Implement `create` — `prisma.note.create`, includes tags
- [x] Implement `update` — `prisma.note.update` with partial data, includes tags
- [x] Implement `softDelete` — sets `deletedAt: new Date()`
- [x] Verify: all methods return domain types, no raw Prisma objects returned

**Checkpoint 3:**
- [x] `pnpm build` — 0 errors
- [x] `pnpm lint` — clean

---

## Phase 4 — Service Layer

- [x] Create `apps/backend/src/services/NoteService.ts`
- [x] Define file-local `mapToResponse` helper — maps `INoteRecord` to `INoteResponse` (Date → ISO string)
- [x] Implement `listNotes(userId)` — delegates to `NoteRepository.findAllByUserId`, maps results
- [x] Implement `getNote(id, userId)` — calls `findByIdAndUserId`, throws `NOTE_NOT_FOUND` (404) if null
- [x] Implement `createNote(userId, data)` — calls `NoteRepository.create`, returns mapped note
- [x] Implement `updateNote(id, userId, data)` — guards with `findByIdAndUserId` first, throws `NOTE_NOT_FOUND` if null, then calls `update`
- [x] Implement `deleteNote(id, userId)` — guards with `findByIdAndUserId` first, throws `NOTE_NOT_FOUND` if null, then calls `softDelete`
- [x] Verify: no `prisma.*` imports in service file
- [x] Verify: no `req`/`res` objects used in service file

**Checkpoint 4:**
- [x] `pnpm build` — 0 errors
- [x] `pnpm lint` — clean

---

## Phase 5 — Route Layer

- [x] Create `apps/backend/src/routes/noteRoutes.ts`
- [x] Implement `GET /` — `requireAuth`, calls `NoteService.listNotes(userId)`, responds `200 { data: [...] }`
- [x] Implement `POST /` — `requireAuth`, `validate(createNoteSchema)`, calls `NoteService.createNote(userId, body)`, responds `201 { data: note }`
- [x] Implement `GET /:id` — `requireAuth`, calls `NoteService.getNote(id, userId)`, responds `200 { data: note }`
- [x] Implement `PATCH /:id` — `requireAuth`, `validate(updateNoteSchema)`, calls `NoteService.updateNote(id, userId, body)`, responds `200 { data: note }`
- [x] Implement `DELETE /:id` — `requireAuth`, calls `NoteService.deleteNote(id, userId)`, responds `204` (no body)
- [x] Mount router in `apps/backend/src/app.ts` at `/api/notes`
- [x] Verify: no business logic in route handlers — only parse, validate, call service, respond
- [x] Verify: no Prisma imports in route file

**Checkpoint 5:**
- [x] `pnpm build` — 0 errors
- [x] `pnpm lint` — clean

---

## Phase 6 — Tests

**Unit tests** (`apps/backend/src/__tests__/unit/services/NoteService.test.ts`):

- [x] AC-N5: listNotes — returns mapped array of notes
- [x] AC-N6: listNotes — returns empty array when repository returns []
- [x] AC-N9: getNote — returns mapped note on happy path
- [x] AC-N10: getNote — throws NOTE_NOT_FOUND when repo returns null (not found)
- [x] AC-N11: getNote — throws NOTE_NOT_FOUND when repo returns null (wrong owner)
- [x] AC-N12: getNote — throws NOTE_NOT_FOUND when repo returns null (soft-deleted)
- [x] AC-N1: createNote — calls repo.create with correct { userId, title, content }, returns mapped note
- [x] AC-N2: createNote — default title "Untitled" and empty content propagated correctly
- [x] AC-N14: updateNote — calls findByIdAndUserId guard, then update; returns mapped note (title only)
- [x] AC-N15: updateNote — content-only update calls update with correct partial payload
- [x] AC-N16: updateNote — throws NOTE_NOT_FOUND when guard returns null (not found)
- [x] AC-N17: updateNote — throws NOTE_NOT_FOUND when guard returns null (soft-deleted)
- [x] AC-N18: updateNote — throws NOTE_NOT_FOUND when guard returns null (wrong owner)
- [x] AC-N21: deleteNote — calls softDelete on happy path
- [x] AC-N22: deleteNote — throws NOTE_NOT_FOUND when guard returns null (not found)
- [x] AC-N23: deleteNote — throws NOTE_NOT_FOUND when guard returns null (wrong owner)
- [x] AC-N24: deleteNote — throws NOTE_NOT_FOUND when guard returns null (already soft-deleted)
- [x] deleteNote — softDelete is NOT called when guard throws

**Integration tests** (`apps/backend/src/__tests__/integration/routes/notes.test.ts`):

- [x] AC-N1: POST /api/notes — valid title + content → 201, note object shape
- [x] AC-N2: POST /api/notes — empty body `{}` → 201, title="Untitled", content=""
- [x] AC-N3: POST /api/notes — title="" → 400 VALIDATION_ERROR
- [x] AC-N4: POST /api/notes — missing auth → 401 UNAUTHORIZED
- [x] AC-N5: GET /api/notes — returns user's active notes
- [x] AC-N6: GET /api/notes — excludes soft-deleted notes
- [x] AC-N7: GET /api/notes — cross-user isolation (only caller's notes returned)
- [x] AC-N8: GET /api/notes — missing auth → 401 UNAUTHORIZED
- [x] AC-N9: GET /api/notes/:id — returns owned note
- [x] AC-N10: GET /api/notes/:id — not found → 404 NOTE_NOT_FOUND
- [x] AC-N11: GET /api/notes/:id — other user's note → 404 NOTE_NOT_FOUND
- [x] AC-N12: GET /api/notes/:id — soft-deleted → 404 NOTE_NOT_FOUND
- [x] AC-N13: GET /api/notes/:id — missing auth → 401 UNAUTHORIZED
- [x] AC-N14: PATCH /api/notes/:id — update title → 200, updatedAt advances
- [x] AC-N15: PATCH /api/notes/:id — update content → 200
- [x] AC-N16: PATCH /api/notes/:id — not found → 404 NOTE_NOT_FOUND
- [x] AC-N17: PATCH /api/notes/:id — soft-deleted → 404 NOTE_NOT_FOUND
- [x] AC-N18: PATCH /api/notes/:id — other user's note → 404 NOTE_NOT_FOUND
- [x] AC-N19: PATCH /api/notes/:id — title="" → 400 VALIDATION_ERROR
- [x] AC-N20: PATCH /api/notes/:id — missing auth → 401 UNAUTHORIZED
- [x] AC-N21: DELETE /api/notes/:id — 204, subsequent GET returns 404
- [x] AC-N22: DELETE /api/notes/:id — not found → 404 NOTE_NOT_FOUND
- [x] AC-N23: DELETE /api/notes/:id — other user's note → 404 NOTE_NOT_FOUND
- [x] AC-N24: DELETE /api/notes/:id — already soft-deleted → 404 NOTE_NOT_FOUND
- [x] AC-N25: DELETE /api/notes/:id — missing auth → 401 UNAUTHORIZED

**Checkpoint 6 (final):**
- [x] `pnpm build` — 0 errors
- [x] `pnpm lint` — clean
- [x] `pnpm test` — 127/127 passed
- [x] Coverage ≥ 80% on new files — 94.61% statements, 90.47% branches overall
