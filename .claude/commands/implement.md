Implement: $ARGUMENTS

---

## Step 1 — Read context

Read these files before writing a single line of code:

1. `CLAUDE.md` — project-wide rules, permission model, quality gates
2. `AGENTS.md` — architecture rules, error codes, naming conventions, quality gates
3. Domain CLAUDE.md — read the one matching the ticket layer:
   - Frontend ticket → `apps/frontend/CLAUDE.md`
   - Backend ticket → `apps/backend/CLAUDE.md`
   - Full-stack → read both
4. `openspec/changes/$ARGUMENTS/spec.md` — what to build (API contract, scenarios, DB changes)
5. `openspec/changes/$ARGUMENTS/plan.md` — how to build it (exact files, method signatures)
6. `openspec/changes/$ARGUMENTS/tasks.md` — checklist to follow phase by phase

Also scan for reusable patterns:
- `apps/backend/src/repositories/` — existing repository examples
- `apps/backend/src/services/` — existing service examples
- `apps/backend/src/routes/` — existing route handler patterns
- `apps/backend/src/middleware/` — auth guard, error handler
- `packages/shared/src/` — existing types, schemas, error codes

---

## Step 2 — Implement phase by phase

Work through tasks.md in phase order. For each phase:

1. Complete every checkbox in the phase
2. Run the checkpoint gate for that phase:
   ```bash
   pnpm build
   pnpm lint --max-warnings 0
   ```
3. Fix any failure before moving to the next phase
4. Do NOT skip phases or reorder them

**Three-layer rule — strictly enforced:**

- Routes: parse req, validate with Zod from `@noteapp/shared`, call service, return response. Nothing else.
- Services: business rules only. No `prisma.*` calls. No `req`/`res` objects.
- Repositories: all Prisma queries. Return domain types, not raw Prisma objects.

**Shared package rule:**

- All interfaces → `packages/shared/src/types/`
- All Zod schemas → `packages/shared/src/schemas/`
- All error codes → `packages/shared/src/errors.ts`
- Import with `@noteapp/shared` everywhere

---

## Permission rules

Ask [y/n] before:

- Running any DB migration (`prisma migrate dev`, `prisma migrate reset`)
- Adding or removing npm packages
- Deleting files
- Modifying root config files (`tsconfig.json`, `package.json`, `prisma/schema.prisma`)

Proceed automatically for:

- Creating new feature files (routes, services, repositories)
- Creating test files
- Modifying shared package types/schemas/errors
- Modifying `app.ts` to mount a new router

---

## Phase 6 — Tests

Delegate test writing to the **`test-writer` subagent** using the Agent tool:

```
Agent({
  subagent_type: "test-writer",
  prompt: `Write all tests for $ARGUMENTS.
    Spec (scenario IDs + AC): openspec/changes/$ARGUMENTS/spec.md
    Implementation files: [list each created/modified file]
    Pattern examples: [list 1-2 existing test files in the same directory]
    Rules:
    - Name every test "AC-{ID}: {scenario name}" matching the spec table exactly
    - Backend unit tests → apps/backend/src/__tests__/unit/services/
    - Backend integration tests → apps/backend/src/__tests__/integration/routes/
    - Frontend hook tests → apps/frontend/src/__tests__/hooks/
    - Frontend component tests → apps/frontend/src/__tests__/components/
    - Assert res.body.error.code string, not just HTTP status, on every error case
    - Do NOT touch implementation files — tests only`
})
```

The test-writer must cover every scenario row from spec.md.

---

## Final checkpoint

Before declaring done, run:

```bash
pnpm build
pnpm lint --max-warnings 0
pnpm test
pnpm test --coverage
```

All must pass. Coverage must be ≥ 80% on new files.

---

## Completion report

When all phases are done, provide:

### Files Changed
List every file created or modified with a one-line description.

### Spec Scenarios Covered
| Scenario ID | Scenario Name | Test File |
|-------------|--------------|-----------|
| S1 | ... | ... |

### Assumptions Made
Any decisions not explicit in the spec.

### Follow-up Tasks
Anything deferred or out of scope.

---

After implementation, archive the change:

Move `openspec/changes/$ARGUMENTS/` to `openspec/archive/$ARGUMENTS/`
