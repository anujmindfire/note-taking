Create implementation plan for: $ARGUMENTS

Read:

1. openspec proposal
2. spec delta
3. docs/SDS.md
4. AGENTS.md
5. relevant domain CLAUDE.md files

Then generate:

- exact files to create/modify
- shared contracts required
- DB changes
- API contracts
- frontend/backend responsibilities
- reusable patterns from existing code
- testing strategy
- migration considerations
- risks and assumptions

Rules:

- Prefer reuse over abstraction
- Follow existing architecture strictly
- Avoid introducing new patterns
- Keep plan deterministic and minimal

Save to:
openspec/changes/$ARGUMENTS/plan.md

Wait for approval before implementation.
