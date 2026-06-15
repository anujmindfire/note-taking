# Spec — AB-1007: Search — Full-Text with Highlight + Pagination

**Status:** Approved
**Ticket:** AB-1007
**Branch:** feature/backend/AB-1007-search-fulltext
**FRS References:** §4.4.1
**SDS References:** §5.3
**Layer:** Backend only
**Depends on:** AB-1004

---

## Summary

Adds a `GET /api/search` endpoint that performs PostgreSQL full-text search across the authenticated user's note titles and content. Results are ranked by relevance (`ts_rank` DESC), include a `highlight` snippet with matched terms wrapped in `<mark>` tags (generated via `ts_headline`), support pagination, and can be narrowed by tag. Soft-deleted notes and notes owned by other users are always excluded.

---

## In Scope

- `GET /api/search?q=...` endpoint (auth-required)
- Full-text search across `Note.title` and `Note.content` using PostgreSQL GIN index + `to_tsvector`
- `highlight` field per result: content snippet with `<mark>` tags around matched terms via `ts_headline`
- Relevance-ranked results (`ts_rank` DESC); no caller-configurable sort
- Pagination via `page` and `limit` query params (defaults: page=1, limit=20, max limit=100)
- Optional `tagId` filtering (single UUID or array) — same pattern as `GET /api/notes`
- GIN index migration on `Note(title, content)`

## Out of Scope

- Searching notes owned by other users
- Searching soft-deleted notes
- Caller-configurable sort order (always `ts_rank` DESC)
- Separate `titleHighlight` / `contentHighlight` fields
- Fuzzy or phonetic matching
- Frontend implementation

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | Results sorted by `ts_rank` DESC exclusively; no `sortBy`/`sortDir` params | User answer Q3 |
| A2 | Maximum query string length: 500 characters | Spec default |
| A3 | `tagId` uses same multi-value pattern as `GET /api/notes`: `?tagId=uuid` or `?tagId[]=uuid1&tagId[]=uuid2` | User answer Q5 |
| A4 | `highlight` generated via `ts_headline` on `Note.content`; when match is only in title the snippet is a content excerpt without `<mark>` tags | User answer Q2 |
| A5 | `ts_headline` options: `StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=30,MinWords=15` | Spec default |
| A6 | Whitespace-only query string (after trim) → 400 `VALIDATION_ERROR` | User answer Q4 |
| A7 | `plainto_tsquery` used for safe plain-user-input parsing | Spec default |
| A8 | Full `content` field returned on each result alongside the `highlight` snippet | User answer Q6 |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Match in content | Auth user; note content contains query term | `GET /api/search?q=typescript` | HTTP 200; note in results; `highlight` contains `<mark>typescript</mark>` | §4.4.1 AC1, AC2 | — |
| S2 | Match in title only | Auth user; query term in title, not in content | `GET /api/search?q=planning` | HTTP 200; note in results; `highlight` is content excerpt without `<mark>` | §4.4.1 AC1, AC2 | — |
| S3 | Match in both fields | Auth user; query term in both title and content | `GET /api/search?q=sprint` | HTTP 200; note in results; `highlight` from content with `<mark>sprint</mark>` | §4.4.1 AC1, AC2 | — |
| S4 | No results | Auth user; no notes match query | `GET /api/search?q=zzznomatch` | HTTP 200; `{ data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 0 } }` | §4.4.1 AC1 | — |
| S5 | Empty query string | Auth user | `GET /api/search?q=` | HTTP 400 `VALIDATION_ERROR` | §4.4.1 errors | `VALIDATION_ERROR` |
| S6 | Whitespace-only query | Auth user | `GET /api/search?q=%20%20` | HTTP 400 `VALIDATION_ERROR` | §4.4.1 errors, A6 | `VALIDATION_ERROR` |
| S7 | Missing q parameter | Auth user | `GET /api/search` | HTTP 400 `VALIDATION_ERROR` | §4.4.1 errors | `VALIDATION_ERROR` |
| S8 | Query exceeds 500 chars | Auth user | `GET /api/search?q={501-char string}` | HTTP 400 `VALIDATION_ERROR` | A2 | `VALIDATION_ERROR` |
| S9 | Soft-deleted notes excluded | Auth user; matching note has `deletedAt` set | `GET /api/search?q=term` | HTTP 200; soft-deleted note absent from results | §4.4.1 AC3 | — |
| S10 | Cross-user isolation | User A owns matching note; User B searches | `GET /api/search?q=term` as User B | HTTP 200; User A's note absent | §4.4.1 AC3 | — |
| S11 | Pagination — first page | Auth user; 5 matching notes | `GET /api/search?q=term&page=1&limit=2` | HTTP 200; 2 results; `meta: { total: 5, page: 1, limit: 2, totalPages: 3 }` | §4.4.1 AC4 | — |
| S12 | Pagination — beyond last page | Auth user; 3 matching notes | `GET /api/search?q=term&page=10&limit=20` | HTTP 200; `{ data: [], meta: { total: 3, page: 10, limit: 20, totalPages: 1 } }` | §4.4.1 AC4 | — |
| S13 | Relevance ordering | Auth user; multiple matching notes | `GET /api/search?q=term` | HTTP 200; most-relevant note first | A1 | — |
| S14 | Tag filter narrows results | Auth user; 3 matching notes, 1 has target tag | `GET /api/search?q=term&tagId={uuid}` | HTTP 200; only the tagged note in results | A3 | — |
| S15 | Unauthenticated request | No Authorization header | `GET /api/search?q=term` | HTTP 401 `UNAUTHORIZED` | §4.4.1 errors | `UNAUTHORIZED` |
| S16 | Invalid tagId format | Auth user | `GET /api/search?q=term&tagId=notauuid` | HTTP 400 `VALIDATION_ERROR` | §4.4.1 errors | `VALIDATION_ERROR` |

