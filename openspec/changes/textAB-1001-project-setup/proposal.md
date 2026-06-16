# Proposal: textAB-1001 — Project Setup

**Status:** Draft  
**Created:** 2026-06-11  
**Author:** Dev / AI-assisted  
**FRS Reference:** §1 (Product Vision), §6 (Assumptions & Infrastructure)  
**SDS Reference:** §1.1 (Architectural Topology), §2 (Workspace & Monorepo Structure)

---

## Summary

Initialize the Note monorepo development infrastructure. This is a foundational, non-feature ticket that establishes the repository structure, shared type contracts, backend and frontend scaffolding, AI development toolchain, and quality gates that all subsequent feature tickets depend on.

No user-facing functionality is delivered. Acceptance is verified by `pnpm install && pnpm build` completing with zero errors and zero warnings.

---

## In Scope

| Area              | Deliverable                                                                      |
| :---------------- | :------------------------------------------------------------------------------- |
| Monorepo          | `pnpm-workspace.yaml`, root `package.json`, `turbo.json`, `tsconfig.base.json`   |
| Shared package    | `packages/shared` — Zod schemas, TypeScript interfaces, error codes              |
| Backend scaffold  | `apps/backend` — Express 5 app, middleware stubs, Prisma schema, vitest config   |
| Frontend scaffold | `apps/frontend` — Vite + React 19 app, API client, auth store, router stub       |
| Domain CLAUDE.md  | `apps/backend/CLAUDE.md`, `apps/frontend/CLAUDE.md`, `packages/shared/CLAUDE.md` |
| AI toolchain      | `.claude/commands/` (7 slash commands), `.claude/agents/` (2 sub-agents)         |
| PM tickets        | `docs/tickets/` — AB-1001 through AB-1004 ticket definitions                     |
| Docs              | `openspec/project.md` populated from FRS + SDS                                   |

---

## Out of Scope

- Prisma database migration (deferred to AB-1001-auth)
- Any feature implementation
- Frontend UI pages (deferred to feature tickets)
- CI/CD pipeline
- Docker / deployment config
- External MCP server connections

---

## FRS Alignment

| FRS Section                                  | How addressed                                                   |
| :------------------------------------------- | :-------------------------------------------------------------- |
| §6.1 Client Software — modern HTML5 browsers | Vite + React 19 SPA confirmed                                   |
| §6.2 Storage — PostgreSQL                    | Prisma 5 + PostgreSQL 16 configured in schema                   |
| §6.4 Single-region topology                  | Single backend process, no distributed config                   |
| §5.4.1 Test alignment                        | Vitest + Supertest installed, coverage threshold 80% configured |
| §5.4.2 Coverage minimums                     | `vitest.config.ts` thresholds set to 80%                        |

---

## SDS Alignment

| SDS Decision                        | Implementation                                                                                  |
| :---------------------------------- | :---------------------------------------------------------------------------------------------- |
| §1.2 React 19 + TypeScript + Vite 5 | ✅ `apps/frontend`                                                                              |
| §1.2 Zustand (UI state)             | ✅ `authStore.ts` uses zustand with persist                                                     |
| §1.2 TanStack Query v5              | ✅ `App.tsx` QueryClientProvider                                                                |
| §1.2 Node.js 22 + Express 5         | ✅ `apps/backend/package.json`                                                                  |
| §1.2 Prisma 5 + PostgreSQL 16       | ✅ `prisma/schema.prisma`                                                                       |
| §1.2 Zod validation                 | ✅ `packages/shared/src/schemas/`                                                               |
| §2 Workspace structure              | ✅ pnpm workspaces — `apps/*` + `packages/*`                                                    |
| Path convention                     | AGENTS.md canonical: `apps/frontend/`, `apps/backend/` (overrides SDS `apps/web/`, `apps/api/`) |

---

## Architecture Decisions

**1. Path convention follows AGENTS.md, not SDS §2**  
AGENTS.md is the runtime authority for this repo. SDS uses `apps/web/` and `apps/api/`, but AGENTS.md (generated from FRS+SDS+codebase context) uses `apps/frontend/` and `apps/backend/`. The latter is more semantically explicit and is locked in here.

**2. shared package uses `NodeNext` module resolution**  
Both frontend (via Vite alias) and backend (via tsconfig paths) resolve `@noteapp/shared` from source during development, bypassing the need to build shared before developing.

**3. Prisma schema includes all 5 models from the start**  
All models needed for AB-1001 through AB-1004 (`User`, `Note`, `Tag`, `NoteTag`, `RefreshToken`) are in the schema. Migrations run per-ticket as features land, but schema drift is eliminated.

**4. openspec CLI is not installed — manual spec management**  
`openspec init` / `openspec proposal` commands referenced in slash commands are not available in this environment. The workflow adapts: spec/plan/tasks files are created manually following the same structure.

---

## Assumptions

1. PostgreSQL 16 is running locally (or via Docker) at the URL in `.env.example`.
2. Node.js 22 and pnpm 9 are installed on the developer's machine.
3. Each developer copies `.env.example` to `.env` and fills in local values.
4. The shared package is resolved from source (not from `dist/`) during dev and test runs.

---

## Acceptance Criteria

1. `pnpm install` completes with no errors from repo root.
2. `pnpm build` completes with 0 TypeScript errors, 0 warnings.
3. `pnpm lint` (tsc --noEmit) passes in all three packages.
4. `openspec/project.md` is populated and matches FRS + SDS context.
5. All 7 slash commands exist under `.claude/commands/`.
6. Both sub-agents exist under `.claude/agents/`.
7. All 4 PM ticket files exist under `docs/tickets/`.
