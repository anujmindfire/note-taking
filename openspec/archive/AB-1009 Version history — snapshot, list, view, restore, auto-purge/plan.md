# Plan — AB-1009: Version History

**Based on spec:** openspec/changes/AB-1009 Version history — snapshot, list, view, restore, auto-purge/spec.md
**Spec status:** Approved

---

## Phase 1 — Shared Package

Files to modify in `packages/shared/`:

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `src/errors.ts` | Add `VERSION_NOT_FOUND` |
| MODIFY | `src/types/index.ts` | Add and export `INoteVersion` |

**`src/errors.ts` — add one entry to the `ErrorCode` const:**

```typescript
VERSION_NOT_FOUND: "VERSION_NOT_FOUND",
```

**`src/types/index.ts` — add interface:**

```typescript
export interface INoteVersion {
  id: string;
  noteId: string;
  version: number;
  title: string;
  content: string;
  createdAt: string; // ISO 8601
}
```

No new Zod schemas: all version endpoints take URL path parameters only; no request body.

**Checkpoint after Phase 1:**
```bash
pnpm build && pnpm lint --max-warnings 0
```

---

## Phase 2 — Database

**Migration name:** `add_note_version`

**`apps/backend/prisma/schema.prisma` changes:**

Add new model `NoteVersion`:

```prisma
model NoteVersion {
  id        String   @id @default(uuid())
  noteId    String
  version   Int
  title     String
  content   String
  createdAt DateTime @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@unique([noteId, version])
  @@index([noteId])
}
```

Add back-reference relation to existing `Note` model (add one line):

```prisma
model Note {
  // ...all existing fields and relations unchanged...
  versions    NoteVersion[]
}
```

**Migration command:**
```bash
pnpm --filter backend prisma migrate dev --name add_note_version
```

Migration is: **ADDITIVE** — new table only, no existing columns changed or dropped. Existing notes will have zero version rows after migration; version 1 is created on the next create or update call.

**Checkpoint after Phase 2:**
```bash
pnpm build && pnpm lint --max-warnings 0
```

---

## Phase 3 — Repository Layer

| Action | File | Methods |
|--------|------|---------|
| CREATE | `apps/backend/src/repositories/VersionRepository.ts` | `getMaxVersion`, `create`, `findAllByNoteId`, `findByIdAndNoteId`, `purgeOldVersions` |
| MODIFY | `apps/backend/src/repositories/NoteRepository.ts` | Add `findByIdAndUserIdIncludeDeleted`, add `restore` |

---

### `VersionRepository.ts` (new)

**Internal domain record interface** (file-local, not exported):

```typescript
interface INoteVersionRecord {
  id: string;
  noteId: string;
  version: number;
  title: string;
  content: string;
  createdAt: Date;
}
```

**`mapRecord` function** — maps raw Prisma row to `INoteVersionRecord`:
```typescript
function mapRecord(v: { id: string; noteId: string; version: number; title: string; content: string; createdAt: Date }): INoteVersionRecord
```

---

**Methods:**

#### `getMaxVersion(noteId: string): Promise<number>`
- Runs: `prisma.noteVersion.aggregate({ where: { noteId }, _max: { version: true } })`
- Returns `result._max.version ?? 0` (returns 0 when note has no versions yet so first snapshot becomes version 1)

#### `create(data: { noteId: string; version: number; title: string; content: string }): Promise<INoteVersionRecord>`
- Runs: `prisma.noteVersion.create({ data })`
- Returns: `mapRecord(row)`

#### `findAllByNoteId(noteId: string): Promise<INoteVersionRecord[]>`
- Runs: `prisma.noteVersion.findMany({ where: { noteId }, orderBy: { version: 'desc' } })`
- Returns: `rows.map(mapRecord)` — sorted newest-first

#### `findByIdAndNoteId(id: string, noteId: string): Promise<INoteVersionRecord | null>`
- Runs: `prisma.noteVersion.findFirst({ where: { id, noteId } })`
- The `noteId` filter prevents cross-note access (spec S10)
- Returns: `row ? mapRecord(row) : null`

