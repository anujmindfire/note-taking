# Spec — AB-1009: Version History

**Status:** Draft — awaiting approval
**Ticket:** AB-1009
**Branch:** feature/backend/AB-1009-version-history
**FRS References:** §4.2.1 AC4, §4.2.3 AC2, §4.6.1, §4.6.2, §4.6.3, §4.6.4
**SDS References:** §5.2 (NoteVersion schema), §8.1 (background job queue)
**Layer:** Backend only
**Depends on:** AB-1008 (sharing)

---

## Summary

Adds full version history tracking for notes. Every note creation and update automatically snapshots the current title and content as an immutable `NoteVersion` record. Authenticated note owners can list all versions for a note (with full content), view any individual version, and restore a previous version — which creates a new forward snapshot rather than mutating history, and un-deletes soft-deleted notes as a side-effect. A background cron job purges old versions beyond a configurable retention window (max count per note AND max age in days), while always preserving the most recent version.

---

## In Scope

- Auto-create version 1 when a note is created (side-effect added to `NoteService.createNote`)
- Auto-create the next incremental version when a note is updated (side-effect added to `NoteService.updateNote`)
- `GET /api/notes/:id/versions` — list all versions newest-first, full content included
- `GET /api/notes/:id/versions/:versionId` — view a single version
- `POST /api/notes/:id/versions/:versionId/restore` — restore a version; creates a new snapshot; un-deletes soft-deleted notes
- Background cron purge: delete versions where (rank from newest > `VERSION_MAX_PER_NOTE`) AND (older than `VERSION_RETENTION_DAYS` days); latest version is always exempt
- `NoteVersion` Prisma model and migration
- `VERSION_NOT_FOUND` error code added to shared package
- `INoteVersion` interface added to shared package
- New `VersionRepository`, `VersionService`, `versionRoutes`, and `scheduler.ts` modules

## Out of Scope

