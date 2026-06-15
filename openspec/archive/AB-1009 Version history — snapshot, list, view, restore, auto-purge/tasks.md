# Tasks — AB-1009: Version History

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Shared Package

- [ ] Add `VERSION_NOT_FOUND: "VERSION_NOT_FOUND"` to `packages/shared/src/errors.ts`
- [ ] Add `INoteVersion` interface to `packages/shared/src/types/index.ts`
- [ ] Verify `INoteVersion` is exported from `packages/shared/src/types/index.ts`

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Database

- [ ] Add `NoteVersion` model to `apps/backend/prisma/schema.prisma` with `@@unique([noteId, version])` and `@@index([noteId])`
- [ ] Add `versions NoteVersion[]` back-reference to the `Note` model
- [ ] Run migration: `pnpm --filter backend prisma migrate dev --name add_note_version`
- [ ] Verify Prisma client regenerated: `pnpm --filter backend prisma generate`

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Repository Layer

- [ ] Create `apps/backend/src/repositories/VersionRepository.ts`
- [ ] Define file-local `INoteVersionRecord` interface and `mapRecord` helper
- [ ] Implement `getMaxVersion(noteId: string): Promise<number>` — aggregate max version, return 0 if none
- [ ] Implement `create(data: { noteId, version, title, content }): Promise<INoteVersionRecord>`
- [ ] Implement `findAllByNoteId(noteId: string): Promise<INoteVersionRecord[]>` — ordered `version DESC`
- [ ] Implement `findByIdAndNoteId(id: string, noteId: string): Promise<INoteVersionRecord | null>` — filters on both `id` and `noteId` to prevent cross-note access
- [ ] Implement `purgeOldVersions(maxPerNote: number, retentionDays: number): Promise<void>` — AND-policy: delete only where rank > maxPerNote AND older than retentionDays; latest version is always in keepIds
- [ ] Modify `apps/backend/src/repositories/NoteRepository.ts` — add `findByIdAndUserIdIncludeDeleted(id, userId)` (omits `deletedAt: null` filter)
- [ ] Modify `apps/backend/src/repositories/NoteRepository.ts` — add `restore(id, { title, content })` (updates title, content, sets `deletedAt: null`, returns full `INoteRecord` with tags)
- [ ] Verify: no raw Prisma objects returned from any method — all results mapped through `mapRecord`

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — Service Layer

- [ ] Create `apps/backend/src/services/VersionService.ts`
- [ ] Define local `mapToVersionResponse` helper (converts `INoteVersionRecord` → `INoteVersion`)
- [ ] Define local `mapNoteToResponse` helper (converts `INoteRecord` → `INoteResponse`) — duplicated from NoteService to avoid circular dependency
- [ ] Implement `snapshot(noteId, title, content): Promise<void>` — calls `getMaxVersion` then `create`; does NOT swallow errors (callers swallow)
- [ ] Implement `listVersions(noteId, userId): Promise<INoteVersion[]>` — ownership check via `findByIdAndUserIdIncludeDeleted`, throws `NOTE_NOT_FOUND` if null
- [ ] Implement `getVersion(noteId, versionId, userId): Promise<INoteVersion>` — ownership check, then `findByIdAndNoteId`, throws `VERSION_NOT_FOUND` if null
- [ ] Implement `restoreVersion(noteId, versionId, userId): Promise<INoteResponse>` — ownership check, version lookup, `NoteRepository.restore`, fire-and-effect `snapshot` (wrapped in try/catch with `console.warn`)
- [ ] Modify `apps/backend/src/services/NoteService.ts` — import `VersionService`
- [ ] Modify `NoteService.createNote` — call `VersionService.snapshot` after `NoteRepository.create`; wrap in try/catch, log warning on failure
- [ ] Modify `NoteService.updateNote` — call `VersionService.snapshot` after `NoteRepository.update` using `updated.title` + `updated.content`; wrap in try/catch, log warning on failure
- [ ] Verify: no Prisma imports anywhere in `VersionService.ts`
- [ ] Verify: `VersionService` does not import `NoteService` (no circular dependency)

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — Routes & Scheduler