#### `purgeOldVersions(maxPerNote: number, retentionDays: number): Promise<void>`
- Computes `cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)`
- Fetches all distinct `noteId` values: `prisma.noteVersion.findMany({ select: { noteId: true }, distinct: ['noteId'] })`
- For each `noteId`:
  1. Fetch `keepRows`: top `maxPerNote` versions ordered by `version DESC`, select `id` only
  2. `if (keepRows.length < maxPerNote) continue` — fewer than limit, nothing can be purged per AND policy
  3. `keepIds = keepRows.map(v => v.id)` — always includes the max-version row (rank 1), satisfying A10
  4. `prisma.noteVersion.deleteMany({ where: { noteId, id: { notIn: keepIds }, createdAt: { lt: cutoffDate } } })`
- The AND is enforced by: `notIn: keepIds` (rank condition) AND `createdAt: { lt: cutoffDate }` (age condition)

---

### `NoteRepository.ts` (modify — add 2 methods)

#### `findByIdAndUserIdIncludeDeleted(id: string, userId: string): Promise<INoteRecord | null>`
- Identical to `findByIdAndUserId` except the `where` clause omits `deletedAt: null`
- Runs: `prisma.note.findFirst({ where: { id, userId }, include: noteInclude })`
- Returns: `note ? mapRecord(note) : null`
- Used by all three version endpoints to allow access to soft-deleted note histories (spec A13)

#### `restore(id: string, data: { title: string; content: string }): Promise<INoteRecord>`
- Runs: `prisma.note.update({ where: { id }, data: { title: data.title, content: data.content, deletedAt: null }, include: noteInclude })`
- Setting `deletedAt: null` un-deletes the note if it was soft-deleted (spec A5, S15)
- Returns: `mapRecord(updated)`

**Checkpoint after Phase 3:**
```bash
pnpm build && pnpm lint --max-warnings 0
```

---

## Phase 4 — Service Layer

| Action | File | Methods |
|--------|------|---------|
| CREATE | `apps/backend/src/services/VersionService.ts` | `snapshot`, `listVersions`, `getVersion`, `restoreVersion` |
| MODIFY | `apps/backend/src/services/NoteService.ts` | `createNote`, `updateNote` (add snapshot side-effects) |

---

### `VersionService.ts` (new)

Imports: `ErrorCode`, `INoteVersion`, `INoteResponse` from `@noteapp/shared`; `VersionRepository` from repositories; `NoteRepository` from repositories; `createError` from middleware.

**`mapToVersionResponse` helper** — converts `INoteVersionRecord` to `INoteVersion`:
```typescript
function mapToVersionResponse(v: INoteVersionRecord): INoteVersion {
  return { id: v.id, noteId: v.noteId, version: v.version, title: v.title, content: v.content, createdAt: v.createdAt.toISOString() };
}
```

---

#### `snapshot(noteId: string, title: string, content: string): Promise<void>`
- Calls `VersionRepository.getMaxVersion(noteId)` → `maxVersion`
- Calls `VersionRepository.create({ noteId, version: maxVersion + 1, title, content })`
- Does NOT catch errors — callers (NoteService) are responsible for swallowing (see NoteService changes below)

#### `listVersions(noteId: string, userId: string): Promise<INoteVersion[]>`
- Calls `NoteRepository.findByIdAndUserIdIncludeDeleted(noteId, userId)`
- If null: throws `createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found")`
- Calls `VersionRepository.findAllByNoteId(noteId)` → `records`
- Returns `records.map(mapToVersionResponse)`

#### `getVersion(noteId: string, versionId: string, userId: string): Promise<INoteVersion>`
- Calls `NoteRepository.findByIdAndUserIdIncludeDeleted(noteId, userId)`
- If null: throws `createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found")`
- Calls `VersionRepository.findByIdAndNoteId(versionId, noteId)`
- If null: throws `createError(404, ErrorCode.VERSION_NOT_FOUND, "Version not found")`
- Returns `mapToVersionResponse(record)`

