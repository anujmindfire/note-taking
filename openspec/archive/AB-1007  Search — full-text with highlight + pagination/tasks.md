# Tasks — AB-1007: Search — Full-Text with Highlight + Pagination

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Shared Package

- [ ] Add `ISearchResult` interface to `packages/shared/src/types/index.ts`
- [ ] Add `searchQuerySchema` Zod schema to `packages/shared/src/schemas/index.ts`
- [ ] Add `TSearchQuery` type export to `packages/shared/src/schemas/index.ts`

(`packages/shared/src/index.ts` already re-exports `./types/index.js` and `./schemas/index.js` — no changes needed)

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Database

- [ ] Create migration directory: `apps/backend/prisma/migrations/{timestamp}_add_note_search_gin_index/`
- [ ] Write `migration.sql`: GIN index on `Note` using `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))`
- [ ] Ask user [y/n] before running migration
- [ ] Run `pnpm --filter backend prisma migrate dev --name add_note_search_gin_index`
- [ ] Verify: `pnpm --filter backend prisma generate`

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Repository Layer

- [ ] Create `apps/backend/src/repositories/SearchRepository.ts`
- [ ] Implement `search` — raw SQL count query via `prisma.$queryRaw` (with/without tag filter using `Prisma.sql`/`Prisma.empty`)
- [ ] Implement `search` — raw SQL paginated results via `prisma.$queryRaw` with `ts_headline` and `ts_rank`
- [ ] Implement `search` — Prisma `findMany` for full note + tag data using returned IDs
- [ ] Implement `search` — merge highlights onto notes, sort by rank, return `{ results: ISearchResult[], total: number }`
- [ ] Implement `mapToSearchResult` helper — maps Prisma row + highlight to `ISearchResult` (Date → ISO string)
- [ ] Verify: all SQL uses `Prisma.sql` tagged template — no string interpolation
- [ ] Verify: no raw Prisma objects returned — only mapped `ISearchResult[]`

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — Service Layer

- [ ] Create `apps/backend/src/services/SearchService.ts`
- [ ] Implement `search(userId, query)` — calls `SearchRepository.search`, computes `totalPages`, returns `{ results, meta }`
- [ ] Verify: no Prisma imports in `SearchService.ts`
- [ ] Verify: no `req`/`res` objects in `SearchService.ts`

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — Route Layer

- [ ] Create `apps/backend/src/routes/searchRoutes.ts`
- [ ] Implement `GET /` — `requireAuth` + `validateQuery(searchQuerySchema)` + call `SearchService.search` + return `{ data, meta }`
- [ ] Modify `apps/backend/src/app.ts` — import `searchRoutes`, mount at `/api/search` before `notFound` middleware
- [ ] Verify: no business logic in `searchRoutes.ts`
- [ ] Verify: no Prisma imports in `searchRoutes.ts`

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Every row in the scenario table must have at least one test.

**Unit tests** (`apps/backend/src/__tests__/unit/services/`):

- [ ] `SearchService.test.ts`
  - [ ] AC-S1: Match in content — returns result with highlight containing `<mark>` tags
  - [ ] AC-S4: No results — returns empty array with meta.total = 0
  - [ ] AC-S9: Soft-deleted notes excluded
  - [ ] AC-S10: Cross-user isolation
  - [ ] AC-S11: Pagination first page — correct slice and meta
  - [ ] AC-S12: Pagination beyond last page — empty results with correct meta
  - [ ] AC-S13: Relevance ordering — results in rank DESC order
  - [ ] AC-S14: Tag filter narrows results

**Integration tests** (`apps/backend/src/__tests__/integration/routes/`):

- [ ] `search.test.ts`
  - [ ] AC-S1: Match in content
  - [ ] AC-S2: Match in title only
  - [ ] AC-S3: Match in both title and content
  - [ ] AC-S4: No results — 200 empty array
  - [ ] AC-S5: Empty query string — 400 VALIDATION_ERROR
  - [ ] AC-S6: Whitespace-only query — 400 VALIDATION_ERROR
  - [ ] AC-S7: Missing q parameter — 400 VALIDATION_ERROR
  - [ ] AC-S8: Query exceeds 500 chars — 400 VALIDATION_ERROR
  - [ ] AC-S9: Soft-deleted notes excluded
  - [ ] AC-S10: Cross-user isolation
  - [ ] AC-S11: Pagination — first page
  - [ ] AC-S12: Pagination — beyond last page
  - [ ] AC-S13: Relevance ordering
  - [ ] AC-S14: Tag filter narrows results
  - [ ] AC-S15: Unauthenticated request — 401 UNAUTHORIZED
  - [ ] AC-S16: Invalid tagId format — 400 VALIDATION_ERROR

**Checkpoint 6 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on new files
