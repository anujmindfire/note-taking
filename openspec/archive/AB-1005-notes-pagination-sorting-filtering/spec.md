# Spec — AB-1005: Notes Pagination, Sorting, and Filtering

**Status:** Archived
**Ticket:** AB-1005
**Branch:** feature/backend/AB-1005-notes-pagination-sorting-filtering
**FRS References:** FRS §4.2.2 AC1, §5.1.3
**SDS References:** SDS §4.3
**Layer:** Backend only
**Depends on:** AB-1004 (notes CRUD, NoteTag join table)

---

## Summary

Extends `GET /api/notes` from a flat list to a paginated, sorted, and tag-filtered endpoint. Callers receive a `data` array of notes for the requested page alongside a `meta` object containing `total`, `page`, `limit`, and `totalPages`. Query parameters control which page to fetch, how many results per page, which field to sort by, the sort direction, and an optional tag filter that matches notes containing any of the specified tags (OR logic).

---

## In Scope

- Offset-based pagination via `?page=` and `?limit=` query parameters
- Sorting via `?sortBy=createdAt|updatedAt` and `?sortDir=asc|desc`
- Tag filtering via one or more `?tagId=<uuid>` parameters (OR — note matches if it has ANY of the given tags)
- Response envelope extended to `{ data: [...], meta: { total, page, limit, totalPages } }`
- `validateQuery` middleware helper in `validate.ts` that stores the parsed result in `res.locals["parsedQuery"]`
- New `findPaginated` method in `NoteRepository` using `prisma.$transaction([findMany, count])`
- Performance indexes on `Note(userId, createdAt)`, `Note(userId, updatedAt)`, and `NoteTag(tagId)`
- `INotesPageMeta` interface and `listNotesQuerySchema` / `TListNotesQuery` added to `@noteapp/shared`

## Out of Scope

