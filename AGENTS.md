# AGENTS.md

Read this first. Every session. No exceptions.

---

## 1. Project Overview

Web-based note-taking app where authenticated users create, organise, and manage personal notes with optional tags. Built as a spec-driven development tutorial; every ticket traces to FRS-NoteApp and SDS-NoteApp.

---

## 2. Repository Structure

```
noteapp/
├── apps/
│   ├── frontend/          Vite + React 19 SPA
│   │   └── src/
│   │       ├── components/  reusable UI components
│   │       ├── pages/       route-level page components
│   │       ├── hooks/       TanStack Query hooks
│   │       ├── stores/      Zustand auth state
│   │       └── lib/         API client + utils
│   └── backend/           Express 5 + TypeScript API
│       ├── src/
│       │   ├── routes/      thin route handlers (no logic)
│       │   ├── services/    business rules (no Prisma)
│       │   ├── repositories/ all Prisma queries
│       │   ├── middleware/  auth guard, error handler, validation
│       │   └── utils/       token helpers
│       └── prisma/          schema + migrations
├── packages/
│   └── shared/            ALL shared types, Zod schemas, error codes
│       └── src/
│           ├── types/       TypeScript interfaces
│           └── schemas/     Zod validation schemas
├── docs/                  FRS-NoteApp.md + SDS-NoteApp.md
├── openspec/              spec snapshots (archive, changes, specs)
└── .claude/               agents + slash commands
```

---

## 3. Tech Stack

| Layer                | Technology                     | Version               |
| -------------------- | ------------------------------ | --------------------- |
| Frontend             | React + TypeScript + Vite      | React 19, Vite 5      |
| State / Server State | TanStack Query + Zustand       | TanStack Query v5     |
| UI Components        | shadcn/ui + Tailwind CSS       | Latest                |
| Backend              | Node.js + Express + TypeScript | Node 22, Express 5    |
| Database             | PostgreSQL + Prisma ORM        | Postgres 16, Prisma 5 |
| Auth                 | JWT HS256 + bcrypt             | jsonwebtoken, bcrypt  |
| Testing              | Vitest + Supertest             | Latest                |
| Monorepo             | pnpm workspaces                | pnpm 9                |

---

## 4. Key Commands

```bash
pnpm install                        # install all workspaces
pnpm dev                            # start frontend + backend
pnpm build                          # compile all (must 0 errors)
pnpm test                           # run all tests
pnpm test --coverage                # coverage (≥80% required)
pnpm lint --max-warnings 0          # lint (0 warnings required)
pnpm format                         # prettier write
pnpm --filter backend prisma migrate dev   # run migrations
pnpm --filter backend prisma migrate reset # reset test DB
```

---

## 5. Architecture Rules

**Three-layer rule — no exceptions:**

```
Request
  ↓
Route Handler   → parse req, validate with Zod, call service, send response
  ↓               NO business logic. NO DB calls.
Service         → business rules, orchestration
  ↓               NO req/res objects. NO Prisma calls.
Repository      → ALL Prisma queries; returns domain types
  ↓
Database
```

- Routes call services only
- Services call repositories only
- Repositories return domain types, not raw Prisma objects

---

## 6. Error Response Contract

Every error across the entire API MUST use this exact shape:

