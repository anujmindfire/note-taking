# Spec Delta — textAB-1001 Project Setup

**Type:** ADDED (new project, no prior state)  
**Scope:** Infrastructure only — no API endpoints, no DB migrations

---

## Scenario Table

| ID | Scenario | Given | When | Then | AC |
| :--- | :--- | :--- | :--- | :--- | :--- |
| S1 | Dependency install | Clean clone of repo | `pnpm install` runs | All dependencies resolve, no errors | AC-1 |
| S2 | Full build passes | Dependencies installed | `pnpm build` runs | 0 TypeScript errors, 0 warnings across all packages | AC-2 |
| S3 | Lint clean | Dependencies installed | `pnpm lint` runs | `tsc --noEmit` passes in shared, backend, frontend | AC-3 |
| S4 | Shared types compile | `packages/shared/src/` has types | `pnpm build` in shared | `dist/index.js` + `dist/index.d.ts` emitted correctly | AC-2 |
| S5 | Backend imports shared | `apps/backend` imports `@noteapp/shared` | `tsc --noEmit` in backend | No unresolved module errors | AC-2 |
| S6 | Frontend imports shared | `apps/frontend` imports `@noteapp/shared` | `tsc --noEmit` in frontend | No unresolved module errors | AC-2 |
| S7 | Prisma schema valid | `prisma/schema.prisma` exists | `prisma validate` | Schema passes validation — all 5 models correct | AC-2 |
| S8 | Slash commands present | Repo is cloned | `ls .claude/commands/` | 7 files: start, spec, plan, tasks, implement, review, pr | AC-5 |
| S9 | Sub-agents present | Repo is cloned | `ls .claude/agents/` | 2 files: reviewer, test-writer | AC-6 |
| S10 | PM tickets present | Repo is cloned | `ls docs/tickets/` | 4 files: AB-1001 through AB-1004 | AC-7 |
| S11 | OpenSpec context present | Repo is cloned | `cat openspec/project.md` | File exists and is populated with FRS + SDS context | AC-4 |

---

## File Manifest (ADDED)

### Root
- `pnpm-workspace.yaml`
- `package.json`
- `turbo.json`
- `tsconfig.base.json`

### packages/shared
- `package.json`
- `tsconfig.json`
- `src/index.ts`
- `src/errors.ts`
- `src/types/index.ts`
- `src/schemas/index.ts`
- `CLAUDE.md`

### apps/backend
- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `vitest.config.ts`
- `.env.example`
- `prisma/schema.prisma`
- `src/index.ts`
- `src/app.ts`
- `src/lib/prisma.ts`
- `src/utils/token.ts`
- `src/middleware/errorHandler.ts`
- `src/middleware/auth.ts`
- `src/middleware/validate.ts`
- `CLAUDE.md`

### apps/frontend
- `package.json`
- `tsconfig.json`
- `tsconfig.node.json`
- `vite.config.ts`
- `index.html`
- `src/main.tsx`
- `src/App.tsx`
- `src/lib/api.ts`
- `src/stores/authStore.ts`
- `CLAUDE.md`

### AI toolchain
- `.claude/commands/start.md`
- `.claude/commands/spec.md`
- `.claude/commands/plan.md`
- `.claude/commands/tasks.md`
- `.claude/commands/implement.md`
- `.claude/commands/review.md`
- `.claude/commands/pr.md`
- `.claude/agents/reviewer.md`
- `.claude/agents/test-writer.md`

### Docs
- `openspec/project.md`
- `docs/tickets/AB-1001-auth.md`
- `docs/tickets/AB-1002-notes.md`
- `docs/tickets/AB-1003-soft-delete.md`
- `docs/tickets/AB-1004-tags.md`

---

## No API Changes
No endpoints added. No DB migrations. No shared schema changes.