- Cursor-based pagination
- Full-text search (separate ticket)
- Sorting by fields other than `createdAt` and `updatedAt`
- Tag filter AND logic (all tags must match)
- Frontend changes
- Filtering by date ranges
- Returning deleted notes

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | Pagination is offset-based: `skip = (page - 1) * limit`. Cursor pagination is out of scope | SDS §4.3 |
| A2 | Default values: `page=1`, `limit=20`, `sortBy=createdAt`, `sortDir=desc` — newest-first is the natural default | User confirmed |
| A3 | `limit` is bounded: min 1, max 100. Values outside this range produce `VALIDATION_ERROR` | User confirmed |
| A4 | `page` minimum is 1; `page=0` and negative values produce `VALIDATION_ERROR` | Zod `min(1)` |
| A5 | Tag filter uses OR logic: a note is included if it has any one of the supplied `tagId` values | User confirmed |
| A6 | Supplying a `tagId` that does not exist or belongs to another user returns 200 with empty `data` — not an error | User confirmed |
| A7 | `tagId` query parameter is normalised by Zod transform: single UUID → `[uuid]`, array → kept as-is, absent → `[]`, non-UUID → `VALIDATION_ERROR` | plan.md Phase 1 |
| A8 | `totalPages` is `Math.ceil(total / limit)`. When `total` is 0 this evaluates to 0 | plan.md |
| A9 | Soft-deleted notes are excluded from all paginated results, consistent with existing note queries | plan.md Phase 3 |
| A10 | `findAllByUserId` is retained unchanged; no existing callers are broken | plan.md Phase 3 |
| A11 | Two notes created within the same millisecond have non-deterministic relative sort order | plan.md Risks |
| A12 | The `count` query in `prisma.$transaction` uses the identical `where` clause as `findMany`, ensuring `meta.total` always reflects the full filtered count | plan.md Phase 3 |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| P1 | Default pagination — no query string | User has 3 active notes | GET `/api/notes` | 200; `data` has 3 notes; `meta.page=1`, `meta.limit=20`, `meta.total=3`, `meta.totalPages=1` | §4.2.2 AC1 | — |
| P2 | Second page — page=2, limit=2 | User has 3 active notes | GET `/api/notes?page=2&limit=2` | 200; `data` has 1 note; `meta.page=2`, `meta.total=3`, `meta.totalPages=2` | §4.2.2 AC1 | — |
| P3 | Beyond last page — page=99 | User has 2 active notes | GET `/api/notes?page=99` | 200; `data=[]`; `meta.total=2`; `meta.page=99` | §4.2.2 AC1 | — |
| P4 | Invalid page — page=0 | Any authenticated user | GET `/api/notes?page=0` | 400; `VALIDATION_ERROR`; `fields` contains `"page"` | — | `VALIDATION_ERROR` |
| P5 | Invalid page — negative | Any authenticated user | GET `/api/notes?page=-1` | 400; `VALIDATION_ERROR` | — | `VALIDATION_ERROR` |
| P6 | Invalid limit — limit=0 | Any authenticated user | GET `/api/notes?limit=0` | 400; `VALIDATION_ERROR`; `fields` contains `"limit"` | — | `VALIDATION_ERROR` |
| P7 | Invalid limit — limit=101 | Any authenticated user | GET `/api/notes?limit=101` | 400; `VALIDATION_ERROR` | — | `VALIDATION_ERROR` |
| P8 | Missing auth | No Authorization header | GET `/api/notes` | 401; `UNAUTHORIZED` | — | `UNAUTHORIZED` |
| P9 | Sort by createdAt descending | User has 2 notes created at T1 < T2 | GET `/api/notes?sortBy=createdAt&sortDir=desc` | 200; T2 note is `data[0]` | §5.1.3 | — |
| P10 | Sort by createdAt ascending | User has 2 notes created at T1 < T2 | GET `/api/notes?sortBy=createdAt&sortDir=asc` | 200; T1 note is `data[0]` | §5.1.3 | — |
| P11 | Sort by updatedAt descending | Note A updated more recently than Note B | GET `/api/notes?sortBy=updatedAt&sortDir=desc` | 200; Note A is `data[0]` | §5.1.3 | — |
| P12 | Invalid sortBy value | Any authenticated user | GET `/api/notes?sortBy=title` | 400; `VALIDATION_ERROR` | — | `VALIDATION_ERROR` |
| P13 | Invalid sortDir value | Any authenticated user | GET `/api/notes?sortDir=random` | 400; `VALIDATION_ERROR` | — | `VALIDATION_ERROR` |
| P14 | Filter by single tag | User has 2 notes; only note A has tagX | GET `/api/notes?tagId={tagX.id}` | 200; `data` contains only note A | §4.2.2 AC1 | — |
| P15 | Filter by multiple tags — OR logic | Note A has tag1; Note B has tag2; Note C has neither | GET `/api/notes?tagId={tag1.id}&tagId={tag2.id}` | 200; `data` contains A and B; C excluded | §4.2.2 AC1 | — |
| P16 | Non-existent tagId — empty results | Valid UUID never inserted | GET `/api/notes?tagId={random-uuid}` | 200; `data=[]`; `meta.total=0` | — | — |
| P17 | Cross-user tagId — empty results | tagId belongs to another user's tag | GET `/api/notes?tagId={other-user-tag.id}` | 200; `data=[]` | — | — |
| P18 | Invalid tagId — not a UUID | Any authenticated user | GET `/api/notes?tagId=notauuid` | 400; `VALIDATION_ERROR` | — | `VALIDATION_ERROR` |
| P19 | Tag filter — soft-deleted note excluded | Note has tagX but is soft-deleted | GET `/api/notes?tagId={tagX.id}` | 200; soft-deleted note absent | — | — |
| P20 | Pagination + tag filter — total reflects filtered count | User has 5 notes, 3 with tagX; `limit=2` | GET `/api/notes?tagId={tagX.id}&limit=2` | 200; `data` has 2 items; `meta.total=3`; `meta.totalPages=2` | §4.2.2 AC1 | — |
| P21 | Sort + pagination — ordering preserved across pages | 3 notes N3 > N2 > N1 by createdAt; `limit=2` | GET `/api/notes?sortBy=createdAt&sortDir=desc&limit=2` page 1 then page 2 | Page 1: `[N3, N2]`; Page 2: `[N1]` | §5.1.3 | — |

