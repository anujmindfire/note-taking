# Tasks — AB-1006: Tags — CRUD + Note Count per Tag

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Shared Package

- [ ] Update `ITagResponse` in `packages/shared/src/types/index.ts` — add `color: string | null` and `noteCount: number`
- [ ] Replace `createTagSchema` in `packages/shared/src/schemas/index.ts` — add optional `color` field (hex regex, nullable)
- [ ] Add `updateTagSchema` — both `name` and `color` optional; same hex regex on `color`
- [ ] Add `listTagsQuerySchema` — `sortBy: enum(['name','noteCount']).default('name')`, `sortDir: enum(['asc','desc']).default('asc')`
- [ ] Add type aliases: `TCreateTagInput`, `TUpdateTagInput`, `TListTagsQuery` (all via `z.infer`)
- [ ] Verify all new exports are re-exported from `packages/shared/src/index.ts`

**Checkpoint 1:**
- [ ] `pnpm --filter backend build` — 0 errors
- [ ] `pnpm --filter backend lint --max-warnings 0`

---

## Phase 2 — Database

- [ ] Add `color String?` field to `Tag` model in `apps/backend/prisma/schema.prisma`
- [ ] Run migration: `pnpm --filter backend prisma migrate dev --name add_tag_color`
- [ ] Verify client is up to date: `pnpm --filter backend prisma generate`

**Checkpoint 2:**
- [ ] `pnpm --filter backend build` — 0 errors
- [ ] `pnpm --filter backend lint --max-warnings 0`

---

## Phase 3 — Repository Layer

### NoteRepository.ts (modify)
- [ ] Update `noteInclude` constant — add `_count: { select: { noteTags: { where: { note: { deletedAt: null } } } } }` inside `tag` include
- [ ] Update `mapRecord` tag mapping — add `color: nt.tag.color` and `noteCount: nt.tag._count.noteTags`
- [ ] Update the file-local `INoteRecord` tag shape to include `color` and `_count` fields so TypeScript is satisfied

### TagRepository.ts (create)
- [ ] Create `apps/backend/src/repositories/TagRepository.ts`
- [ ] Define file-local `ITagRecord` interface — `id, userId, name, normalizedName, color, noteCount, createdAt`
- [ ] Define `noteCountSelect` constant — Prisma `_count.noteTags` filtered to `note.deletedAt: null`
- [ ] Implement file-local `mapRecord` helper — maps Prisma tag + `_count` to `ITagRecord`
- [ ] Implement `findAllByUserId(userId)` — `findMany` with `_count`; returns `ITagRecord[]`
- [ ] Implement `findByIdAndUserId(id, userId)` — `findFirst`; returns `ITagRecord | null`
- [ ] Implement `findByNormalizedName(userId, normalizedName)` — `findFirst`; returns `ITagRecord | null`
- [ ] Implement `create(data)` — `tag.create` with `_count`; returns `ITagRecord`
- [ ] Implement `update(id, data)` — `tag.update` with `_count`; returns `ITagRecord`
- [ ] Implement `delete(id)` — `tag.delete`; returns `void`
- [ ] Implement `attachTagToNote(noteId, tagId)` — `noteTag.upsert` (idempotent); returns `void`
- [ ] Implement `detachTagFromNote(noteId, tagId)` — `noteTag.deleteMany` (idempotent); returns `void`
- [ ] Verify: no raw Prisma objects returned from any method — all results mapped through `mapRecord`

**Checkpoint 3:**
- [ ] `pnpm --filter backend build` — 0 errors
- [ ] `pnpm --filter backend lint --max-warnings 0`

---

## Phase 4 — Service Layer

