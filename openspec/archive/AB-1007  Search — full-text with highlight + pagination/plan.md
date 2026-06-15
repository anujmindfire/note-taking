# Plan — AB-1007: Search — Full-Text with Highlight + Pagination

**Based on spec:** openspec/changes/AB-1007  Search — full-text with highlight + pagination/spec.md
**Spec status:** Approved

---

## Phase 1 — Shared Package

Files to modify in `packages/shared/`:

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `src/types/index.ts` | Add `ISearchResult` interface |
| MODIFY | `src/schemas/index.ts` | Add `searchQuerySchema`, `TSearchQuery` |

**TypeScript interfaces (exact shape):**

```typescript
// Extends INoteResponse — adds highlight snippet field
export interface ISearchResult extends INoteResponse {
  highlight: string;
}
```

`INotesPageMeta` already exists with the correct shape (`total, page, limit, totalPages`) — reuse it for search meta.

**Zod schemas (exact shape):**

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

Export additions to `src/index.ts`: already re-exports `./types/index.js` and `./schemas/index.js` — no changes needed to `index.ts`.

---

## Phase 2 — Database

**Migration name:** `add_note_search_gin_index`

No Prisma schema model changes. Raw SQL migration only.

```sql
-- Migration: GIN index for full-text search on Note(title, content)
CREATE INDEX "note_search_idx" ON "Note" USING gin(
  to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
);
```

Create migration file manually at:
`apps/backend/prisma/migrations/{timestamp}_add_note_search_gin_index/migration.sql`

Then apply: `pnpm --filter backend prisma migrate dev --name add_note_search_gin_index`

Migration is **ADDITIVE** — index only, zero breaking changes.

---

## Phase 3 — Repository Layer

Files to create in `apps/backend/src/repositories/`:

| Action | File | Methods |
|--------|------|---------|
| CREATE | `SearchRepository.ts` | `search` |

### `SearchRepository.search`

**Signature:**
```typescript
search(params: {
  userId: string;
  q: string;
  page: number;
  limit: number;
  tagIds: string[];
}): Promise<{ results: ISearchResult[]; total: number }>
```

**Implementation steps (all inside the method):**

1. Build conditional tag filter using `Prisma.sql` / `Prisma.empty`
2. Raw SQL count query via `prisma.$queryRaw<[{ count: number }]>` — returns total matching notes
3. Early return `{ results: [], total: 0 }` if count is zero
4. Raw SQL paginated query via `prisma.$queryRaw<SearchRow[]>` — returns `{ id, highlight, rank }` for each matching note, ordered by `rank DESC`, with `LIMIT` / `OFFSET`
5. Prisma `note.findMany` — loads full note + tag data for the IDs from step 4, using `noteInclude` (duplicated from NoteRepository pattern)
6. Build `highlightMap: Map<string, string>` and `rankOrderMap: Map<string, number>` from search rows
7. Sort Prisma notes by rank order, map each to `ISearchResult` via `mapToSearchResult()` helper
8. Return `{ results, total }`

**Raw SQL queries:**

Count (with optional tag filter):
```sql
SELECT COUNT(*)::int AS count
FROM "Note" n
WHERE n."userId" = ${userId}
  AND n."deletedAt" IS NULL
  AND to_tsvector('english', coalesce(n.title,'') || ' ' || coalesce(n.content,''))
      @@ plainto_tsquery('english', ${q})
  ${tagFilter}
```

Tag filter fragment (when `tagIds.length > 0`):
```sql
AND n.id IN (
  SELECT nt."noteId" FROM "NoteTag" nt WHERE nt."tagId" = ANY(${tagIds}::uuid[])
)
```

