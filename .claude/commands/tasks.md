Break implementation into tasks for: $ARGUMENTS

---

## Step 1 — Read context

1. `openspec/changes/$ARGUMENTS/spec.md` — approved specification (scenarios + API contracts)
2. `openspec/changes/$ARGUMENTS/plan.md` — approved plan (files, phases, method signatures)
3. `AGENTS.md` — architecture rules, quality gates

---

## Step 2 — Generate tasks.md

Save to: `openspec/changes/$ARGUMENTS/tasks.md`

Use this exact format:

```markdown
# Tasks — {TICKET_ID}: {Feature Name}

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Shared Package

- [ ] Add interfaces to `packages/shared/src/types/{domain}.ts`
- [ ] Add Zod schemas to `packages/shared/src/schemas/{domain}.ts`
- [ ] Add error codes to `packages/shared/src/errors.ts`
- [ ] Export new types/schemas from `packages/shared/src/index.ts`

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Database

- [ ] Write Prisma schema changes (models/fields/relations)
- [ ] Run migration: `pnpm --filter backend prisma migrate dev --name {migration_name}`
- [ ] Verify schema compiles: `pnpm --filter backend prisma generate`

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Repository Layer

- [ ] Create `apps/backend/src/repositories/{Name}Repository.ts`
- [ ] Implement `{method1}` — {what it does}
- [ ] Implement `{method2}` — {what it does}
- [ ] Map all Prisma results to domain types (no raw Prisma objects returned)

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — Service Layer

- [ ] Create `apps/backend/src/services/{Name}Service.ts`
- [ ] Implement `{method1}` — {business rule it enforces}
- [ ] Implement `{method2}` — {business rule it enforces}
- [ ] Verify: no Prisma imports in service file
- [ ] Verify: no req/res objects used in service file

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — Route Layer

- [ ] Create `apps/backend/src/routes/{name}Routes.ts`
- [ ] Implement `{METHOD} /api/{path}` handler
- [ ] Validate request body/params with Zod schema from shared package
- [ ] Mount router in `apps/backend/src/app.ts`
- [ ] Verify: no business logic in route handlers
- [ ] Verify: no Prisma imports in route file

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Every row in the spec scenario table must have at least one test.

**Unit tests** (`apps/backend/src/__tests__/unit/services/`):

- [ ] `{Name}Service.test.ts`
  - [ ] AC-S1: {scenario name}
  - [ ] AC-S2: {scenario name}
  - [ ] ... (one checkbox per scenario ID from spec.md)

**Integration tests** (`apps/backend/src/__tests__/integration/routes/`):

- [ ] `{name}.test.ts`
  - [ ] AC-S1: {scenario name}
  - [ ] AC-S2: {scenario name}
  - [ ] ... (one checkbox per scenario ID from spec.md)

**Checkpoint 6 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on new files
```

---

## Rules

- One checkbox per implementation task
- One checkbox per test scenario (use the scenario ID from spec.md: S1, S2, ...)
- Never skip a checkpoint row — even if it seems obvious
- Phase 6 checkboxes are generated directly from the spec scenario table
- Do NOT implement any code
- Wait for user approval before implementation begins
