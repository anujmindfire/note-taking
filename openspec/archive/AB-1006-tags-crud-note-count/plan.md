# Plan — AB-1006: Tags — CRUD + Note Count per Tag

**Based on spec:** openspec/changes/AB-1006-tags-crud-note-count/spec.md
**Spec status:** Approved

---

## Phase 1 — Shared Package

**Files to modify:**

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `packages/shared/src/types/index.ts` | Add `color` and `noteCount` to `ITagResponse` |
| MODIFY | `packages/shared/src/schemas/index.ts` | Update `createTagSchema`; add `updateTagSchema`, `listTagsQuerySchema`, type aliases |

### Updated `ITagResponse`

```typescript
// packages/shared/src/types/index.ts
export interface ITagResponse {
  id: string;
  userId: string;
  name: string;
  color: string | null;   // NEW
  noteCount: number;       // NEW
  createdAt: string;
}
```

> **Impact:** `INoteResponse.tags` is typed as `ITagResponse[]`. Adding these fields requires `NoteRepository` to compute `noteCount` per tag in all note queries (handled in Phase 3).

### Updated and new Zod schemas

```typescript
// packages/shared/src/schemas/index.ts

// REPLACE existing createTagSchema (was name-only):
export const createTagSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color")
    .nullable()
    .optional(),
});

// ADD — for PATCH /api/tags/:id:
export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color")
    .nullable()
    .optional(),
});

// ADD — for GET /api/tags query params:
export const listTagsQuerySchema = z.object({
  sortBy: z.enum(["name", "noteCount"]).default("name"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

// ADD type aliases:
export type TCreateTagInput = z.infer<typeof createTagSchema>;
export type TUpdateTagInput = z.infer<typeof updateTagSchema>;
export type TListTagsQuery  = z.infer<typeof listTagsQuerySchema>;
```

No new error codes — all required codes already exist in `packages/shared/src/errors.ts`.

---

## Phase 2 — Database

**Migration name:** `add_tag_color`

**Change — additive only:**

```prisma
model Tag {
  id             String   @id @default(uuid())
  userId         String
  name           String
  normalizedName String
  color          String?   // ADD — nullable hex color string
  createdAt      DateTime  @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  noteTags NoteTag[]

  @@unique([userId, normalizedName])
}
```

Migration is: **ADDITIVE** — one nullable column added, no drops, no renames.

---

## Phase 3 — Repository Layer

**Files to create/modify:**

| Action | File | Methods |
|--------|------|---------|
| CREATE | `apps/backend/src/repositories/TagRepository.ts` | `findAllByUserId`, `findByIdAndUserId`, `create`, `update`, `delete`, `attachTagToNote`, `detachTagFromNote` |
| MODIFY | `apps/backend/src/repositories/NoteRepository.ts` | Update `noteInclude` + `mapRecord` to include tag `noteCount` and `color` |

---

### TagRepository.ts — internal domain type (file-local, not exported from shared)

```typescript
interface ITagRecord {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  color: string | null;
  noteCount: number;
  createdAt: Date;
}
```

### TagRepository.ts — `noteCountInclude` constant

```typescript
const noteCountSelect = {
  _count: {
    select: {
      noteTags: { where: { note: { deletedAt: null } } },
    },
  },
} as const;
```

### TagRepository.ts — `mapRecord` helper (file-local)

```typescript
function mapRecord(tag: {
  id: string; userId: string; name: string; normalizedName: string;
  color: string | null; createdAt: Date;
  _count: { noteTags: number };
}): ITagRecord {
  return {
    id: tag.id,
    userId: tag.userId,
    name: tag.name,
    normalizedName: tag.normalizedName,
    color: tag.color,
    noteCount: tag._count.noteTags,
    createdAt: tag.createdAt,
  };
}
```

### TagRepository.ts — method signatures and queries

```typescript
// Returns all user's tags with noteCount; sorting done in service layer.
findAllByUserId(userId: string): Promise<ITagRecord[]>
// Prisma: tag.findMany({ where: { userId }, include: noteCountSelect })
// Returns: rows.map(mapRecord)

// Returns null if not found or wrong owner.
findByIdAndUserId(id: string, userId: string): Promise<ITagRecord | null>
// Prisma: tag.findFirst({ where: { id, userId }, include: noteCountSelect })
// Returns: row ? mapRecord(row) : null

// Checks uniqueness via normalizedName — service calls this before create.
findByNormalizedName(userId: string, normalizedName: string): Promise<ITagRecord | null>
// Prisma: tag.findFirst({ where: { userId, normalizedName }, include: noteCountSelect })

// Creates new tag; noteCount will always be 0 for new tag.
create(data: { userId: string; name: string; normalizedName: string; color?: string | null }): Promise<ITagRecord>
// Prisma: tag.create({ data, include: noteCountSelect })

// Updates name/normalizedName and/or color.
update(id: string, data: { name?: string; normalizedName?: string; color?: string | null }): Promise<ITagRecord>
// Prisma: tag.update({ where: { id }, data, include: noteCountSelect })

// Deletes tag; NoteTag rows cascade via schema onDelete: Cascade.
delete(id: string): Promise<void>
// Prisma: tag.delete({ where: { id } })

// Idempotent attach — upsert creates NoteTag if absent, no-op if present.
attachTagToNote(noteId: string, tagId: string): Promise<void>
// Prisma: noteTag.upsert({ where: { noteId_tagId: { noteId, tagId } }, create: { noteId, tagId }, update: {} })

// Idempotent detach — deleteMany with no matching rows returns count:0, no error.
detachTagFromNote(noteId: string, tagId: string): Promise<void>
// Prisma: noteTag.deleteMany({ where: { noteId, tagId } })
```

