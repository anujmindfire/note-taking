Create a specification file for: $ARGUMENTS

`$ARGUMENTS` must be in the format `AB-XXXX-short-name` matching the branch naming convention
(e.g. `AB-1018-tag-colors`). All output files go in `openspec/changes/$ARGUMENTS/`.

---

## Step 1 — Read context

Read these files before doing anything:

1. `CLAUDE.md` — project-wide rules, permission model, quality gates
2. `AGENTS.md` — architecture rules, error codes, API contracts, naming conventions
3. Domain CLAUDE.md — read the one matching the ticket layer:
   - Frontend ticket → `apps/frontend/CLAUDE.md`
   - Backend ticket → `apps/backend/CLAUDE.md`
   - Full-stack → read both
4. `docs/FRS.md` — functional requirements
5. `docs/SDS.md` — system design spec
6. `docs/tickets/$ARGUMENTS.md` — the ticket definition (if it exists)
7. `openspec/project.md` — project-level decisions
8. Any existing files in `openspec/changes/$ARGUMENTS/` to avoid duplication

Scan the current implementation to understand what already exists:
- `apps/backend/src/routes/`
- `apps/backend/src/services/`
- `apps/backend/src/repositories/`
- `packages/shared/src/`

---

## Step 2 — Ask clarifying questions

Ask the user a minimum of 3 and maximum of 8 targeted questions about:

- Edge cases not covered by the FRS (e.g. what happens when X and Y collide)
- Ownership and authorization boundaries (who can do what)
- Idempotency expectations for write operations
- Cascade behavior for deletes
- Any field constraints not explicit in the ticket
- Error precedence when multiple validations fail
- Whether soft-deleted resources should be visible in related queries

Do NOT ask about things already specified in FRS or SDS.
Wait for the user's answers before generating the spec.

---

## Step 3 — Generate spec.md

After receiving answers, create:

`openspec/changes/$ARGUMENTS/spec.md`

Use this exact format:

```markdown
# Spec — {TICKET_ID}: {Feature Name}

**Status:** Draft — awaiting approval
**Ticket:** {TICKET_ID}
**Branch:** feature/backend/{TICKET_ID}-{short-name}
**FRS References:** {e.g. §4.2.1, §4.2.2}
**SDS References:** {e.g. §6.3}
**Layer:** {Backend only | Frontend only | Full-stack}
**Depends on:** {prior ticket or "none"}

---

## Summary

One paragraph describing what this feature does and why it exists.

---

## In Scope

- Bullet list of what this spec covers

## Out of Scope

- Bullet list of what is explicitly excluded

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | ... | User answer / FRS §X |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Happy path | ... | ... | HTTP 200 `{ data: {...} }` | §X AC1 | — |
| S2 | Not found | ... | ... | HTTP 404 `NOT_FOUND` | §X AC2 | TAG_NOT_FOUND |
| ... | | | | | | |

Rules for the scenario table:
- Every FRS acceptance criterion must map to at least one scenario row
- Every edge case from clarifying questions must have its own row
- Error scenarios must include the exact error code string from AGENTS.md §10
- Success scenarios must include exact HTTP status and response shape

---

## API Contract

For each new or modified endpoint:

### {METHOD} /api/{path}

**Auth required:** Yes / No
**Request body:**
```json
{
  "field": "type — description"
}
```
**Success response:** HTTP {status}
```json
{ "data": { ... } }
```
**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | ... |
| 404 | `TAG_NOT_FOUND` | ... |

---

## Database Changes

List every Prisma schema change:

- New models (with all fields)
- New columns on existing models
- New relations
- New unique constraints
- Migration notes (additive only? breaking?)

---

## Shared Package Changes

List every addition to `packages/shared/`:

- New interfaces in `src/types/`
- New Zod schemas in `src/schemas/`
- New error codes in `src/errors.ts`

---

## Architecture Notes

Any decisions that deviate from or extend the standard three-layer pattern. Keep this empty if nothing is unusual.
```

---

## Rules

- Do NOT implement any code
- Do NOT generate a proposal.md — only spec.md
- Do NOT copy sections verbatim from FRS/SDS — synthesize and be specific to this ticket
- All error codes must come from AGENTS.md §10 (or define new ones explicitly)
- All response shapes must match AGENTS.md §6 and §7 contracts exactly
- Wait for the user to approve the spec before any implementation begins

---

## Step 4 — Validate with reviewer subagent

After generating spec.md, spawn the `reviewer` subagent (`Agent` tool with `subagent_type: "reviewer"`) to check:

- Every scenario has a unique ID and a FRS AC reference
- All error codes appear in AGENTS.md §10 or are explicitly defined as new
- API contracts match §6 (`{ data: {...} }`) and §7 (`{ error: {...} }`) shapes exactly
- Every FRS acceptance criterion for this ticket maps to ≥ 1 scenario row
- No "Out of Scope" item appears as a scenario row

Incorporate any gaps into spec.md before presenting to the user for approval.