---

## API Contract

### GET /api/notes

**Auth required:** Yes (`Authorization: Bearer <accessToken>`)

**Query parameters:**

| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `page` | integer (coerced) | `1` | min 1 |
| `limit` | integer (coerced) | `20` | min 1, max 100 |
| `sortBy` | `"createdAt"` \| `"updatedAt"` | `"createdAt"` | enum |
| `sortDir` | `"asc"` \| `"desc"` | `"desc"` | enum |
| `tagId` | UUID string, repeatable | absent (no filter) | valid UUID; OR logic |

**Success response — 200:**
```json
{
  "data": [
    {
      "id": "uuid", "userId": "uuid", "title": "string", "content": "string",
      "deletedAt": null, "createdAt": "ISO8601", "updatedAt": "ISO8601",
      "tags": [{ "id": "uuid", "userId": "uuid", "name": "string", "color": "string|null", "noteCount": 0, "createdAt": "ISO8601" }]
    }
  ],
  "meta": { "total": 3, "page": 1, "limit": 20, "totalPages": 1 }
}
```

**Error responses:**

| Status | Code | Condition |
|--------|------|-----------|
| 400 | `VALIDATION_ERROR` | Any param fails validation; `fields` present |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization |

---

## Database Changes

**Migration name:** `add_note_sort_and_tag_filter_indexes`

Additive only — no dropped columns or tables:

```prisma
model Note {
  // existing fields unchanged
  @@index([userId, createdAt])   // new — composite for sort-by-createdAt scoped to user
  @@index([userId, updatedAt])   // new — composite for sort-by-updatedAt scoped to user
}

model NoteTag {
  // existing fields unchanged
  @@index([tagId])               // new — supports WHERE tagId IN (...) subqueries
}
```

---

## Shared Package Changes

**`packages/shared/src/types/index.ts` — new interface:**
```typescript
export interface INotesPageMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**`packages/shared/src/schemas/index.ts` — new schema and type:**
```typescript
export const listNotesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(["createdAt", "updatedAt"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  tagId: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
});

export type TListNotesQuery = z.infer<typeof listNotesQuerySchema>;
```

**`apps/backend/src/middleware/validate.ts` — new helper:**
```typescript
export function validateQuery(schema: ZodSchema): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));
      return next(createError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", fields));
    }
    res.locals["parsedQuery"] = result.data;
    next();
  };
}
```

---

## Architecture Notes

**Pagination strategy:** Offset-based. `skip = (page - 1) * limit`, `take = limit`. Simple and sufficient for expected data volumes.

**Count + data in one round-trip:** `NoteRepository.findPaginated` runs `prisma.$transaction([findMany, count])`. Both queries share the same `where` object, guaranteeing `meta.total` always reflects the count matching the same filter.

**Sort field handling:** `orderBy: { [params.sortBy]: params.sortDir }` — Zod enum constraint ensures only valid field names reach this point; no injection risk.

**Tag filter implementation:** When `tagIds` is non-empty, the `where` clause includes `noteTags: { some: { tagId: { in: tagIds } } }`. When `tagIds` is empty the clause is omitted and all non-deleted notes for the user are returned. Cross-user tag IDs naturally return no results.

**`validateQuery` vs `validate`:** `validateQuery` stores results in `res.locals["parsedQuery"]` rather than mutating `req.query` because Express types `req.query` as `ParsedQs`, which is incompatible with coerced `number` and `string[]` values from Zod.

**No N+1:** Tags loaded via Prisma `include` (`noteInclude` constant) in a single query.
