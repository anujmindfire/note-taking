# Tasks — AB-1005: Notes — Pagination, Sorting, Tag Filtering

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Shared Package

- [ ] Add `INotesPageMeta` interface to `packages/shared/src/types/index.ts`
- [ ] Add `listNotesQuerySchema` (Zod) to `packages/shared/src/schemas/index.ts`
- [ ] Add `TListNotesQuery` type alias (inferred from schema) to `packages/shared/src/schemas/index.ts`
- [ ] Export `INotesPageMeta` and `TListNotesQuery` from `packages/shared/src/index.ts`
- [ ] Verify: `tagId` field uses `.transform()` to normalise single string OR array → always `string[]`

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Database

- [ ] Add `@@index([userId, createdAt])` to `Note` model in `prisma/schema.prisma`
- [ ] Add `@@index([userId, updatedAt])` to `Note` model in `prisma/schema.prisma`
- [ ] Add `@@index([tagId])` to `NoteTag` model in `prisma/schema.prisma`
- [ ] Run migration: `pnpm --filter backend prisma migrate dev --name add_note_sort_and_tag_filter_indexes`
- [ ] Verify migration is additive only (no dropped columns or tables)

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Repository Layer

- [ ] Add `findPaginated` method to `apps/backend/src/repositories/NoteRepository.ts`
  - [ ] Accepts `(userId, { page, limit, sortBy, sortDir, tagIds })` — returns `{ notes: INoteRecord[]; total: number }`
  - [ ] Uses `prisma.$transaction([findMany, count])` — both queries share the same `where` object
  - [ ] `where` includes `deletedAt: null` (soft-delete exclusion)
  - [ ] `where` includes `noteTags: { some: { tagId: { in: tagIds } } }` only when `tagIds.length > 0`
  - [ ] `orderBy: { [sortBy]: sortDir }` — dynamic field, no string branching
  - [ ] `skip: (page - 1) * limit`, `take: limit`
  - [ ] `include: noteInclude` (existing constant) — no N+1
  - [ ] Returns `notes: rows.map(mapRecord)` — no raw Prisma objects
- [ ] Keep existing `findAllByUserId` unchanged (not removed)

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — Service Layer

- [ ] Update `listNotes` signature in `apps/backend/src/services/NoteService.ts`
  - [ ] New signature: `listNotes(userId: string, params: TListNotesQuery): Promise<{ notes: INoteResponse[]; total: number; page: number; limit: number; totalPages: number }>`
  - [ ] Calls `NoteRepository.findPaginated(userId, { page, limit, sortBy, sortDir, tagIds: params.tagId })`
  - [ ] Maps notes: `notes.map(mapToResponse)`
  - [ ] Computes `totalPages: Math.ceil(total / params.limit)` (equals 0 when total=0)
  - [ ] Returns `{ notes, total, page: params.page, limit: params.limit, totalPages }`
- [ ] Verify: no `prisma.*` imports in service file
- [ ] Verify: no `req`/`res` objects in service file

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — Route Layer

- [ ] Add `validateQuery` function to `apps/backend/src/middleware/validate.ts`
  - [ ] Accepts a `ZodSchema`, parses `req.query`
  - [ ] On failure: calls `next(createError(400, VALIDATION_ERROR, "Validation failed", fields))`
  - [ ] On success: stores parsed result in `res.locals["parsedQuery"]` (not `req.query` — avoids `ParsedQs` type conflict)
  - [ ] No `any` types introduced
- [ ] Update `GET /` handler in `apps/backend/src/routes/noteRoutes.ts`
  - [ ] Add `validateQuery(listNotesQuerySchema)` as middleware before the async handler
  - [ ] Read `const query = res.locals["parsedQuery"] as TListNotesQuery`
  - [ ] Call `NoteService.listNotes(userId, query)`
  - [ ] Respond `res.json({ data: result.notes, meta: { total, page, limit, totalPages } })`
- [ ] Add imports to `noteRoutes.ts`: `validateQuery`, `listNotesQuerySchema`, `TListNotesQuery`, `INotesPageMeta`
- [ ] Verify: no business logic in route handler
- [ ] Verify: no Prisma imports in route file
- [ ] Verify: all other routes (`POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`) unchanged

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Every scenario row must have at least one test.