- [ ] Create `apps/backend/src/services/TagService.ts`
- [ ] Define file-local `mapToResponse(tag: ITagRecord): ITagResponse` helper
- [ ] Implement `listTags(userId, query: TListTagsQuery)` — calls `findAllByUserId`; sorts in application code by `sortBy`/`sortDir`; returns `ITagResponse[]`
- [ ] Implement `createTag(userId, data: TCreateTagInput)` — normalizes name; checks duplicate via `findByNormalizedName`; throws `TAG_NAME_TAKEN` (422) if found; calls `create`; returns `ITagResponse`
- [ ] Implement `updateTag(id, userId, data: TUpdateTagInput)` — checks ownership (`findByIdAndUserId`) → throws `TAG_NOT_FOUND` (404); if `data.name` provided and `normalizedName !== existing.normalizedName`, checks duplicate → throws `TAG_NAME_TAKEN` (422); calls `update`; returns `ITagResponse`
- [ ] Implement `deleteTag(id, userId)` — checks ownership → throws `TAG_NOT_FOUND` (404); calls `delete`; returns `void`
- [ ] Implement `attachTag(noteId, tagId, userId)` — checks note (`NoteRepository.findByIdAndUserId`) → throws `NOTE_NOT_FOUND` (404); checks tag (`TagRepository.findByIdAndUserId`) → throws `TAG_NOT_FOUND` (404); calls `attachTagToNote`; re-fetches note; returns `INoteResponse`
- [ ] Implement `detachTag(noteId, tagId, userId)` — checks note → throws `NOTE_NOT_FOUND` (404); checks tag → throws `TAG_NOT_FOUND` (404); calls `detachTagFromNote`; re-fetches note; returns `INoteResponse`
- [ ] Verify: zero Prisma imports in `TagService.ts`
- [ ] Verify: zero `req`/`res` references in `TagService.ts`

**Checkpoint 4:**
- [ ] `pnpm --filter backend build` — 0 errors
- [ ] `pnpm --filter backend lint --max-warnings 0`

---

## Phase 5 — Route Layer

### tagRoutes.ts (create)
- [ ] Create `apps/backend/src/routes/tagRoutes.ts` with an Express `Router`
- [ ] Implement `GET /` — `requireAuth`, `validateQuery(listTagsQuerySchema)`, calls `TagService.listTags`; responds `{ data: tags }`
- [ ] Implement `POST /` — `requireAuth`, `validate(createTagSchema)`, calls `TagService.createTag`; responds 201 `{ data: tag }`
- [ ] Implement `PATCH /:id` — `requireAuth`, `validate(updateTagSchema)`, calls `TagService.updateTag`; responds `{ data: tag }`
- [ ] Implement `DELETE /:id` — `requireAuth`, calls `TagService.deleteTag`; responds 204 no body
- [ ] Verify: no business logic in any handler — parse → call service → send response only

### noteRoutes.ts (modify)
- [ ] Import `TagService` from `../services/TagService.js`
- [ ] Add `POST /:id/tags/:tagId` — `requireAuth`, calls `TagService.attachTag(req.params.id, req.params.tagId, userId)`; responds `{ data: note }`
- [ ] Add `DELETE /:id/tags/:tagId` — `requireAuth`, calls `TagService.detachTag(req.params.id, req.params.tagId, userId)`; responds `{ data: note }`

### app.ts (modify)
- [ ] Import `tagRoutes` from `./routes/tagRoutes.js`
- [ ] Mount: `app.use("/api/tags", tagRoutes)`
- [ ] Verify: `tagRoutes` mounted before the generic error handler

