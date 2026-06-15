# Plan — AB-1008: Sharing — Generate Link, Revoke, Public Access, Atomic View Count

**Based on spec:** openspec/changes/AB-1008  Sharing — generate link, revoke, public access, atomic view count/spec.md
**Spec status:** Approved

---

## Phase 1 — Shared Package

Files to modify in `packages/shared/`:

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `src/types/index.ts` | Add `ISharedLinkResponse` interface |
| MODIFY | `src/schemas/index.ts` | Add `createShareLinkSchema`, `TCreateShareLinkInput` |
| MODIFY | `src/errors.ts` | Add `SHARE_NOT_FOUND`, `SHARE_REVOKED`, `SHARE_EXPIRED` |

**TypeScript interfaces (exact shape):**

```typescript
// Add to src/types/index.ts
export interface ISharedLinkResponse {
  id: string;
  noteId: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}
```

**Zod schema (exact shape):**

```typescript
// Add to src/schemas/index.ts
export const createShareLinkSchema = z.object({
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be a valid ISO 8601 datetime' })
    .refine((v) => new Date(v) > new Date(), {
      message: 'expiresAt must be in the future',
    })
    .refine((v) => new Date(v) <= new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), {
      message: 'expiresAt must not exceed 1 year from now',
    })
    .optional(),
});

export type TCreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
```

**Error codes (exact additions to `src/errors.ts`):**

```typescript
SHARE_NOT_FOUND: "SHARE_NOT_FOUND",  // 404
SHARE_REVOKED:   "SHARE_REVOKED",    // 403
SHARE_EXPIRED:   "SHARE_EXPIRED",    // 410
```

---

## Phase 2 — Database

**Migration name:** `add_shared_link`

**Prisma schema changes:**

Add new model to `apps/backend/prisma/schema.prisma`:

```prisma
model SharedLink {
  id        String    @id @default(uuid())
  noteId    String
  token     String    @unique
  expiresAt DateTime?
  revokedAt DateTime?
  viewCount Int       @default(0)
  createdAt DateTime  @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([noteId])
}
```

Add back-reference to existing `Note` model (Prisma-only; no SQL column added):

```prisma
model Note {
  // ...existing fields unchanged...
  sharedLinks SharedLink[]
}
```

**Migration SQL (additive):**

```sql
-- CreateTable
CREATE TABLE "SharedLink" (
    "id"        TEXT NOT NULL,
    "noteId"    TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedLink_token_key" ON "SharedLink"("token");
CREATE INDEX "SharedLink_token_idx" ON "SharedLink"("token");
CREATE INDEX "SharedLink_noteId_idx" ON "SharedLink"("noteId");

-- AddForeignKey
ALTER TABLE "SharedLink" ADD CONSTRAINT "SharedLink_noteId_fkey"
  FOREIGN KEY ("noteId") REFERENCES "Note"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Migration is **ADDITIVE** — creates a new table and indexes only. No changes to existing columns, tables, or data.

---

## Phase 3 — Repository Layer

Files to create in `apps/backend/src/repositories/`:

| Action | File | Methods |
|--------|------|---------|
| CREATE | `ShareLinkRepository.ts` | `create`, `findAllByNoteId`, `findByIdForOwner`, `findByToken`, `revoke`, `incrementViewCount` |

**Internal types (not exported to shared):**

```typescript
interface IShareLinkRecord {
  id: string;
  noteId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
}

// Extended type returned only by findByToken — includes full note with tags
interface IShareLinkWithNote extends IShareLinkRecord {
  note: {
    id: string;
    userId: string;
    title: string;
    content: string;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    tags: Array<{
      id: string;
      userId: string;
      name: string;
      color: string | null;
      noteCount: number;
      createdAt: Date;
    }>;
  };
}
```

**`noteInclude` const** — duplicate of `NoteRepository.ts`'s `noteInclude` (same pattern used in `SearchRepository.ts`; cross-repository import avoided):

```typescript
const noteInclude = {
  noteTags: {
    include: {
      tag: {
        include: {
          _count: {
            select: { noteTags: { where: { note: { deletedAt: null } } } },
          },
        },
      },
    },
  },
} as const;
```

**Method signatures and Prisma queries:**

```typescript
// 1. create
create(data: { noteId: string; token: string; expiresAt: Date | null }): Promise<IShareLinkRecord>
// prisma.sharedLink.create({ data: { noteId, token, expiresAt, viewCount: 0 } })
// returns: mapRecord(result)

// 2. findAllByNoteId
findAllByNoteId(noteId: string): Promise<IShareLinkRecord[]>
// prisma.sharedLink.findMany({ where: { noteId }, orderBy: { createdAt: 'desc' } })
// returns: results.map(mapRecord)

// 3. findByIdForOwner — joins through note to verify ownership
findByIdForOwner(id: string, userId: string): Promise<IShareLinkRecord | null>
// prisma.sharedLink.findFirst({ where: { id, note: { userId } } })
// returns: result ? mapRecord(result) : null
// NOTE: does NOT filter by note.deletedAt — allows revocation of links on soft-deleted notes