**Unit tests** (`apps/backend/src/__tests__/unit/services/NoteService.pagination.test.ts`):

- [ ] AC-P1: `listNotes` with default params — calls `findPaginated` with `{ page:1, limit:20, sortBy:'createdAt', sortDir:'desc', tagIds:[] }`, returns mapped notes and correct meta
- [ ] AC-P2: `listNotes` with `page=2, limit=2` — verifies `skip=(page-1)*limit` passed correctly
- [ ] AC-P3: `listNotes` when total=0 — `totalPages` equals 0
- [ ] AC-P4: `listNotes` when total=5, limit=2 — `totalPages` equals 3 (Math.ceil)
- [ ] AC-P5: `listNotes` with no tagId — `tagIds=[]` passed to repo (no filter applied)
- [ ] AC-P6: `listNotes` with two tagIds — `tagIds=[uuid1, uuid2]` passed to repo
- [ ] AC-P7: `listNotes` maps each note through `mapToResponse`
- [ ] AC-P8: `listNotes` returns `page` and `limit` unchanged from params

**Integration tests** (`apps/backend/src/__tests__/integration/routes/notes.pagination.test.ts`):

- [ ] AC-P1: GET /api/notes (default) — 200, `data` has all active notes, `meta.page=1`, `meta.limit=20`, `meta.total=N`, `meta.totalPages=1`
- [ ] AC-P2: GET /api/notes?page=2&limit=2 with 3 notes — 200, `data` has 1 note, `meta.page=2`, `meta.total=3`, `meta.totalPages=2`
- [ ] AC-P3: GET /api/notes?page=99 beyond last page — 200, `data=[]`, `meta.total=N`, `meta.page=99`
- [ ] AC-P4: GET /api/notes?page=0 — 400 VALIDATION_ERROR, `error.fields` contains "page"
- [ ] AC-P5: GET /api/notes?page=-1 — 400 VALIDATION_ERROR
- [ ] AC-P6: GET /api/notes?limit=0 — 400 VALIDATION_ERROR, `error.fields` contains "limit"
- [ ] AC-P7: GET /api/notes?limit=101 — 400 VALIDATION_ERROR (exceeds max 100)
- [ ] AC-P8: GET /api/notes with missing auth — 401 UNAUTHORIZED
- [ ] AC-P9: GET /api/notes?sortBy=createdAt&sortDir=desc — 200, newest note is `data[0]`
- [ ] AC-P10: GET /api/notes?sortBy=createdAt&sortDir=asc — 200, oldest note is `data[0]`
- [ ] AC-P11: GET /api/notes?sortBy=updatedAt&sortDir=desc — 200, most-recently-updated note is `data[0]`
- [ ] AC-P12: GET /api/notes?sortBy=title — 400 VALIDATION_ERROR
- [ ] AC-P13: GET /api/notes?sortDir=random — 400 VALIDATION_ERROR
- [ ] AC-P14: GET /api/notes?tagId={tagId} — 200, only notes with that tag returned; untagged note excluded
- [ ] AC-P15: GET /api/notes?tagId={tag1}&tagId={tag2} — 200, notes with EITHER tag returned (OR logic)
- [ ] AC-P16: GET /api/notes?tagId={random-valid-uuid} (non-existent) — 200, `data=[]`, `meta.total=0`
- [ ] AC-P17: GET /api/notes?tagId={other-user-tag-id} — 200, `data=[]` (cross-user tag isolation)
- [ ] AC-P18: GET /api/notes?tagId=notauuid — 400 VALIDATION_ERROR (tagId not a valid UUID)
- [ ] AC-P19: GET /api/notes?tagId={tagId} with soft-deleted tagged note — 200, soft-deleted note NOT in data
- [ ] AC-P20: GET /api/notes?tagId={X}&limit=2 with 3 tagged notes — 200, `data` has 2, `meta.total=3`, `meta.totalPages=2`
- [ ] AC-P21: GET /api/notes?sortBy=createdAt&sortDir=desc&limit=2&page=2 — 200, correct note on page 2

**Checkpoint 6 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green (including existing N1–N25 tests)
- [ ] Coverage ≥ 80% on new files