---

### NoteRepository.ts — changes

Update `noteInclude` to include tag `color` and `_count.noteTags`:

```typescript
const noteInclude = {
  noteTags: {
    include: {
      tag: {
        include: {
          _count: {
            select: {
              noteTags: { where: { note: { deletedAt: null } } },
            },
          },
        },
      },
    },
  },
} as const;
```

Update `mapRecord` tag mapping:

```typescript
tags: note.noteTags.map((nt) => ({
  id: nt.tag.id,
  userId: nt.tag.userId,
  name: nt.tag.name,
  color: nt.tag.color,             // ADD
  noteCount: nt.tag._count.noteTags, // ADD
  createdAt: nt.tag.createdAt,
})),
```

> These are the **only** changes to `NoteRepository.ts`. All existing method signatures remain unchanged.

---

## Phase 4 — Service Layer

**Files to create/modify:**

| Action | File | Methods |
|--------|------|---------|
| CREATE | `apps/backend/src/services/TagService.ts` | `listTags`, `createTag`, `updateTag`, `deleteTag`, `attachTag`, `detachTag` |

No Prisma imports. No `req`/`res` objects. Imports from `@noteapp/shared` and repository only.

### File-local `mapToResponse` helper

```typescript
function mapToResponse(tag: ITagRecord): ITagResponse {
  return {
    id: tag.id,
    userId: tag.userId,
    name: tag.name,
    color: tag.color,
    noteCount: tag.noteCount,
    createdAt: tag.createdAt.toISOString(),
  };
}
```

### Method signatures and business rules

```typescript
// Business rules: sort tags in application code by sortBy/sortDir.
listTags(userId: string, query: TListTagsQuery): Promise<ITagResponse[]>
// 1. TagRepository.findAllByUserId(userId)
// 2. Sort records by query.sortBy ('name' | 'noteCount') and query.sortDir ('asc' | 'desc')
// 3. Return records.map(mapToResponse)

// Business rules: normalize name; check duplicate before create.
createTag(userId: string, data: TCreateTagInput): Promise<ITagResponse>
// 1. normalizedName = data.name.trim().toLowerCase()
// 2. TagRepository.findByNormalizedName(userId, normalizedName) → if found, throw TAG_NAME_TAKEN (422)
// 3. TagRepository.create({ userId, name: data.name.trim(), normalizedName, color: data.color ?? null })
// 4. Return mapToResponse(record)

// Business rules: ownership check; duplicate name check excludes self.
updateTag(id: string, userId: string, data: TUpdateTagInput): Promise<ITagResponse>
// 1. TagRepository.findByIdAndUserId(id, userId) → if null, throw TAG_NOT_FOUND (404)
// 2. If data.name provided:
//      normalizedName = data.name.trim().toLowerCase()
//      if normalizedName !== existing.normalizedName:
//        TagRepository.findByNormalizedName(userId, normalizedName) → if found, throw TAG_NAME_TAKEN (422)
// 3. Build update payload: { name?, normalizedName?, color? } — only include defined fields
// 4. TagRepository.update(id, payload)
// 5. Return mapToResponse(record)

// Business rules: ownership check; cascade handled by DB.
deleteTag(id: string, userId: string): Promise<void>
// 1. TagRepository.findByIdAndUserId(id, userId) → if null, throw TAG_NOT_FOUND (404)
// 2. TagRepository.delete(id)

// Business rules: note ownership first, then tag ownership; idempotent attach.
attachTag(noteId: string, tagId: string, userId: string): Promise<INoteResponse>
// 1. NoteRepository.findByIdAndUserId(noteId, userId) → if null, throw NOTE_NOT_FOUND (404)
// 2. TagRepository.findByIdAndUserId(tagId, userId) → if null, throw TAG_NOT_FOUND (404)
// 3. TagRepository.attachTagToNote(noteId, tagId)
// 4. NoteRepository.findByIdAndUserId(noteId, userId) → map to INoteResponse and return

// Business rules: note ownership first, then tag ownership; idempotent detach.
detachTag(noteId: string, tagId: string, userId: string): Promise<INoteResponse>
// 1. NoteRepository.findByIdAndUserId(noteId, userId) → if null, throw NOTE_NOT_FOUND (404)
// 2. TagRepository.findByIdAndUserId(tagId, userId) → if null, throw TAG_NOT_FOUND (404)
// 3. TagRepository.detachTagFromNote(noteId, tagId)
// 4. NoteRepository.findByIdAndUserId(noteId, userId) → map to INoteResponse and return
```