**Checkpoint 5:**
- [ ] `pnpm --filter backend build` — 0 errors
- [ ] `pnpm --filter backend lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate entirely to the test-writer agent. Every scenario ID below must have at least one test.
Test naming format: `AC-{ID}: {scenario name}`.

### Unit tests — `apps/backend/src/__tests__/unit/services/TagService.test.ts`

- [ ] AC-T1: List tags — default sort (name asc)
- [ ] AC-T3: List tags — sort by noteCount desc
- [ ] AC-T4: List tags — sort by name desc
- [ ] AC-T7: List tags — noteCount excludes soft-deleted notes
- [ ] AC-T8: List tags — cross-user isolation
- [ ] AC-T12: Create tag — duplicate name (exact)
- [ ] AC-T13: Create tag — duplicate name (case-insensitive)
- [ ] AC-T14: Create tag — same name, different user allowed
- [ ] AC-T24: Rename tag — duplicate name (case-insensitive)
- [ ] AC-T25: Rename tag — same name as self (no-op)
- [ ] AC-T26: Update tag — not found
- [ ] AC-T27: Update tag — other user's tag returns not found
- [ ] AC-T29: Delete tag — happy path (verifies repository called)
- [ ] AC-T30: Delete tag — not found
- [ ] AC-T31: Delete tag — other user's tag returns not found
- [ ] AC-T33: Attach tag — happy path (note re-fetched after attach)
- [ ] AC-T34: Attach tag — idempotent (no error on re-attach)
- [ ] AC-T35: Attach tag — note not found
- [ ] AC-T37: Attach tag — tag not found
- [ ] AC-T38: Attach tag — both not found (NOTE_NOT_FOUND takes precedence)
- [ ] AC-T42: Detach tag — happy path
- [ ] AC-T43: Detach tag — idempotent (no error when not attached)
- [ ] AC-T44: Detach tag — note not found
- [ ] AC-T46: Detach tag — tag not found

### Integration tests — `apps/backend/src/__tests__/integration/routes/tags.test.ts`

- [ ] AC-T1: List tags — default sort
- [ ] AC-T2: List tags — empty list
- [ ] AC-T3: List tags — sort by noteCount desc
- [ ] AC-T4: List tags — sort by name desc
- [ ] AC-T5: List tags — invalid sortBy
- [ ] AC-T6: List tags — invalid sortDir
- [ ] AC-T7: List tags — noteCount excludes soft-deleted notes
- [ ] AC-T8: List tags — cross-user isolation
- [ ] AC-T9: List tags — missing auth
- [ ] AC-T10: Create tag — name + color
- [ ] AC-T11: Create tag — name only, color null
- [ ] AC-T12: Create tag — duplicate name (exact)
- [ ] AC-T13: Create tag — duplicate name (case-insensitive)
- [ ] AC-T14: Create tag — same name, different user
- [ ] AC-T15: Create tag — invalid color format
- [ ] AC-T16: Create tag — missing name
- [ ] AC-T17: Create tag — empty name
- [ ] AC-T18: Create tag — name too long (>50 chars)
- [ ] AC-T19: Create tag — missing auth
- [ ] AC-T20: Rename tag — update name
- [ ] AC-T21: Update tag — update color
- [ ] AC-T22: Update tag — clear color (set to null)
- [ ] AC-T23: Update tag — empty body no-op
- [ ] AC-T24: Rename tag — duplicate name (case-insensitive)
- [ ] AC-T25: Rename tag — same name as self
- [ ] AC-T26: Update tag — not found
- [ ] AC-T27: Update tag — other user's tag
- [ ] AC-T28: Update tag — missing auth
- [ ] AC-T29: Delete tag — happy path (notes still exist after)
- [ ] AC-T30: Delete tag — not found
- [ ] AC-T31: Delete tag — other user's tag
- [ ] AC-T32: Delete tag — missing auth

### Integration tests — `apps/backend/src/__tests__/integration/routes/notes.tags.test.ts`

- [ ] AC-T33: Attach tag — happy path
- [ ] AC-T34: Attach tag — idempotent
- [ ] AC-T35: Attach tag — note not found
- [ ] AC-T36: Attach tag — note soft-deleted
- [ ] AC-T37: Attach tag — tag not found
- [ ] AC-T38: Attach tag — both not found (NOTE_NOT_FOUND first)
- [ ] AC-T39: Attach tag — other user's note
- [ ] AC-T40: Attach tag — other user's tag
- [ ] AC-T41: Attach tag — missing auth
- [ ] AC-T42: Detach tag — happy path
- [ ] AC-T43: Detach tag — idempotent
- [ ] AC-T44: Detach tag — note not found
- [ ] AC-T45: Detach tag — note soft-deleted
- [ ] AC-T46: Detach tag — tag not found
- [ ] AC-T47: Detach tag — missing auth

**Checkpoint 6 (final):**
- [ ] `pnpm --filter backend build` — 0 errors
- [ ] `pnpm --filter backend lint --max-warnings 0`
- [ ] `pnpm --filter backend test` — all green
- [ ] Coverage ≥ 80% on all new files (`TagRepository.ts`, `TagService.ts`, `tagRoutes.ts`)
