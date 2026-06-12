# Plan — AB-1005: Notes — Pagination, Sorting, Tag Filtering

**Based on:** FRS §4.2.2 AC1, §5.1.3 + user-confirmed decisions (no spec.md — plan derived directly)
**Spec status:** No spec.md produced — plan derived from FRS and clarifying answers
**Depends on:** AB-1004 (tags, NoteTag join table)

---

## Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Pagination style | Offset: `?page=1&limit=20` | User confirmed; SDS §4.3 endorses |
| Response envelope | `{ data: [...], meta: { total, page, limit, totalPages } }` | User confirmed "data with total count" |
| Tag filter param | `?tagId=uuid` repeated for multiple | Standard query-string multi-value |
| Tag filter logic | OR — note matches if it has ANY of the given tags | User confirmed "multiple tagId" |
| Unknown/cross-user tagId | 200 empty results — no error | Filtering, not lookup |
| Default sort | `sortBy=createdAt`, `sortDir=desc` | Newest-first is the natural default |
| Limit bounds | min 1, max 100, default 20 | User confirmed "limit" constraint |
| Page bounds | min 1, default 1 | Standard |

---

## Phase 1 — Shared Package

**Files to modify:**

| Action | File | What changes |
|---|---|---|
| MODIFY | `packages/shared/src/types/index.ts` | Add `INotesPageMeta` |
| MODIFY | `packages/shared/src/schemas/index.ts` | Add `listNotesQuerySchema`, `TListNotesQuery` |

**New interface:**

```typescript
// packages/shared/src/types/index.ts
export interface INotesPageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**New Zod schema:**

```typescript
// packages/shared/src/schemas/index.ts
export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  tagId: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
});

export type TListNotesQuery = z.infer<typeof listNotesQuerySchema>;
```

> `tagId` normalises single string or array of strings into `string[]`. Filters with non-UUID values fail at the `z.string().uuid()` check and produce `VALIDATION_ERROR`.

---

## Phase 2 — Database

**Migration name:** `add_note_sort_and_tag_filter_indexes`

**Changes — additive only (no dropping, no column changes):**

```prisma
model Note {
  // existing fields unchanged
  @@index([userId, createdAt])   // ADD — composite for sort by createdAt
  @@index([userId, updatedAt])   // ADD — composite for sort by updatedAt
}

model NoteTag {
  // existing fields unchanged
  @@index([tagId])               // ADD — for WHERE tagId IN (...) tag-filter subqueries
}
```

Migration is: **ADDITIVE** — only new indexes, no schema-breaking changes.

---

## Phase 3 — Repository Layer

**Files to modify:**

| Action | File | Methods to add |
|---|---|---|
| MODIFY | `apps/backend/src/repositories/NoteRepository.ts` | Add `findPaginated` |

Existing `findAllByUserId` is kept unchanged (no callers removed in this ticket).

**New method signature:**

```typescript
findPaginated(
  userId: string,
  params: {
    page: number;
    limit: number;
    sortBy: 'createdAt' | 'updatedAt';
    sortDir: 'asc' | 'desc';
    tagIds: string[];
  }
): Promise<{ notes: INoteRecord[]; total: number }>
```

**Prisma query (single transaction, no N+1):**

```typescript
const where = {
  userId,
  deletedAt: null,
  ...(params.tagIds.length > 0
    ? { noteTags: { some: { tagId: { in: params.tagIds } } } }
    : {}),
};

const [rows, total] = await prisma.$transaction([
  prisma.note.findMany({
    where,
    include: noteInclude,
    orderBy: { [params.sortBy]: params.sortDir },
    skip: (params.page - 1) * params.limit,
    take: params.limit,
  }),
  prisma.note.count({ where }),
]);

return { notes: rows.map(mapRecord), total };
```

- Returns domain type `INoteRecord[]` via existing `mapRecord` — no raw Prisma objects.
- `total` is the count of ALL matching notes (not just this page) — used to compute `totalPages`.
- Tag filter uses `noteTags.some` subquery; unknown tagIds produce no matches naturally.
- Soft-deleted notes excluded via `deletedAt: null` — same as existing queries.

---

## Phase 4 — Service Layer

**Files to modify:**

| Action | File | Methods to change |
|---|---|---|
| MODIFY | `apps/backend/src/services/NoteService.ts` | Replace `listNotes` signature |

**Updated method signature:**

```typescript
// Before: listNotes(userId: string): Promise<INoteResponse[]>
// After:
listNotes(
  userId: string,
  params: TListNotesQuery
): Promise<{
  notes: INoteResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}>
