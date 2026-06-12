Create implementation plan for: $ARGUMENTS

---

## Step 1 — Read context

Read these files in order:

1. `AGENTS.md` — architecture rules, naming conventions, error codes
2. `openspec/changes/$ARGUMENTS/spec.md` — the approved specification
3. `docs/SDS.md` — system design for architectural alignment
4. `packages/shared/src/` — existing types, schemas, error codes
5. `apps/backend/src/routes/` — existing route patterns
6. `apps/backend/src/services/` — existing service patterns
7. `apps/backend/src/repositories/` — existing repository patterns
8. `apps/backend/prisma/schema.prisma` — current DB schema

---

## Step 2 — Generate plan.md

Save to: `openspec/changes/$ARGUMENTS/plan.md`

Use this exact format:

```markdown
# Plan — {TICKET_ID}: {Feature Name}

**Based on spec:** openspec/changes/$ARGUMENTS/spec.md
**Spec status:** Approved

---

## Phase 1 — Shared Package

Files to create/modify in `packages/shared/`:

| Action | File | What changes |
|--------|------|-------------|
| CREATE | `src/types/tag.ts` | ITag, ITagResponse interfaces |
| MODIFY | `src/errors.ts` | Add TAG_NOT_FOUND, TAG_NAME_TAKEN |
| CREATE | `src/schemas/tag.ts` | createTagSchema, tagIdParamSchema |

TypeScript interfaces (exact shape):

```typescript
// list every new interface with all fields and types
```

Zod schemas (exact shape):

```typescript
// list every new schema
```

---

## Phase 2 — Database

Migration: `{migration_name}`

Changes:
- ADD TABLE / ADD COLUMN / ADD CONSTRAINT (list each one)
- Cascade rules
- Unique constraints

```prisma
// show exact Prisma model additions/changes
```

Migration is: ADDITIVE / BREAKING (explain if breaking)

---

## Phase 3 — Repository Layer

Files to create/modify in `apps/backend/src/repositories/`:

| Action | File | Methods to add |
|--------|------|---------------|
| CREATE | `TagRepository.ts` | findAllByUserId, create, delete, ... |

For each method, define:
- Signature: `methodName(params): Promise<ReturnType>`
- What Prisma query it runs
- What domain type it returns (never raw Prisma object)

---

## Phase 4 — Service Layer

Files to create/modify in `apps/backend/src/services/`:

| Action | File | Methods to add |
|--------|------|---------------|
| CREATE | `TagService.ts` | listTags, createTag, deleteTag, ... |

For each method, define:
- Signature
- Business rules enforced
- Which repository methods it calls
- Which errors it throws (with exact error code)

No Prisma calls allowed in services.

---

## Phase 5 — Route Layer

Files to create/modify in `apps/backend/src/routes/`:

| Action | File | Routes |
|--------|------|--------|
| CREATE | `tagRoutes.ts` | GET /tags, POST /tags, DELETE /tags/:id |
| MODIFY | `apps/backend/src/app.ts` | Mount tagRoutes at /api/tags |

Each route handler must only:
1. Validate request with Zod
2. Call service method
3. Send response

No business logic. No Prisma. No direct DB calls.

---

## Phase 6 — Tests

Files to create in `apps/backend/src/__tests__/`:

| File | Type | Scenarios covered |
|------|------|------------------|
| `unit/services/TagService.test.ts` | Unit | S1, S2, S3... |
| `integration/routes/tags.test.ts` | Integration | S1, S2, S3... |

Every scenario from spec.md must map to at least one test.
Test-writer agent handles this phase.

---

## Checkpoints

After each phase run:

```bash
pnpm build          # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test           # all green
```

Stop on any failure. Fix before continuing.

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|----------------|-----------|
| R1 | ... | ... |
```

---

## Rules

- Prefer reuse over new abstractions
- Follow existing patterns exactly — no new patterns
- All shared types go in `packages/shared` only
- Plan must be deterministic: no vague "add as needed" items
- Do NOT implement code
- Wait for the user to approve the plan before implementation begins