// 4. findByToken — includes full note + tags for public access validation
findByToken(token: string): Promise<IShareLinkWithNote | null>
// prisma.sharedLink.findFirst({
//   where: { token },
//   include: { note: { include: noteInclude } }
// })
// returns: result ? mapWithNote(result) : null

// 5. revoke — sets revokedAt; always overwrites (idempotency handled in service)
revoke(id: string): Promise<IShareLinkRecord>
// prisma.sharedLink.update({ where: { id }, data: { revokedAt: new Date() } })
// returns: mapRecord(result)

// 6. incrementViewCount — atomic increment (NFR §5.3)
incrementViewCount(id: string): Promise<void>
// prisma.sharedLink.update({ where: { id }, data: { viewCount: { increment: 1 } } })
// returns: void
```

**`mapRecord` helper:**

```typescript
function mapRecord(link: { id, noteId, token, expiresAt, revokedAt, viewCount, createdAt }): IShareLinkRecord
// Maps Prisma result to IShareLinkRecord (all fields, Date objects kept as-is)
```

**`mapWithNote` helper:**

```typescript
function mapWithNote(link: PrismaSharedLinkWithNote): IShareLinkWithNote
// Maps top-level fields via mapRecord, then maps note + noteTags using same
// shape as NoteRepository.mapRecord (Date objects kept as-is)
```

Export: `export type { IShareLinkRecord, IShareLinkWithNote }`

---

## Phase 4 — Service Layer

Files to create in `apps/backend/src/services/`:

| Action | File | Methods |
|--------|------|---------|
| CREATE | `ShareLinkService.ts` | `generateLink`, `listLinks`, `revokeLink`, `accessPublicLink` |

**Imports required:**
- `ErrorCode`, `ISharedLinkResponse`, `INoteResponse`, `TCreateShareLinkInput` from `@noteapp/shared`
- `ShareLinkRepository`, `IShareLinkRecord`, `IShareLinkWithNote` from `../repositories/ShareLinkRepository.js`
- `NoteRepository` from `../repositories/NoteRepository.js`
- `createError` from `../middleware/errorHandler.js`
- `crypto` from `node:crypto`

**`mapShareLinkToResponse` helper (file-private):**

```typescript
function mapShareLinkToResponse(link: IShareLinkRecord): ISharedLinkResponse {
  return {
    id: link.id,
    noteId: link.noteId,
    token: link.token,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
    viewCount: link.viewCount,
    createdAt: link.createdAt.toISOString(),
  };
}
```

**`mapNoteToResponse` helper (file-private, same shape as TagService's `mapNoteToResponse`):**

```typescript
function mapNoteToResponse(note: IShareLinkWithNote['note']): INoteResponse
// Maps Date fields to ISO strings, flattens noteTags to tags array
```

**Method specifications:**

```typescript
// 1. generateLink
generateLink(noteId: string, userId: string, data: TCreateShareLinkInput): Promise<ISharedLinkResponse>
// Business rules:
//   - NoteRepository.findByIdAndUserId(noteId, userId) → null → 404 NOTE_NOT_FOUND
//     (also covers soft-deleted notes — findByIdAndUserId filters deletedAt: null)
//   - token = crypto.randomBytes(32).toString('hex')
//   - ShareLinkRepository.create({ noteId, token, expiresAt: data.expiresAt ? new Date(data.expiresAt) : null })
//   - return mapShareLinkToResponse(link)

// 2. listLinks
listLinks(noteId: string, userId: string): Promise<ISharedLinkResponse[]>
// Business rules:
//   - NoteRepository.findByIdAndUserId(noteId, userId) → null → 404 NOTE_NOT_FOUND
//   - ShareLinkRepository.findAllByNoteId(noteId)
//   - return links.map(mapShareLinkToResponse)

// 3. revokeLink
revokeLink(shareId: string, userId: string): Promise<ISharedLinkResponse>
// Business rules:
//   - ShareLinkRepository.findByIdForOwner(shareId, userId) → null → 404 SHARE_NOT_FOUND
//   - if link.revokedAt !== null: return mapShareLinkToResponse(link)  ← idempotent
//   - const revoked = await ShareLinkRepository.revoke(shareId)
//   - return mapShareLinkToResponse(revoked)