> `attachTag`/`detachTag` re-fetch the note after the mutation to return the freshest tag list with updated `noteCount` values.

---

## Phase 5 — Route Layer

**Files to create/modify:**

| Action | File | Change |
|--------|------|--------|
| CREATE | `apps/backend/src/routes/tagRoutes.ts` | 4 tag CRUD routes |
| MODIFY | `apps/backend/src/routes/noteRoutes.ts` | Add 2 note-tag association routes |
| MODIFY | `apps/backend/src/app.ts` | Mount tagRoutes at `/api/tags` |

### tagRoutes.ts — route definitions

```typescript
// GET /api/tags
router.get("/", requireAuth, validateQuery(listTagsQuerySchema), async (req, res, next) => {
  // userId from JWT; query from res.locals["parsedQuery"] as TListTagsQuery
  // TagService.listTags(userId, query) → res.json({ data: tags })
});

// POST /api/tags
router.post("/", requireAuth, validate(createTagSchema), async (req, res, next) => {
  // TagService.createTag(userId, req.body as TCreateTagInput) → res.status(201).json({ data: tag })
});

// PATCH /api/tags/:id
router.patch("/:id", requireAuth, validate(updateTagSchema), async (req, res, next) => {
  // TagService.updateTag(req.params.id, userId, req.body as TUpdateTagInput) → res.json({ data: tag })
});

// DELETE /api/tags/:id
router.delete("/:id", requireAuth, async (req, res, next) => {
  // TagService.deleteTag(req.params.id, userId) → res.status(204).send()
});
```

### noteRoutes.ts — add 2 routes (after existing DELETE /:id route)

```typescript
// POST /api/notes/:id/tags/:tagId
router.post("/:id/tags/:tagId", requireAuth, async (req, res, next) => {
  // TagService.attachTag(req.params.id, req.params.tagId, userId) → res.json({ data: note })
});

// DELETE /api/notes/:id/tags/:tagId
router.delete("/:id/tags/:tagId", requireAuth, async (req, res, next) => {
  // TagService.detachTag(req.params.id, req.params.tagId, userId) → res.json({ data: note })
});
```

### app.ts — add one line

```typescript
import { tagRoutes } from "./routes/tagRoutes.js";
app.use("/api/tags", tagRoutes);
```

---

## Phase 6 — Tests

Test-writer agent handles this phase. Every scenario from spec.md must have at least one test.

**Files to create:**

| File | Type | Scenarios |
|------|------|-----------|
| `apps/backend/src/__tests__/unit/services/TagService.test.ts` | Unit | Service-level: duplicate check, ownership, noteCount math, sort logic, error throws |
| `apps/backend/src/__tests__/integration/routes/tags.test.ts` | Integration | T1–T32 (list, create, update, delete tag endpoints) |
| `apps/backend/src/__tests__/integration/routes/notes.tags.test.ts` | Integration | T33–T47 (attach, detach endpoints on /api/notes/:id/tags/:tagId) |

**Unit test scope** (`TagService.test.ts`):

- `listTags` — calls findAllByUserId, sorts by name asc (default), sorts by noteCount desc when specified
- `createTag` — normalizes name, throws TAG_NAME_TAKEN on duplicate, creates with null color when omitted
- `updateTag` — throws TAG_NOT_FOUND, throws TAG_NAME_TAKEN on rename collision, skips uniqueness check when normalizedName unchanged (self-rename)
- `deleteTag` — throws TAG_NOT_FOUND when not owned
- `attachTag` — checks note first (NOTE_NOT_FOUND), then tag (TAG_NOT_FOUND), calls attachTagToNote
- `detachTag` — checks note first (NOTE_NOT_FOUND), then tag (TAG_NOT_FOUND), calls detachTagFromNote

---

## Checkpoints

After each phase run:

```bash
pnpm build          # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test           # all green (including existing N, P, auth suites)
```

Stop on any failure. Fix before continuing.

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|----------------|-----------|
| R1 | Prisma does not support `orderBy` on aggregated `_count` in `findMany` | Fetch all tags with counts and sort in service layer (acceptable for typical tag list sizes) |
| R2 | Adding `noteCount`/`color` to `ITagResponse` is a breaking change to every note response that embeds tags | NoteRepository updated in Phase 3; existing integration tests will need to accept the new fields (they use `.toMatchObject` which ignores extra fields, so existing tests pass without changes) |
| R3 | Self-rename (tag renamed to its own normalizedName) must not throw TAG_NAME_TAKEN | Service compares new normalizedName to existing.normalizedName before querying; skips uniqueness check when equal |
| R4 | `detachTagFromNote` uses `deleteMany` — if tag is not attached, Prisma returns `count:0` (no error) | This is intentional idempotency; no special handling required |
| R5 | `attachTag`/`detachTag` re-fetch the note after mutation to return fresh noteCount values | Two repository calls per attach/detach; acceptable trade-off for correctness |
| R6 | `noteCount` in tags embedded in notes counts active notes globally (not just notes owned by the requesting user) | All notes with a tag belong to the tag owner; by definition the tag owner sees all their own notes |
