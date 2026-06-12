Prepare PR for: $ARGUMENTS

---

## Step 1 — Run quality gates

Run in this exact order. Fix any failure before continuing.

```bash
pnpm build
pnpm lint --max-warnings 0
pnpm test
pnpm test --coverage
```

Report results — if anything fails, stop here and fix it.

---

## Step 2 — Run spec review

Invoke the reviewer agent against the implementation. Pass it:

- `openspec/changes/$ARGUMENTS/spec.md` or `openspec/archive/$ARGUMENTS/spec.md`
- The git diff

If any `❌ MISSING` or `🔒 SECURITY` findings are returned, fix them before the PR. `⚠️ DRIFTED` findings should be resolved unless there is a deliberate reason to deviate.

---

## Step 3 — Generate PR description

```markdown
## {TICKET_ID}: {Feature Name}

**Branch:** feature/backend/{TICKET_ID}-{short-name}
**Ticket:** AB#{number}

### Summary

One paragraph: what was built and why.

### Changes

| Layer | File | Change |
|-------|------|--------|
| Shared | `packages/shared/src/types/tag.ts` | New ITag interface |
| Repository | `apps/backend/src/repositories/TagRepository.ts` | New — all tag DB queries |
| Service | `apps/backend/src/services/TagService.ts` | New — tag business logic |
| Routes | `apps/backend/src/routes/tagRoutes.ts` | New — 5 endpoints |
| Tests | `src/__tests__/unit/services/TagService.test.ts` | 24 unit tests |
| Tests | `src/__tests__/integration/routes/tags.test.ts` | 36 integration tests |

### FRS Requirements Addressed

| Requirement | AC | Status |
|-------------|-----|--------|
| §4.3.1 | AC1 — List user tags | ✅ |
| §4.3.2 | AC1 — Create tag | ✅ |

### Spec Scenarios

| ID | Scenario | Test |
|----|----------|------|
| S1 | Happy path — list tags | ✅ AC-S1 in tags.test.ts |
| S2 | Auth required — no token | ✅ AC-S2 in tags.test.ts |

### DB Changes

- Migration: `{migration_name}`
- Changes: {describe additive changes only}

### Test Coverage

- New files coverage: {X}%
- Overall coverage: {X}%

### Reviewer Findings

{paste reviewer output or "No issues found"}
```

---

## Step 4 — Commit and push

Generate commit message:

```
feat(tags): implement tag CRUD and note association AB#1003
```

Ask [y/n] before:
- `git commit`
- `git push`

Commit format: `feat(scope): description AB#ticket`

---

## Step 5 — Archive (Rule 18 — required before PR)

Move the spec before pushing:

```bash
mv openspec/changes/$ARGUMENTS openspec/archive/$ARGUMENTS
```

Then stage and commit the move:

```bash
git add openspec/changes/$ARGUMENTS openspec/archive/$ARGUMENTS
git commit -m "chore(openspec): archive $ARGUMENTS spec after implementation"
```

Ask [y/n] before this move. Do NOT raise the PR until the archive commit is pushed.