- [ ] Create `apps/backend/src/routes/versionRoutes.ts` with `Router({ mergeParams: true })`
- [ ] Implement `GET /` handler → `VersionService.listVersions(req.params.id, userId)` → `res.json({ data: versions })`
- [ ] Implement `GET /:versionId` handler → `VersionService.getVersion(req.params.id, req.params.versionId, userId)` → `res.json({ data: version })`
- [ ] Implement `POST /:versionId/restore` handler → `VersionService.restoreVersion(req.params.id, req.params.versionId, userId)` → `res.json({ data: note })`
- [ ] Verify: all three handlers use `requireAuth` middleware
- [ ] Verify: no business logic or Prisma imports in `versionRoutes.ts`
- [ ] Modify `apps/backend/src/routes/noteRoutes.ts` — import `versionRoutes` and add `router.use('/:id/versions', versionRoutes)`
- [ ] Create `apps/backend/src/scheduler.ts` — `startScheduler()` reads env vars `VERSION_MAX_PER_NOTE`, `VERSION_RETENTION_DAYS`, `VERSION_PURGE_INTERVAL_HOURS`; calls `VersionRepository.purgeOldVersions` on `setInterval`; errors caught and logged
- [ ] Modify `apps/backend/src/index.ts` — import `startScheduler` and call it inside the `app.listen` callback
- [ ] Verify: `startScheduler` is NOT called from `app.ts` (keeps tests clean)

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Every row in the spec scenario table must have at least one test.

**Unit tests** (`apps/backend/src/__tests__/unit/services/`):

- [ ] `VersionService.test.ts`
  - [ ] AC-S3: List versions — happy path
  - [ ] AC-S4: List versions — single entry
  - [ ] AC-S5: List versions — soft-deleted note
  - [ ] AC-S6: List versions — note not found
  - [ ] AC-S8: View single version — happy path
  - [ ] AC-S9: View single version — version not found
  - [ ] AC-S10: View single version — cross-note access
  - [ ] AC-S11: View single version — note not found
  - [ ] AC-S13: Restore version — happy path
  - [ ] AC-S14: Restore version — history immutability
  - [ ] AC-S15: Restore version — un-deletes soft-deleted note
  - [ ] AC-S16: Restore version — note not found
  - [ ] AC-S17: Restore version — version not found

- [ ] `NoteService.test.ts` (modify existing)
  - [ ] AC-S1: Snapshot on note creation
  - [ ] AC-S2: Snapshot on note update

- [ ] `VersionRepository.purge.test.ts`
  - [ ] AC-S19: Auto-purge — removes excess old versions
  - [ ] AC-S20: Auto-purge — preserves latest version always
  - [ ] AC-S21: Auto-purge — recent versions retained despite count
  - [ ] AC-S22: Auto-purge — old versions below count retained

**Integration tests** (`apps/backend/src/__tests__/integration/routes/`):

- [ ] `versions.test.ts`
  - [ ] AC-S1: Snapshot on note creation
  - [ ] AC-S2: Snapshot on note update
  - [ ] AC-S3: List versions — happy path
  - [ ] AC-S4: List versions — single entry
  - [ ] AC-S5: List versions — soft-deleted note
  - [ ] AC-S6: List versions — note not found
  - [ ] AC-S7: List versions — unauthenticated
  - [ ] AC-S8: View single version — happy path
  - [ ] AC-S9: View single version — version not found
  - [ ] AC-S10: View single version — cross-note access
  - [ ] AC-S11: View single version — note not found
  - [ ] AC-S12: View single version — unauthenticated
  - [ ] AC-S13: Restore version — happy path
  - [ ] AC-S14: Restore version — history immutability
  - [ ] AC-S15: Restore version — un-deletes soft-deleted note
  - [ ] AC-S16: Restore version — note not found
  - [ ] AC-S17: Restore version — version not found
  - [ ] AC-S18: Restore version — unauthenticated

**Checkpoint 6 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on all new files