```

**Implementation:**

```typescript
async listNotes(userId: string, params: TListNotesQuery) {
  const { notes, total } = await NoteRepository.findPaginated(userId, {
    page: params.page,
    limit: params.limit,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
    tagIds: params.tagId,   // already string[] after Zod transform
  });
  return {
    notes: notes.map(mapToResponse),
    total,
    page: params.page,
    limit: params.limit,
    totalPages: Math.ceil(total / params.limit),
  };
}
```

Business rules:
- No additional ownership check on `tagId` values — filtering by another user's tagId returns empty results naturally (user's notes don't have that tagId in NoteTag).
- Soft-deleted notes excluded by repository — service does not re-check.
- `totalPages` is 0 when `total` is 0 (Math.ceil(0/limit) === 0).
- No Prisma imports. No `req`/`res` objects.

---

## Phase 5 — Route Layer

**Files to modify:**

| Action | File | Change |
|---|---|---|
| MODIFY | `apps/backend/src/middleware/validate.ts` | Add `validateQuery` helper |
| MODIFY | `apps/backend/src/routes/noteRoutes.ts` | Update `GET /` handler |

### validate.ts — add `validateQuery`

```typescript
export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));
      return next(
        createError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", fields)
      );
    }
    res.locals["parsedQuery"] = result.data;
    next();
  };
}
```

Stores parsed result in `res.locals["parsedQuery"]` to avoid mutating the `ParsedQs`-typed `req.query` with coerced number/array values. No `any` types introduced.

### noteRoutes.ts — update `GET /`

```typescript
// Before:
router.get("/", requireAuth, async (req, res, next) => {
  ...
  const notes = await NoteService.listNotes(userId);
  res.json({ data: notes });
  ...
});

