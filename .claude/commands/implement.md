Implement: $ARGUMENTS

Before coding, read:

1. AGENTS.md
2. CLAUDE.md
3. docs/FRS.md
4. docs/SDS.md
5. proposal.md
6. plan.md
7. tasks.md

Execution Rules:

- Follow tasks sequentially
- Prefer minimal localized diffs
- Reuse existing patterns
- Do not invent architecture
- Keep controllers thin
- Shared contracts belong in @repo/shared
- Write tests alongside implementation
- Never skip failing tests

Permission Rules:

Ask before:

- migrations
- dependency changes
- deleting files
- root config edits
- destructive actions

Proceed automatically for:

- feature files
- tests
- services
- components
- DTOs
- hooks

Quality Gates after each phase:

1. pnpm build
2. pnpm lint
3. pnpm test

Stop immediately on failure.

At completion provide:

## Files Changed

## Spec Scenarios Covered

## Tests Added

## Assumptions

## Follow-up Tasks

When complete:

- archive openspec change
- update specs if needed