// 4. accessPublicLink
accessPublicLink(token: string): Promise<INoteResponse>
// Business rules (error precedence order per spec S29):
//   1. ShareLinkRepository.findByToken(token) → null → 404 SHARE_NOT_FOUND
//   2. link.revokedAt !== null → 403 SHARE_REVOKED
//   3. (link.expiresAt && link.expiresAt < new Date()) || link.note.deletedAt !== null
//      → 410 SHARE_EXPIRED
//   4. await ShareLinkRepository.incrementViewCount(link.id)   ← atomic, only after all checks pass
//   5. return mapNoteToResponse(link.note)
```

No Prisma calls, no `req`/`res`, no Express types in this file.

---

## Phase 5 — Route Layer

Files to create/modify:

| Action | File | Routes added |
|--------|------|-------------|
| MODIFY | `apps/backend/src/routes/noteRoutes.ts` | `POST /:id/shares`, `GET /:id/shares` |
| CREATE | `apps/backend/src/routes/shareRoutes.ts` | `POST /:shareId/revoke` |
| CREATE | `apps/backend/src/routes/publicShareRoutes.ts` | `GET /:token` |
| MODIFY | `apps/backend/src/app.ts` | Mount `shareRoutes` at `/api/shares`, `publicShareRoutes` at `/api/share` |

**Additions to `noteRoutes.ts`** (append after existing note-tag routes, same pattern):

```typescript
// POST /api/notes/:id/shares — generate share link
router.post("/:id/shares", requireAuth, validate(createShareLinkSchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const link = await ShareLinkService.generateLink(
      req.params["id"] as string,
      userId,
      req.body as TCreateShareLinkInput
    );
    res.status(201).json({ data: link });
  } catch (err) {
    next(err);
  }
});

// GET /api/notes/:id/shares — list share links for note
router.get("/:id/shares", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const links = await ShareLinkService.listLinks(req.params["id"] as string, userId);
    res.json({ data: links });
  } catch (err) {
    next(err);
  }
});
```

**`shareRoutes.ts`** (new file):

```typescript
const router: ExpressRouter = Router();

// POST /api/shares/:shareId/revoke
router.post("/:shareId/revoke", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const link = await ShareLinkService.revokeLink(req.params["shareId"] as string, userId);
    res.json({ data: link });
  } catch (err) {
    next(err);
  }
});

export { router as shareRoutes };
```

**`publicShareRoutes.ts`** (new file — NO `requireAuth`):

```typescript
const router: ExpressRouter = Router();

// GET /api/share/:token — public, no auth
router.get("/:token", async (req, res, next) => {
  try {
    const note = await ShareLinkService.accessPublicLink(req.params["token"] as string);
    res.json({ data: note });
  } catch (err) {
    next(err);
  }
});

export { router as publicShareRoutes };
```

**`app.ts` additions** (before `app.use(notFound)`):

```typescript
import { shareRoutes } from './routes/shareRoutes.js';
import { publicShareRoutes } from './routes/publicShareRoutes.js';
// ...
app.use('/api/shares', shareRoutes);
app.use('/api/share', publicShareRoutes);
```

---

## Phase 6 — Tests

Delegate entirely to test-writer agent.

| File | Type | Scenarios covered |
|------|------|------------------|
| `apps/backend/src/__tests__/unit/services/ShareLinkService.test.ts` | Unit | S1, S2, S3, S6, S7, S8, S10, S11, S12, S16, S17, S19, S20, S22, S23, S24, S25, S26, S27, S29 |
| `apps/backend/src/__tests__/integration/routes/shareLinks.test.ts` | Integration | S1–S29 |

**Unit test scope note:** S4 and S5 are Zod validation errors handled by middleware before the service is called — tested in integration only. S13, S14, S15, S18, S19, S20, S21, S28 are auth/integration-level concerns tested in integration only.

---

## Checkpoints

After each phase:

```bash
pnpm build          # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test           # all green (from Phase 6 onward)
```

Stop on any failure. Fix before continuing.

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|----------------|-----------|
| R1 | `crypto.randomBytes` collision — two links generated at same millisecond get the same 64-char hex token | DB `@@unique` on `token` will throw a Prisma `P2002` unique constraint error; surface as 500 (collision probability ~1 in 2^256 — acceptable, no retry loop needed) |
| R2 | `createShareLinkSchema` uses `new Date()` / `Date.now()` inside Zod `.refine()` — evaluated at request time | Correct behavior for a server-side validator; not a worktree/script context |
| R3 | `noteInclude` const duplicated from `NoteRepository.ts` into `ShareLinkRepository.ts` | Acceptable trade-off; extraction to a shared utility is out of scope (same pattern used in AB-1007 SearchRepository) |
| R4 | `findByIdForOwner` does NOT filter by `note.deletedAt` — allows revoke on soft-deleted note links | Intentional per spec: revoking links on deleted notes is a valid owner action; public access handles deleted notes separately via 410 |
| R5 | `incrementViewCount` called after all validation passes — a failed DB update (e.g., link deleted concurrently) would cause 500 | Acceptable edge case; link deletion requires a hard-delete (only on hard-delete of `Note` via cascade), which cannot race with a valid public access |
| R6 | `POST /:id/shares` added to `noteRoutes.ts` alongside existing note-tag routes | Follows established pattern (`POST /:id/tags/:tagId` lives in `noteRoutes.ts`); keeps note-scoped resources in one file |
| R7 | `errorHandler.ts` `notFound` handler uses `NOTE_NOT_FOUND` code — existing behaviour, not changed here | No change needed; the 404 fallback for unknown routes is a pre-existing project convention |