```json
{
  "error": {---
  Tutorial Closing Script — Spec-Driven Development with Claude Code

  ---
  Opening

  "Alright, let's wrap up this tutorial by walking through everything we've
  built and how it all fits together.

  What you've just seen is spec-driven development — a workflow where every line
  of code traces back to a requirement, and nothing gets written until the
  design is agreed on. Let me walk you through each piece."

  ---
  The Project

  "We built a note-taking API — a backend-only Express and TypeScript
  application where authenticated users can register, log in, create notes, and
  organise them with tags. It lives in a pnpm monorepo with a shared package for
  types and schemas, and a PostgreSQL database managed by Prisma.

  The app was built across four tickets — AB-1001 through AB-1004 — each one
  building on the last. We just finished AB-1004, which is the tags feature."

  ---
  The Slash Commands

  "Now, the interesting part is how we built it. We used four custom slash
  commands, and each one plays a specific role in the workflow.

  The first command is /spec.
  This is where everything starts. You give it a ticket number, and it reads the
  FRS — the Functional Requirements Specification — and the SDS — the Software
  Design Specification. It extracts the acceptance criteria for that ticket,
  asks you clarifying questions about edge cases, and then produces a spec.md
  file. That file becomes the contract. It defines exactly what the feature
  does, what the API looks like, what the database changes are, and every
  scenario that needs to be tested. Nothing gets built until this is approved.

  The second command is /plan.
  Once the spec is approved, /plan reads it and produces a plan.md file. This is
  the technical blueprint. It lists every file that needs to be created, every
  file that needs to be modified, the exact TypeScript interfaces, the database
  migration, and the architectural decisions — like which layer owns which
  responsibility, and why. It also defines checkpoints — build, lint, test —
  that must pass at the end of each phase before moving forward.

  The third command is /tasks.
  /tasks reads both the spec and the plan and produces a tasks.md file — a flat
  checkbox checklist. Every implementation task, and every single test scenario
  from the spec table, gets its own checkbox. This becomes the execution
  checklist. The implementer works through it phase by phase and ticks things
  off as they go.

  The fourth command is /implement.
  This is where the code actually gets written. It reads all three files — spec,
  plan, tasks — and works through the phases in order. It asks for confirmation
  before writing any file or running any migration, and it runs the full
  quality gate — build, lint, test — after every phase. If anything fails, it
  stops and fixes it before continuing. Tests are delegated to a specialised
  test-writer agent that only writes test files and never touches
  implementation."

  ---
  The Three Output Files

  "So for each ticket, you end up with three files in openspec/changes/AB-xxxx/:

  spec.md is the what — the agreed contract. It contains a summary, FRS
  references, what's in scope and out of scope, a full scenarios table with
  Given/When/Then for every acceptance criterion and edge case, the API request
  and response shapes, database changes, and assumptions.

  plan.md is the how — the technical blueprint. Files to create, files to
  modify, shared package additions, the migration, TypeScript interfaces,
  architectural decisions, and phased checkpoints.

  tasks.md is the checklist — one checkbox per task and one checkbox per test
  scenario. It's the execution tracker that takes you from zero to done."

  ---
  What the Reviewer Does

  "Now, before any of this gets pushed, there's one more layer — the /review
  command. The reviewer reads the spec, the plan, the tasks, and the actual code
  diff. It checks that every acceptance criterion in the spec has a
  corresponding test, that every test asserts the error code string and not just
  the HTTP status, that no business logic has leaked into route handlers, that
  no Prisma calls appear in services, and that the shared package is the only
  place where types and schemas are defined. It also checks for security issues
  — hardcoded secrets, missing auth guards, that sort of thing. If anything is
  out of spec, it flags it before the PR is raised."

  ---
  What AB-1004 Specifically Delivered

  "For this last ticket — tags — we shipped:

  A database migration that added a normalizedName column to the Tag table for
  case-insensitive uniqueness, and cascade delete on the NoteTag join table so
  deleting a tag automatically removes it from all notes.

  Five new API endpoints — list tags, create tag, delete tag, attach a tag to a
  note, and detach a tag from a note.

  A full three-layer implementation: TagRepository handling all Prisma queries,
  TagService handling business rules like duplicate name detection and ownership
  checks, and tagRoutes as a thin handler layer.

  And sixty tests — twenty-four unit tests and thirty-six integration tests —
  covering all twenty-three spec scenarios including idempotent attach and
  detach, cross-user isolation, soft-deleted note handling, and case-insensitive
  duplicate enforcement.

  Final coverage: ninety-four percent overall, a hundred percent on all new
  files."

  ---
  Closing

  "The key takeaway from this tutorial is that the spec-driven workflow forces
  you to answer hard questions before you write code. Edge cases like 'what
  happens if you attach a tag that's already attached' or 'whose tag wins in a
  cross-user scenario' — those get decided in the spec, documented in
  assumptions, and tested explicitly. There's no ambiguity left when the
  implementer starts.

  Every file in the codebase traces back to a requirement. Every test traces
  back to a scenario ID. And every scenario traces back to a line in the FRS.

  That's spec-driven development. Thanks for following along."

  ---
  Total speaking time: approximately 5–7 minutes at a moderate pace.


    "code": "SNAKE_CASE_CODE",
    "message": "Human readable description.",
    "fields": ["fieldName"]
  }
}
```

- `code` — machine-readable, from §10 error codes table
- `message` — human-readable, never exposes stack traces
- `fields` — optional array, only present on 400 validation errors

---

## 7. Success Response Contract

```json
// Single resource or action
{ "data": { ...resource } }

// Array / list
{ "data": [ ...items ] }

// Empty (204 No Content) — no body
```

---

## 8. Coding Standards

**TypeScript:**

- `strict: true` in all tsconfig files
- No `any` types anywhere
- No non-null assertions (`!`) without an explanatory comment

**Naming:**