#### `restoreVersion(noteId: string, versionId: string, userId: string): Promise<INoteResponse>`
- Calls `NoteRepository.findByIdAndUserIdIncludeDeleted(noteId, userId)`
- If null: throws `createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found")`
- Calls `VersionRepository.findByIdAndNoteId(versionId, noteId)`
- If null: throws `createError(404, ErrorCode.VERSION_NOT_FOUND, "Version not found")`
- Calls `NoteRepository.restore(noteId, { title: version.title, content: version.content })`
- Fire-and-effect snapshot: wraps `VersionService.snapshot(noteId, version.title, version.content)` in try/catch; logs warning on failure, does not re-throw (consistent with A2)
- Returns `mapNoteToResponse(updated)` using the same `mapToResponse` function shape as NoteService

**`mapNoteToResponse` in VersionService** — same mapping logic as NoteService's `mapToResponse`; maps the `INoteRecord` returned by `NoteRepository.restore` to `INoteResponse`. Define locally to avoid importing from NoteService (which would create a circular dependency risk).

---

### `NoteService.ts` (modify — 2 methods)

Add import: `import { VersionService } from './VersionService.js';`

#### `createNote` — add after successful `NoteRepository.create`:
```typescript
try {
  await VersionService.snapshot(note.id, note.title, note.content);
} catch (err) {
  console.warn('[NoteService] snapshot failed after create:', err);
}
```

#### `updateNote` — add after successful `NoteRepository.update`:
```typescript
try {
  await VersionService.snapshot(updated.id, updated.title, updated.content);
} catch (err) {
  console.warn('[NoteService] snapshot failed after update:', err);
}
```

`updated.title` and `updated.content` reflect the final state of the note after the partial PATCH, so the snapshot always captures the current full state.

**Checkpoint after Phase 4:**
```bash
pnpm build && pnpm lint --max-warnings 0
```

---

## Phase 5 — Route Layer

| Action | File | What changes |
|--------|------|-------------|
| CREATE | `apps/backend/src/routes/versionRoutes.ts` | GET `/`, GET `/:versionId`, POST `/:versionId/restore` |
| MODIFY | `apps/backend/src/routes/noteRoutes.ts` | Mount `versionRoutes` at `/:id/versions` |
| MODIFY | `apps/backend/src/index.ts` | Call `startScheduler()` on server startup |
| CREATE | `apps/backend/src/scheduler.ts` | Background purge cron via `setInterval` |

---

### `versionRoutes.ts` (new)

```typescript
const router: ExpressRouter = Router({ mergeParams: true });
// mergeParams: true is required so req.params.id (noteId from parent router) is accessible
```

Each handler follows the same try/catch → next(err) pattern as all other route files.

#### `GET /` → list versions
```typescript
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const versions = await VersionService.listVersions(req.params.id as string, userId);
    res.json({ data: versions });
  } catch (err) { next(err); }
});
```

#### `GET /:versionId` → view single version
```typescript
router.get('/:versionId', requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const version = await VersionService.getVersion(req.params.id as string, req.params.versionId as string, userId);
    res.json({ data: version });
  } catch (err) { next(err); }
});
```

#### `POST /:versionId/restore` → restore version
```typescript
router.post('/:versionId/restore', requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const note = await VersionService.restoreVersion(req.params.id as string, req.params.versionId as string, userId);
    res.json({ data: note });
  } catch (err) { next(err); }
});
```

---

### `noteRoutes.ts` (modify — add 2 lines)

Add import:
```typescript
import { versionRoutes } from './versionRoutes.js';
```

Add mount before the export (after all existing route definitions):
```typescript
router.use('/:id/versions', versionRoutes);
```

`app.ts` does **not** need to change — version routes are nested inside the already-mounted `/api/notes` prefix.

---

### `scheduler.ts` (new — `apps/backend/src/scheduler.ts`)

```typescript
import { VersionRepository } from './repositories/VersionRepository.js';

export function startScheduler(): void {
  const maxPerNote = Number(process.env['VERSION_MAX_PER_NOTE'] ?? '50');
  const retentionDays = Number(process.env['VERSION_RETENTION_DAYS'] ?? '90');
  const intervalMs = Number(process.env['VERSION_PURGE_INTERVAL_HOURS'] ?? '24') * 60 * 60 * 1000;

  setInterval(async () => {
    try {
      await VersionRepository.purgeOldVersions(maxPerNote, retentionDays);
    } catch (err) {
      console.error('[scheduler] Version purge failed:', err);
    }
  }, intervalMs);
}
```