// After:
router.get(
  "/",
  requireAuth,
  validateQuery(listNotesQuerySchema),
  async (req, res, next) => {
    try {
      const { userId } = (req as AuthenticatedRequest).user;
      const query = res.locals["parsedQuery"] as TListNotesQuery;
      const result = await NoteService.listNotes(userId, query);
      res.json({
        data: result.notes,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
```

No other routes change. `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id` are unchanged.

**Imports to add in noteRoutes.ts:**
```typescript
import { listNotesQuerySchema } from "@noteapp/shared";
import type { TListNotesQuery, INotesPageMeta } from "@noteapp/shared";
import { validateQuery } from "../middleware/validate.js";
```

**Imports to add in shared types index:**
Export `INotesPageMeta` from `packages/shared/src/types/index.ts`.

---

## Phase 6 — Tests

**Files to create:**

| File | Type | Scenarios |
|---|---|---|
| `apps/backend/src/__tests__/unit/services/NoteService.pagination.test.ts` | Unit | P1–P8 (service-level) |
| `apps/backend/src/__tests__/integration/routes/notes.pagination.test.ts` | Integration | P1–P21 |

**Existing tests** (`notes.test.ts`) continue to pass — they access `res.body.data` which is still present. The `meta` field is additive.

### Scenario table

| ID | Endpoint | Scenario | Given | When | Then | Error Code |
|:---|:---------|:---------|:------|:-----|:-----|:-----------|
| P1 | GET /api/notes | Default params | User has 3 notes, no query string | GET /api/notes | 200 `data`=3 notes, `meta.page=1`, `meta.limit=20`, `meta.total=3`, `meta.totalPages=1` | — |
| P2 | GET /api/notes | Second page | User has 3 notes, `?page=2&limit=2` | GET /api/notes?page=2&limit=2 | 200 `data`=1 note, `meta.page=2`, `meta.total=3`, `meta.totalPages=2` | — |
| P3 | GET /api/notes | Beyond last page | User has 2 notes, `?page=99&limit=20` | GET /api/notes?page=99 | 200 `data`=[], `meta.total=2`, `meta.page=99` | — |
| P4 | GET /api/notes | page=0 | Any user | GET /api/notes?page=0 | 400 VALIDATION_ERROR, fields contains "page" | VALIDATION_ERROR |
| P5 | GET /api/notes | page=-1 | Any user | GET /api/notes?page=-1 | 400 VALIDATION_ERROR | VALIDATION_ERROR |
| P6 | GET /api/notes | limit=0 | Any user | GET /api/notes?limit=0 | 400 VALIDATION_ERROR, fields contains "limit" | VALIDATION_ERROR |
| P7 | GET /api/notes | limit=101 (exceeds max) | Any user | GET /api/notes?limit=101 | 400 VALIDATION_ERROR | VALIDATION_ERROR |
| P8 | GET /api/notes | Missing auth | No token | GET /api/notes | 401 UNAUTHORIZED | UNAUTHORIZED |
| P9 | GET /api/notes | Sort createdAt desc | User has 2 notes created at T1 < T2 | GET /api/notes?sortBy=createdAt&sortDir=desc | 200, data[0] is the T2 note (newest first) | — |
| P10 | GET /api/notes | Sort createdAt asc | Same 2 notes | GET /api/notes?sortBy=createdAt&sortDir=asc | 200, data[0] is the T1 note (oldest first) | — |
| P11 | GET /api/notes | Sort updatedAt desc | Note A updated after Note B | GET /api/notes?sortBy=updatedAt&sortDir=desc | 200, Note A first | — |
| P12 | GET /api/notes | Invalid sortBy | Any user | GET /api/notes?sortBy=title | 400 VALIDATION_ERROR | VALIDATION_ERROR |
| P13 | GET /api/notes | Invalid sortDir | Any user | GET /api/notes?sortDir=random | 400 VALIDATION_ERROR | VALIDATION_ERROR |
| P14 | GET /api/notes | Filter by single tag | User has 2 notes, only note A has tagX | GET /api/notes?tagId={tagX.id} | 200, data=[note A only] | — |
| P15 | GET /api/notes | Filter by multiple tags (OR) | Note A has tag1, Note B has tag2, Note C has neither | GET /api/notes?tagId={tag1}&tagId={tag2} | 200, data=[note A, note B] | — |
| P16 | GET /api/notes | Non-existent tagId | Valid UUID that doesn't exist | GET /api/notes?tagId={random-uuid} | 200, data=[], meta.total=0 | — |
| P17 | GET /api/notes | Cross-user tagId | tagId belongs to other user | GET /api/notes?tagId={other-users-tag} | 200, data=[] | — |
| P18 | GET /api/notes | Invalid tagId (not UUID) | tagId="notauuid" | GET /api/notes?tagId=notauuid | 400 VALIDATION_ERROR | VALIDATION_ERROR |
| P19 | GET /api/notes | Tagged note soft-deleted | Note has tag, note is soft-deleted | GET /api/notes?tagId={tag.id} | 200, soft-deleted note NOT in data | — |
| P20 | GET /api/notes | Pagination + tag filter: correct total | User has 5 notes, 3 have tag, `?tagId=X&limit=2` | GET /api/notes?tagId={X}&limit=2 | 200, `data`=2, `meta.total=3`, `meta.totalPages=2` | — |
| P21 | GET /api/notes | Sort + pagination: ordering preserved | User has 3 notes sorted newest→oldest: N3>N2>N1, `?sortBy=createdAt&sortDir=desc&limit=2` | page 1 = [N3,N2], page 2 = [N1] | — |

**Unit test scope** (`NoteService.pagination.test.ts`):
- P1: `listNotes` calls `findPaginated` with correct default params, returns mapped response with meta
- P2: `listNotes` with page=2, limit=2 — `skip=(2-1)*2=2` passed to repo
- P3: `listNotes` when `total=0` → `totalPages=0`
- P4: `listNotes` computes `totalPages=Math.ceil(total/limit)` correctly (e.g. total=5, limit=2 → 3)
- P5: `listNotes` passes `tagIds=[]` when no tags given
- P6: `listNotes` passes `tagIds=[uuid1, uuid2]` when two tags given
- P7: `listNotes` maps notes through `mapToResponse`
- P8: `listNotes` returns `page` and `limit` from params unchanged

---

## Checkpoints

After each phase run:

```bash
pnpm build          # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test           # all green (including existing N1–N25)
```

Stop on any failure. Fix before continuing.

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|---|---|
| A1 | No spec.md for AB-1005 — plan derived from FRS §4.2.2 and user decisions | Decisions are documented above as Design Decisions table; treat this plan as the contract |
| A2 | Existing `GET /api/notes` tests (N5, N6, N7) check `res.body.data` — adding `meta` is additive | Tests use `.data` accessor; adding sibling `meta` key does not break them |
| A3 | `validateQuery` stores result in `res.locals["parsedQuery"]` — requires consistent casting in route | Route handler must cast `res.locals["parsedQuery"] as TListNotesQuery`; documented here and enforced in review |
| A4 | `tagId` Zod transform normalises to `string[]` — empty array when param absent | Repository `findPaginated` receives `tagIds: string[]`; empty array means no tag filter applied |
| A5 | `Math.ceil(0 / limit)` = 0 — `totalPages` is 0 when no notes match | Intentional; client should handle `totalPages=0` |
| A6 | Two notes created in same millisecond — sort order is non-deterministic | Out of scope; test will insert with a delay between creates |
| A7 | `findPaginated` uses `prisma.$transaction([findMany, count])` — count uses identical `where` clause | Both queries share the same `where` object literal — consistent by construction |