Paginated results:
```sql
SELECT
  n.id,
  ts_headline(
    'english', n.content, plainto_tsquery('english', ${q}),
    'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=30,MinWords=15'
  ) AS highlight,
  ts_rank(
    to_tsvector('english', coalesce(n.title,'') || ' ' || coalesce(n.content,'')),
    plainto_tsquery('english', ${q})
  ) AS rank
FROM "Note" n
WHERE n."userId" = ${userId}
  AND n."deletedAt" IS NULL
  AND to_tsvector('english', coalesce(n.title,'') || ' ' || coalesce(n.content,''))
      @@ plainto_tsquery('english', ${q})
  ${tagFilter}
ORDER BY rank DESC
LIMIT ${limit} OFFSET ${offset}
```

**Important constraints:**
- Use `Prisma.sql` tagged template exclusively — never string interpolation
- `COUNT(*)` returns `bigint` from PostgreSQL — cast to `::int` in SQL or use `Number()` in JS
- `highlight` from `ts_headline` may be empty string — always coalesce to `''`
- `noteInclude` const duplicated from `NoteRepository.ts` (acceptable, noted as R4 in risks)

**`mapToSearchResult` helper signature:**
```typescript
function mapToSearchResult(note: PrismaNote, highlight: string): ISearchResult
// Maps Date fields to ISO strings, flattens noteTags to tags array, adds highlight
```

---

## Phase 4 — Service Layer

Files to create in `apps/backend/src/services/`:

| Action | File | Methods |
|--------|------|---------|
| CREATE | `SearchService.ts` | `search` |

### `SearchService.search`

**Signature:**
```typescript
search(userId: string, query: TSearchQuery): Promise<{ results: ISearchResult[]; meta: INotesPageMeta }>
```

**Logic:**
```
1. Call SearchRepository.search({ userId, q: query.q, page: query.page, limit: query.limit, tagIds: query.tagId })
2. Compute totalPages = Math.ceil(total / query.limit)
3. Return { results, meta: { total, page: query.page, limit: query.limit, totalPages } }
```

No validation beyond the Zod schema (already enforced at route layer). No Prisma imports. No req/res.

---

## Phase 5 — Route Layer

Files to create/modify:

| Action | File | Routes |
|--------|------|--------|
| CREATE | `apps/backend/src/routes/searchRoutes.ts` | `GET /` |
| MODIFY | `apps/backend/src/app.ts` | Mount `searchRoutes` at `/api/search` |

**Route handler:**
```typescript
router.get('/', requireAuth, validateQuery(searchQuerySchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const query = res.locals['parsedQuery'] as TSearchQuery;
    const result = await SearchService.search(userId, query);
    res.json({ data: result.results, meta: result.meta });
  } catch (err) {
    next(err);
  }
});
```

**app.ts mount line:**
```typescript
import { searchRoutes } from './routes/searchRoutes.js';
// ...
app.use('/api/search', searchRoutes);
```

Mount before `app.use(notFound)`.

---

## Phase 6 — Tests

Delegate entirely to test-writer agent.

| File | Type | Scenarios |
|------|------|-----------|
| `apps/backend/src/__tests__/unit/services/SearchService.test.ts` | Unit | S1, S4, S9, S10, S11, S12, S13, S14 |
| `apps/backend/src/__tests__/integration/routes/search.test.ts` | Integration | S1–S16 |

---

## Checkpoints

After each phase:
```bash
pnpm build          # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test           # all green (from Phase 6 onward)
```

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|----------------|-----------|
| R1 | Conditional tag filter in raw SQL — use `Prisma.sql`/`Prisma.empty` to avoid dynamic string building | Two clean variants via `Prisma.sql` conditionals |
| R2 | `COUNT(*)` returns PostgreSQL `bigint` → JS `BigInt` — must convert to `Number` | Use `::int` cast in SQL |
| R3 | `ts_headline` on empty content returns empty string | Coalesce `highlight ?? ''` in mapper |
| R4 | `noteInclude` duplicated from `NoteRepository` | Acceptable trade-off; extraction is out of scope |
| R5 | Raw migration not reflected in `schema.prisma` | No model changes needed; index-only migration is valid Prisma pattern |