- Frontend UI for version history
- Diff or change comparison between versions
- Restoring individual fields (title-only or content-only)
- Purge-on-demand admin endpoint
- Public share endpoints exposing version history to anonymous viewers
- Any changes to auth, tag, or search flows

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | A snapshot is created on every successful `PATCH /api/notes/:id` call, regardless of whether content actually changed. Snapshot frequency is controlled by the client (autosave debounce). | FRS §4.2.3 AC2 |
| A2 | `VersionService` is a new service called by `NoteService` as a side-effect after a successful DB write. `VersionService` never calls `NoteService`. If snapshot insertion fails, the note save already succeeded — snapshot failure does not roll back the note write. | User answer Q1 |
| A3 | Purge policy applies AND semantics: a version is deleted only if BOTH conditions are true — (rank from newest > `VERSION_MAX_PER_NOTE`) AND (`createdAt` older than `VERSION_RETENTION_DAYS` days). Recent versions inside the window are always retained even if they exceed the count limit. | User answer Q2-c |
| A4 | Default retention values: `VERSION_MAX_PER_NOTE=50`, `VERSION_RETENTION_DAYS=90`. Both configurable via environment variables. The cron schedule is controlled by `VERSION_PURGE_INTERVAL_HOURS` (default: 24). | User answer Q2-c |
| A5 | A soft-deleted note's version history remains accessible. `GET /api/notes/:id/versions` and `GET /api/notes/:id/versions/:versionId` both work on soft-deleted notes. Restoring a version of a soft-deleted note clears `deletedAt`, un-deleting the note. | User answer Q3-b |
| A6 | List versions returns full snapshots including `content`, sorted by `version DESC` (newest first). | User answer Q4-b |
| A7 | Restore creates a new snapshot whose `title` and `content` exactly match the target version. No extra metadata field (e.g. `restoredFromVersion`) is stored. | User answer Q5-a |
| A8 | New version number is always `MAX(version) + 1` across all existing versions for that note. Gaps in version numbers after purge are acceptable. | User answer Q6-a |
| A9 | Background purge is a real cron job registered in a `scheduler.ts` module at server startup, running every `VERSION_PURGE_INTERVAL_HOURS` hours. It calls `VersionRepository.purgeOldVersions(maxPerNote, retentionDays)` directly — it sits outside the three-layer route/service/repository request stack. | User answer Q7, SDS §8.1 |
| A10 | The version with the highest `version` number for each note is always exempt from purge, regardless of age or rank. | FRS §4.6.4 AC2 |
| A11 | `NoteVersion` has `@@unique([noteId, version])` to prevent duplicate version numbers per note. | Derived from sequential increment requirement |
| A12 | Version endpoints check note ownership by looking up the note (including soft-deleted) by `id + userId`. Cross-user access returns `NOTE_NOT_FOUND`, not `VERSION_NOT_FOUND`, to avoid information leakage — consistent with the existing pattern on note endpoints. | FRS §4.6.2 AC2 |
| A13 | Version history endpoints require a new `NoteRepository.findByIdAndUserIdIncludeDeleted` method that omits the `deletedAt: null` filter, because the existing `findByIdAndUserId` silently excludes soft-deleted notes. | Observed from NoteRepository line 86 |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Snapshot on note creation | Authenticated user | `POST /api/notes` with valid body | HTTP 201 note returned; `NoteVersion` record created with `version=1`, matching note's title and content | §4.2.1 AC4 | — |
| S2 | Snapshot on note update | Authenticated owner; note exists | `PATCH /api/notes/:id` with valid body | HTTP 200 updated note returned; new `NoteVersion` created with `version = previous MAX + 1` | §4.2.3 AC2 | — |
| S3 | List versions — happy path | Authenticated owner; note has 3 versions | `GET /api/notes/:id/versions` | HTTP 200 `{ "data": [...] }` — array of 3 version objects sorted newest-first, each with `id, noteId, version, title, content, createdAt` | §4.6.2 AC1 | — |
| S4 | List versions — single entry | Authenticated owner; note was just created | `GET /api/notes/:id/versions` | HTTP 200 `{ "data": [v1] }` — array with exactly one entry | §4.6.2 AC1 | — |
| S5 | List versions — soft-deleted note | Authenticated owner; note has `deletedAt` set | `GET /api/notes/:id/versions` | HTTP 200 with full version history | A5, §4.6.2 AC1 | — |
| S6 | List versions — note not found | Authenticated user; note does not exist or belongs to another user | `GET /api/notes/:id/versions` | HTTP 404 `{ "error": { "code": "NOTE_NOT_FOUND" } }` | §4.6.2 AC2 | `NOTE_NOT_FOUND` |
| S7 | List versions — unauthenticated | No `Authorization` header | `GET /api/notes/:id/versions` | HTTP 401 `{ "error": { "code": "UNAUTHORIZED" } }` | §5.2 NFR security | `UNAUTHORIZED` |
| S8 | View single version — happy path | Authenticated owner; version exists on note | `GET /api/notes/:id/versions/:versionId` | HTTP 200 `{ "data": { id, noteId, version, title, content, createdAt } }` | §4.6.2 AC1 | — |
| S9 | View single version — version not found | Authenticated owner; `versionId` does not exist on this note | `GET /api/notes/:id/versions/:versionId` | HTTP 404 `{ "error": { "code": "VERSION_NOT_FOUND" } }` | §4.6.2 | `VERSION_NOT_FOUND` |
| S10 | View single version — cross-note access | Authenticated user owns note A and note B; `versionId` belongs to note B | `GET /api/notes/noteA-id/versions/noteB-version-id` | HTTP 404 `{ "error": { "code": "VERSION_NOT_FOUND" } }` | §4.6.2 | `VERSION_NOT_FOUND` |
| S11 | View single version — note not found | Note does not exist or belongs to another user | `GET /api/notes/:id/versions/:versionId` | HTTP 404 `{ "error": { "code": "NOTE_NOT_FOUND" } }` | §4.6.2 AC2 | `NOTE_NOT_FOUND` |
| S12 | View single version — unauthenticated | No `Authorization` header | `GET /api/notes/:id/versions/:versionId` | HTTP 401 `{ "error": { "code": "UNAUTHORIZED" } }` | — | `UNAUTHORIZED` |
| S13 | Restore version — happy path | Authenticated owner; note exists and is active; `versionId` is a valid snapshot | `POST /api/notes/:id/versions/:versionId/restore` | HTTP 200 `{ "data": note }` with note's `title` and `content` updated to match snapshot; `updatedAt` refreshed; new `NoteVersion` created with `version = MAX + 1` | §4.6.3 AC1, AC2 | — |
| S14 | Restore version — history immutability | After S13, all prior versions exist | `GET /api/notes/:id/versions` | All prior version records remain unchanged; only a new highest-numbered version was appended | §4.6.3 AC3 | — |
| S15 | Restore version — un-deletes soft-deleted note | Authenticated owner; note is soft-deleted; valid `versionId` | `POST /api/notes/:id/versions/:versionId/restore` | HTTP 200 `{ "data": note }` with `deletedAt: null`; note is active again; new version created | A5 | — |
| S16 | Restore version — note not found | Note does not exist or belongs to another user | `POST /api/notes/:id/versions/:versionId/restore` | HTTP 404 `{ "error": { "code": "NOTE_NOT_FOUND" } }` | §4.6.3 | `NOTE_NOT_FOUND` |
| S17 | Restore version — version not found | `versionId` does not exist on this note | `POST /api/notes/:id/versions/:versionId/restore` | HTTP 404 `{ "error": { "code": "VERSION_NOT_FOUND" } }` | §4.6.3 | `VERSION_NOT_FOUND` |
| S18 | Restore version — unauthenticated | No `Authorization` header | `POST /api/notes/:id/versions/:versionId/restore` | HTTP 401 `{ "error": { "code": "UNAUTHORIZED" } }` | — | `UNAUTHORIZED` |
| S19 | Auto-purge — removes excess old versions | Note has 55 versions; the 5 oldest are also older than `VERSION_RETENTION_DAYS` | Purge cron fires | Those 5 versions (rank > 50 AND older than retention window) are deleted; the remaining 50 are retained | §4.6.4 AC1, A3, A10 | — |
| S20 | Auto-purge — preserves latest version always | Note has 1 version; it is older than `VERSION_RETENTION_DAYS` | Purge cron fires | That single (latest) version is NOT deleted | §4.6.4 AC2, A10 | — |
| S21 | Auto-purge — recent versions retained despite count | Note has 60 versions; all created within the retention window | Purge cron fires | No versions are deleted — the age condition is not met, so the AND fails | A3, A4 | — |
| S22 | Auto-purge — old versions below count retained | Note has 10 versions; 3 are older than retention window | Purge cron fires | No versions are deleted — rank ≤ 50 for all, so the count condition is not met | A3 | — |