| Pattern          | Convention                  | Example             |
| ---------------- | --------------------------- | ------------------- |
| TS interfaces    | PascalCase + `I` prefix     | `INoteResponse`     |
| Zod schemas      | camelCase + `Schema` suffix | `createNoteSchema`  |
| Service files    | PascalCase + `Service`      | `NoteService.ts`    |
| Repository files | PascalCase + `Repository`   | `NoteRepository.ts` |
| React components | PascalCase                  | `NoteCard.tsx`      |
| Custom hooks     | camelCase + `use` prefix    | `useNotes.ts`       |
| Error codes      | SCREAMING_SNAKE_CASE        | `NOTE_NOT_FOUND`    |

---

## 9. Shared Package Rule

`packages/shared` is the **only** place for:

- TypeScript interfaces (`src/types/`)
- Zod schemas (`src/schemas/`)
- Error code constants (`src/errors.ts`)

Always import from `@noteapp/shared`. Never duplicate in frontend or backend.

---

## 10. Error Codes

All strings live in `packages/shared/src/errors.ts`. HTTP status codes are final.

| Code                  | HTTP | When                                             |
| --------------------- | ---- | ------------------------------------------------ |
| `EMAIL_TAKEN`         | 422  | Registration with already-registered email       |
| `INVALID_CREDENTIALS` | 401  | Wrong email or password at login                 |
| `TOKEN_EXPIRED`       | 401  | Access token past 15-min expiry                  |
| `REFRESH_EXPIRED`     | 401  | Refresh token past 7-day expiry                  |
| `REFRESH_INVALID`     | 401  | Refresh token not in DB (logged out)             |
| `UNAUTHORIZED`        | 401  | Missing or invalid Authorization header          |
| `NOTE_NOT_FOUND`      | 404  | Note not found or belongs to another user        |
| `TAG_NOT_FOUND`       | 404  | Tag not found or belongs to another user         |
| `TAG_NAME_TAKEN`      | 422  | Duplicate tag name for same user                 |
| `VALIDATION_ERROR`    | 400  | Zod schema validation failed (includes `fields`) |

---

## 11. API Summary

| Method | Path                         | Auth | Success                                   |
| ------ | ---------------------------- | ---- | ----------------------------------------- |
| POST   | `/api/auth/register`         | No   | 201 `{ userId }`                          |
| POST   | `/api/auth/login`            | No   | 200 `{ accessToken, refreshToken, user }` |
| POST   | `/api/auth/logout`           | Yes  | 204                                       |
| POST   | `/api/auth/refresh`          | No   | 200 `{ accessToken }`                     |
| GET    | `/api/notes`                 | Yes  | 200 `[...notes]`                          |
| POST   | `/api/notes`                 | Yes  | 201 note object                           |
| GET    | `/api/notes/:id`             | Yes  | 200 note object                           |
| PATCH  | `/api/notes/:id`             | Yes  | 200 updated note                          |
| DELETE | `/api/notes/:id`             | Yes  | 204 (soft-delete)                         |
| GET    | `/api/tags`                  | Yes  | 200 `[...tags]`                           |
| POST   | `/api/tags`                  | Yes  | 201 `{ id, name }`                        |
| DELETE | `/api/tags/:id`              | Yes  | 204                                       |
| POST   | `/api/notes/:id/tags/:tagId` | Yes  | 200 note with tags                        |
| DELETE | `/api/notes/:id/tags/:tagId` | Yes  | 200 note with tags                        |

All endpoints prefixed `/api`. Protected endpoints require `Authorization: Bearer <accessToken>`.

---

## 12. Testing Approach

**File layout:**

```
apps/backend/src/__tests__/
  unit/services/        pure business logic, mocked repositories
  integration/routes/   Supertest + real test DB
```

**Rules:**

- One test per AC row — name format: `AC-{id}: {scenario name}`
- Integration tests use `TEST_DATABASE_URL` (separate DB)
- Reset DB between suites: `prisma migrate reset`
- Assert error code string, not just HTTP status:
  ```typescript
  expect(res.body.error.code).toBe("EMAIL_TAKEN");
  ```
- Cover: happy path + every error path + boundary values (max-length strings, empty strings, missing auth)

---

## 13. Do NOT Do

- **Direct Prisma in services** — services call repositories, never `prisma.*` directly
- **Types outside shared** — no interfaces or Zod schemas in `frontend/` or `backend/`
- **`any` types** — zero tolerance; TypeScript strict mode enforced
- **Business logic in routes** — routes call service and return response only
- **Raw Prisma objects returned from repositories** — map to domain types
- **Hardcoded JWT secret** — must come from env var
- **Skip quality gates** — all 5 gates must pass before raising a PR (build, lint, tests, coverage, spec review)
- **Skip or reorder tickets** — build AB-1001 → AB-1002 → AB-1003 → AB-1004 in sequence