Uses `setInterval` — no new npm dependency required.

---

### `index.ts` (modify — add 2 lines)

Add import:
```typescript
import { startScheduler } from './scheduler.js';
```

Call after `app.listen(...)` callback:
```typescript
app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  startScheduler();
});
```

**Checkpoint after Phase 5:**
```bash
pnpm build && pnpm lint --max-warnings 0
```

---

## Phase 6 — Tests

Delegated to test-writer agent. All scenarios S1–S22 must be covered.

| File | Type | Scenarios |
|------|------|-----------|
| `apps/backend/src/__tests__/unit/services/VersionService.test.ts` | Unit | S3–S18 (listVersions, getVersion, restoreVersion — mocked repos) |
| `apps/backend/src/__tests__/unit/services/NoteService.test.ts` | Unit (modify) | S1, S2 — assert VersionService.snapshot is called after createNote and updateNote |
| `apps/backend/src/__tests__/unit/services/VersionRepository.test.ts` | Unit | S19–S22 — purgeOldVersions with mocked Prisma |
| `apps/backend/src/__tests__/integration/routes/versions.test.ts` | Integration | S1–S18 via Supertest |

**Test naming convention:** `AC-{S-id}: {scenario name}` (e.g., `AC-S3: List versions — happy path`)

**Key patterns for integration tests:**
- Reset DB with `prisma migrate reset --force` in `beforeAll`/`beforeEach`
- All integration tests use `TEST_DATABASE_URL`
- Auth setup: register + login to get `accessToken`, pass as `Authorization: Bearer <token>`
- Create note via `POST /api/notes` to seed test data (also implicitly tests S1)
- Assert error code string: `expect(res.body.error.code).toBe("VERSION_NOT_FOUND")`
- For S14 (history immutability): after restore, fetch all versions and assert prior version records are unchanged by ID and content
- For S15 (un-delete): after restore, `GET /api/notes/:id` should return the note (it is no longer soft-deleted)

**Checkpoint after Phase 6:**
```bash
pnpm build && pnpm lint --max-warnings 0 && pnpm test && pnpm test --coverage
```

---

## Checkpoints Summary

| After Phase | Command |
|-------------|---------|
| 1 — Shared Package | `pnpm build && pnpm lint --max-warnings 0` |
| 2 — Database | `pnpm build && pnpm lint --max-warnings 0` |
| 3 — Repository | `pnpm build && pnpm lint --max-warnings 0` |
| 4 — Service | `pnpm build && pnpm lint --max-warnings 0` |
| 5 — Routes + Scheduler | `pnpm build && pnpm lint --max-warnings 0` |
| 6 — Tests | `pnpm build && pnpm lint --max-warnings 0 && pnpm test && pnpm test --coverage` |

Stop on any failure. Fix before continuing.

---

## Risks & Assumptions

| # | Risk / Assumption | Mitigation |
|---|-------------------|-----------|
| R1 | `purgeOldVersions` iterates all distinct `noteId`s in a loop. At scale this could be slow. | Acceptable for current scope (tutorial app, single-region). Add batching if volume grows. |
| R2 | Snapshot side-effect in `createNote`/`updateNote` is fire-and-effect: a failed snapshot is logged but does not surface to the API caller. | Per spec A2. If atomicity is needed later, wrap both in a Prisma `$transaction`. |
| R3 | `Router({ mergeParams: true })` is required in `versionRoutes.ts`; forgetting it causes `req.params.id` to be `undefined`. | Documented in route file with an inline comment per the architecture note. |
| R4 | `NoteService` and `VersionService` import each other indirectly: `NoteService` → `VersionService` → `VersionRepository`. `VersionService.restoreVersion` calls `NoteRepository` directly (not `NoteService`) to avoid circular imports. | Enforced by the design: VersionService never imports NoteService. |
| R5 | `scheduler.ts` uses `setInterval` on the event loop. A long-running purge that exceeds the interval period could overlap. | Acceptable for tutorial scope. Production hardening: use a mutex flag or a proper job queue. |
| R6 | `startScheduler()` is called inside `index.ts` (not `createApp()` in `app.ts`), so the scheduler does not start during integration tests that call `createApp()` directly. | Correct by design — keeps tests deterministic. |