---

## API Contract

### GET /api/notes/:id/versions

**Auth required:** Yes
**Request body:** None
**Success response:** HTTP 200

```json
{
  "data": [
    {
      "id": "c3d4e5f6-...",
      "noteId": "a1b2c3d4-...",
      "version": 3,
      "title": "My Note",
      "content": "Full snapshot content here",
      "createdAt": "2026-06-15T10:00:00.000Z"
    },
    {
      "id": "b2c3d4e5-...",
      "noteId": "a1b2c3d4-...",
      "version": 2,
      "title": "My Note",
      "content": "Earlier content",
      "createdAt": "2026-06-14T09:00:00.000Z"
    }
  ]
}
```

Results sorted by `version DESC` (newest first). Includes soft-deleted notes (see A5).

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid `Authorization` header |
| 404 | `NOTE_NOT_FOUND` | Note does not exist or belongs to another user |

---

### GET /api/notes/:id/versions/:versionId

**Auth required:** Yes
**Request body:** None
**Success response:** HTTP 200

```json
{
  "data": {
    "id": "b2c3d4e5-...",
    "noteId": "a1b2c3d4-...",
    "version": 2,
    "title": "My Note",
    "content": "Earlier content",
    "createdAt": "2026-06-14T09:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid `Authorization` header |
| 404 | `NOTE_NOT_FOUND` | Note does not exist or belongs to another user |
| 404 | `VERSION_NOT_FOUND` | Version does not exist or does not belong to this note |

---

### POST /api/notes/:id/versions/:versionId/restore

**Auth required:** Yes
**Request body:** None
**Success response:** HTTP 200

```json
{
  "data": {
    "id": "a1b2c3d4-...",
    "userId": "u1u2u3u4-...",
    "title": "Restored title",
    "content": "Restored content from the target snapshot",
    "deletedAt": null,
    "createdAt": "2026-06-10T08:00:00.000Z",
    "updatedAt": "2026-06-15T10:30:00.000Z",
    "tags": []
  }
}
```

Response shape matches the existing `INoteResponse` used by `PATCH /api/notes/:id`. `deletedAt` will be `null` if the note was soft-deleted before restore (un-deleted as a side-effect, A5).

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid `Authorization` header |
| 404 | `NOTE_NOT_FOUND` | Note does not exist or belongs to another user |
| 404 | `VERSION_NOT_FOUND` | Version does not exist or does not belong to this note |

---

### Modified: POST /api/notes (existing endpoint — no contract change)

Internal change only. After `NoteRepository.create` succeeds, `NoteService.createNote` calls `VersionService.snapshot(noteId, title, content)` to create version 1. Request/response contract is unchanged.

---

### Modified: PATCH /api/notes/:id (existing endpoint — no contract change)

Internal change only. After `NoteRepository.update` succeeds, `NoteService.updateNote` calls `VersionService.snapshot(noteId, title, content)` to create the next incremental version. Request/response contract is unchanged.

---

## Database Changes

### New model: `NoteVersion`

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

### Modified model: `Note`

Add the `versions` back-reference relation:

```prisma
model Note {
  // ...existing fields unchanged...
  versions    NoteVersion[]
}
```

### Migration notes

- **Additive only** — new table, no existing columns altered or dropped.
- `@@unique([noteId, version])` prevents duplicate version numbers per note.
- `onDelete: Cascade` ensures all version records are cleaned up when a note is hard-deleted via Prisma.
- Existing notes will have no version rows after migration; version 1 is created on the next create or update.

---

## Shared Package Changes

### `src/errors.ts`

Add one new error code:

```typescript
VERSION_NOT_FOUND: "VERSION_NOT_FOUND",  // HTTP 404
```

### `src/types/index.ts`

Add and export a new interface:

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

### `src/schemas/` — no new schemas required

All version endpoints take only URL path parameters; no request body schemas are needed.

---

## Architecture Notes

**VersionService side-effect pattern (A2):** `NoteService` calls `VersionService.snapshot(noteId, title, content)` after each successful note write. `VersionService` queries `VersionRepository.getMaxVersion(noteId)` to determine the next version number, then calls `VersionRepository.create(...)`. If `VersionService.snapshot` throws, the error is swallowed with a logged warning — the note save has already committed and must not be rolled back. If stronger atomicity is required in a future ticket, both operations should be wrapped in a Prisma `$transaction`.

**Soft-deleted note access (A13):** `NoteRepository.findByIdAndUserId` (line 86) uses `where: { id, userId, deletedAt: null }` and would return `null` for soft-deleted notes, causing version endpoints to incorrectly return `NOTE_NOT_FOUND`. A new `NoteRepository.findByIdAndUserIdIncludeDeleted(id, userId)` method must be added, omitting the `deletedAt: null` filter. All three version endpoints use this new method.

**Background purge safety (A10):** The purge query must always exclude the row with the highest `version` number per note. Implementation approach: for each note, identify the max `version` value first, then delete where `version < maxVersion AND rank_from_newest > VERSION_MAX_PER_NOTE AND createdAt < cutoffDate`. Because the `@@unique([noteId, version])` constraint guarantees only one row per version per note, the max-version row is unambiguous.

**Scheduler isolation:** `scheduler.ts` is registered at server startup (in `app.ts` or `index.ts`) and runs outside the Express request pipeline. It calls `VersionRepository.purgeOldVersions` directly — no service layer involvement — consistent with SDS §8.1's housekeeping worker pattern.
