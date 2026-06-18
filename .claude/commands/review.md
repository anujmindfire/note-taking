Review implementation for: $ARGUMENTS

> **Subagent type:** This command runs as the `reviewer` subagent (`subagent_type: "reviewer"`)
> when delegated from `/implement`. Invoke it via the Agent tool so it gets the read-only
> reviewer system prompt and cannot modify implementation files.

---

## Step 1 — Read context

1. `CLAUDE.md` — project-wide rules, permission model, quality gates
2. `AGENTS.md` — architecture rules, error codes, response contracts
3. Domain CLAUDE.md matching the ticket layer:
   - Frontend → `apps/frontend/CLAUDE.md`
   - Backend → `apps/backend/CLAUDE.md`
4. `openspec/changes/$ARGUMENTS/spec.md` OR `openspec/archive/$ARGUMENTS/spec.md`
5. `openspec/changes/$ARGUMENTS/plan.md` OR `openspec/archive/$ARGUMENTS/plan.md`
6. Run `git diff main...HEAD` to see the full implementation diff

Then read each changed file in full — do not rely only on the diff.

---

## Step 2 — Review checklist

Work through every item. Report findings using the output format below.

### Spec compliance

For each scenario row (S1, S2, ...) in spec.md:
- [ ] Does a test exist named `AC-{ID}: {scenario name}`?
- [ ] Does the test assert the correct HTTP status code?
- [ ] Does the test assert `res.body.error.code` (not just status) for error cases?
- [ ] Does the scenario's happy path assert the full response shape, not just 200?

### API contract

For each endpoint in the spec:
- [ ] Correct HTTP method and path?
- [ ] Auth guard applied when spec says "Auth required: Yes"?
- [ ] Request body validated with Zod before the service call?
- [ ] Success response shape matches `{ data: {...} }` or `{ data: [...] }` contract?
- [ ] Correct HTTP status (201 for creates, 200 for reads/updates, 204 for deletes)?

### Architecture — three-layer rule

For each route file:
- [ ] No `prisma.*` imports
- [ ] No business logic (no if/else on domain conditions)
- [ ] Calls service method and returns response only

For each service file:
- [ ] No `prisma.*` imports
- [ ] No `req` or `res` objects
- [ ] No Express types imported
- [ ] Business rules enforced before calling repositories

For each repository file:
- [ ] All Prisma queries are here and only here
- [ ] Returns domain types, not raw Prisma results
- [ ] No business logic (pure data access)

### Shared package rule

- [ ] All TypeScript interfaces defined in `packages/shared/src/types/`
- [ ] All Zod schemas defined in `packages/shared/src/schemas/`
- [ ] All error code strings defined in `packages/shared/src/errors.ts`
- [ ] No duplicate type definitions in `apps/backend/` or `apps/frontend/`
- [ ] All imports use `@noteapp/shared`

### Error handling

For each error scenario in the spec:
- [ ] Service throws with the exact error code from AGENTS.md §10
- [ ] Error handler converts it to `{ error: { code, message, fields? } }` shape
- [ ] No stack traces exposed in error responses
- [ ] `fields` array present on `VALIDATION_ERROR` responses

### Security

- [ ] No hardcoded JWT secret — uses `process.env.JWT_SECRET`
- [ ] Auth middleware applied to all protected routes
- [ ] User can only access/modify their own resources (user ID from JWT, not request body)
- [ ] No user enumeration in login errors (same message for wrong email vs wrong password)
- [ ] Passwords not logged or returned in any response

### Database

- [ ] Migration is additive only (no dropping columns or tables)? If breaking, flag it.
- [ ] Cascade delete rules match the spec
- [ ] Unique constraints match the spec
- [ ] No N+1 queries (relations loaded with `include`, not nested loops)

### TypeScript

- [ ] No `any` types
- [ ] No non-null assertions (`!`) without a comment explaining why
- [ ] Strict mode compatible — no implicit any or undefined

---

## Step 3 — Output

Use ONLY this format. No prose. No suggestions. Compliance findings only.

```
✅ PASSED: [S1] Valid registration — test exists, status 201, response shape correct
✅ PASSED: [S2] Duplicate email — EMAIL_TAKEN asserted in test
❌ MISSING: [S5] Password too short — no test found for this scenario
⚠️  DRIFTED: [S8] Route handler contains business logic (email lowercase) — should be in service
🔒 SECURITY: Auth guard missing on DELETE /api/tags/:id
📋 FRS GAP: §4.2.3 AC3 — cascade delete on NoteTag not verified in any test
```

Rules:
- No style feedback
- No refactor suggestions
- No "consider doing X"
- Compliance and correctness only
- Every spec scenario must appear in the output (either ✅ or ❌)