---

## API Contract

### GET /api/search

**Auth required:** Yes

**Request query params:**

| Param | Type | Required | Default | Constraints |
|-------|------|----------|---------|-------------|
| `q` | string | Yes | — | 1–500 chars; whitespace-only → 400 |
| `page` | integer | No | `1` | ≥ 1 |
| `limit` | integer | No | `20` | 1–100 |
| `tagId` | string \| string[] | No | `[]` | UUID format |

**Success response:** HTTP 200
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "title": "Weekly Planning Notes",
      "content": "Review sprint progress and goals for the week.",
      "highlight": "Review <mark>sprint</mark> progress and goals for the week.",
      "deletedAt": null,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "tags": [
        {
          "id": "uuid",
          "userId": "uuid",
          "name": "Work",
          "color": "#ff0000",
          "noteCount": 3,
          "createdAt": "2024-01-01T00:00:00.000Z"
        }
      ]
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | `q` missing, empty, whitespace-only, or > 500 chars; `tagId` not UUID |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |

---

## Database Changes

**New migration (additive):** `add_note_search_gin_index`

Add a PostgreSQL GIN index on the `Note` table for full-text search across `title` and `content`:

```sql
CREATE INDEX "note_search_idx" ON "Note" USING gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
);
```

Migration is **ADDITIVE** — index only, no column or data changes. No `schema.prisma` model changes required.

---

## Shared Package Changes

### New interface in `src/types/index.ts`

```typescript
export interface ISearchResult extends INoteResponse {
  highlight: string;
}
```

### New Zod schema in `src/schemas/index.ts`

```typescript
export const searchQuerySchema = z.object({
  q: z
    .string()
    .min(1)
    .max(500)
    .refine((v) => v.trim().length > 0, { message: 'Search query cannot be whitespace only' }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  tagId: z
    .union([z.string().uuid(), z.array(z.string().uuid())])
    .optional()
    .transform((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v])),
});

export type TSearchQuery = z.infer<typeof searchQuerySchema>;
```

No new error codes — `VALIDATION_ERROR` and `UNAUTHORIZED` cover all error cases.

---

## Architecture Notes

`SearchRepository.search()` uses `prisma.$queryRaw` (with `Prisma.sql` tagged template — never string interpolation) for the `ts_headline` and `ts_rank` calls, then a second Prisma `findMany` to load full note + tag data for the returned IDs. The two result sets are merged in the repository before returning `ISearchResult[]`. The service layer only computes `totalPages` and shapes the meta object. The route handler delegates entirely to the service.
