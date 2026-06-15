# JotDown — OpenSpec Project Context

**Project Code:** textAB  
**Platform:** Web-based note-taking application  
**Tutorial Focus:** Spec-driven development workflow (AB-1001 → AB-1004)

---

## 1. Product Summary

JotDown is a secure, lightweight web workspace where authenticated users capture thoughts, organise knowledge with tags, search contextually, and share documents via public links. It features version snapshotting, tagging, and full-text search.

**Currently built scope (AB-1001–AB-1004):** Auth, Notes CRUD, Tags.  
**FRS full scope (future):** Search, Share links, Version history, Password reset.

---

## 2. Tech Stack

| Layer      | Technology                                   | Notes                  |
| :--------- | :------------------------------------------- | :--------------------- |
| Frontend   | React 19 + TypeScript + Vite 5               | SPA, strict mode       |
| State      | Zustand (UI) + TanStack Query v5 (server)    | No Redux               |
| UI         | shadcn/ui + Tailwind CSS                     | Radix primitives       |
| Backend    | Node.js 22 + Express 5 + TypeScript          | strict: true           |
| ORM        | Prisma 5                                     | PostgreSQL 16          |
| Auth       | JWT HS256 (15m access / 7d refresh) + bcrypt | Tokens in DB           |
| Validation | Zod — schemas live in packages/shared only   |                        |
| Testing    | Vitest + Supertest                           | ≥80% coverage required |
| Monorepo   | pnpm workspaces (pnpm 9)                     |                        |

---

## 3. Repository Layout

```
noteapp/
├── apps/
│   ├── frontend/        React 19 SPA
│   │   └── src/
│   │       ├── components/
│   │       ├── pages/
│   │       ├── hooks/       TanStack Query hooks
│   │       ├── stores/      Zustand auth state
│   │       └── lib/         API client + utils
│   └── backend/         Express 5 API
│       ├── src/
│       │   ├── routes/      thin handlers — no logic
│       │   ├── services/    business rules — no Prisma
│       │   ├── repositories/ all Prisma queries
│       │   ├── middleware/  auth guard, error handler, validation
│       │   └── utils/       token helpers
│       └── prisma/          schema + migrations
├── packages/
│   └── shared/          ONLY place for types, Zod schemas, error codes
│       └── src/
│           ├── types/
│           ├── schemas/
│           └── errors.ts
├── docs/                FRS-NoteApp.md + SDS-NoteApp.md
└── openspec/            specs/ changes/ archive/ project.md
```

---

## 4. Architectural Constraints

### Three-layer rule — no exceptions

```
Route Handler  → parse, validate (Zod), call service, send response
Service        → business rules, orchestration (no req/res, no Prisma)
Repository     → ALL Prisma queries; returns domain types (not raw Prisma)
```

### Shared package rule

`packages/shared` is the **only** place for TypeScript interfaces, Zod schemas, and error code constants. Import via `@noteapp/shared`. Never duplicate in frontend or backend.

### Response contracts

- Success: `{ data: resource }` or `{ data: [...] }` or 204 no body
- Error: `{ error: { code, message, fields? } }` — always `code` is SCREAMING_SNAKE_CASE

---

## 5. API Surface (built so far)

| Method | Path                                            | Auth    | Success                                   |
| :----- | :---------------------------------------------- | :------ | :---------------------------------------- |
| POST   | `/api/auth/register`                            | No      | 201 `{ userId }`                          |
| POST   | `/api/auth/login`                               | No      | 200 `{ accessToken, refreshToken, user }` |
| POST   | `/api/auth/logout`                              | Yes     | 204                                       |
| POST   | `/api/auth/refresh`                             | No      | 200 `{ accessToken }`                     |
| POST   | `/api/auth/forgot-password`                     | No      | 200 `{ message }`                         |
| POST   | `/api/auth/reset-password`                      | No      | 200 `{ message }`                         |
| GET    | `/api/notes`                                    | Yes     | 200 `[...notes]` + pagination meta        |
| POST   | `/api/notes`                                    | Yes     | 201 note                                  |
| GET    | `/api/notes/:id`                                | Yes     | 200 note                                  |
| PATCH  | `/api/notes/:id`                                | Yes     | 200 note                                  |
| DELETE | `/api/notes/:id`                                | Yes     | 204 (soft-delete)                         |
| GET    | `/api/tags`                                     | Yes     | 200 `[...tags]`                           |
| POST   | `/api/tags`                                     | Yes     | 201 `{ id, name }`                        |
| PATCH  | `/api/tags/:id`                                 | Yes     | 200 tag                                   |
| DELETE | `/api/tags/:id`                                 | Yes     | 204                                       |
| POST   | `/api/notes/:id/tags/:tagId`                    | Yes     | 200 note with tags                        |
| DELETE | `/api/notes/:id/tags/:tagId`                    | Yes     | 200 note with tags                        |
| GET    | `/api/search`                                   | Yes     | 200 `[...notes with highlight]` + meta    |
| POST   | `/api/notes/:id/shares`                         | Yes     | 201 share link                            |
| GET    | `/api/notes/:id/shares`                         | Yes     | 200 `[...share links]`                    |
| POST   | `/api/shares/:shareId/revoke`                   | Yes     | 200 share link                            |
| GET    | `/api/share/:token`                             | No      | 200 note (public read-only)               |
| GET    | `/api/notes/:id/versions`                       | Yes     | 200 `[...versions]`                       |
| GET    | `/api/notes/:id/versions/:versionId`            | Yes     | 200 version                               |
| POST   | `/api/notes/:id/versions/:versionId/restore`    | Yes     | 200 note                                  |

---

## 6. Database Schema (current)

Core models: `User`, `Note` (soft-delete via `deletedAt`), `Tag` (`normalizedName` for case-insensitive uniqueness), `NoteTag` (join table, cascade delete), `RefreshToken`, `OtpToken`, `SharedLink`, `NoteVersion`.

Key constraints:

- `Tag` has `@@unique([userId, normalizedName])` — case-insensitive duplicate prevention
- `NoteTag` cascade-deletes when Tag is deleted
- `Note` soft-deleted via `deletedAt`; never physically deleted in CRUD flows
- `SharedLink` has unique `token`; cascade-deletes when Note is deleted
- `NoteVersion` has `@@unique([noteId, version])`; cascade-deletes when Note is deleted; auto-purged by background scheduler per retention policy

---

## 7. Error Codes

All in `packages/shared/src/errors.ts`:

| Code                  | HTTP | When                                       |
| :-------------------- | :--- | :----------------------------------------- |
| `EMAIL_TAKEN`         | 422  | Duplicate registration                     |
| `INVALID_CREDENTIALS` | 401  | Wrong email/password                       |
| `TOKEN_EXPIRED`       | 401  | Access token expired                       |
| `REFRESH_EXPIRED`     | 401  | Refresh token expired                      |
| `REFRESH_INVALID`     | 401  | Refresh token not in DB                    |
| `UNAUTHORIZED`        | 401  | Missing/invalid Authorization header       |
| `NOTE_NOT_FOUND`      | 404  | Note not found or wrong owner              |
| `TAG_NOT_FOUND`       | 404  | Tag not found or wrong owner               |
| `TAG_NAME_TAKEN`      | 422  | Duplicate tag name for same user           |
| `VALIDATION_ERROR`    | 400  | Zod validation failure (includes `fields`) |
| `OTP_EXPIRED`         | 410  | Password reset OTP past 10-min expiry      |
| `OTP_INVALID`         | 400  | Password reset OTP hash mismatch           |
| `SHARE_NOT_FOUND`     | 404  | Share link not found or wrong owner        |
| `SHARE_REVOKED`       | 403  | Share link has been revoked                |
| `SHARE_EXPIRED`       | 410  | Share link expired or note soft-deleted    |
| `VERSION_NOT_FOUND`   | 404  | Version not found or doesn't belong to note |

---

## 8. Team Conventions

### Naming

| Pattern          | Convention                  | Example             |
| :--------------- | :-------------------------- | :------------------ |
| TS interfaces    | PascalCase + `I` prefix     | `INoteResponse`     |
| Zod schemas      | camelCase + `Schema` suffix | `createNoteSchema`  |
| Service files    | PascalCase + `Service`      | `NoteService.ts`    |
| Repository files | PascalCase + `Repository`   | `NoteRepository.ts` |
| React components | PascalCase                  | `NoteCard.tsx`      |
| Custom hooks     | camelCase + `use` prefix    | `useNotes.ts`       |
| Error codes      | SCREAMING_SNAKE_CASE        | `NOTE_NOT_FOUND`    |

### TypeScript

- `strict: true` everywhere
- Zero `any` types
- No non-null assertions (`!`) without comment

### Commit format

```
feat(scope): description AB#ticket
fix(scope): description AB#ticket
```

### Branch naming

```
feature/backend/AB-xxxx-short-name
feature/frontend/AB-xxxx-short-name
```

---

## 9. Quality Gates (must all pass before PR)

```bash
pnpm build              # 0 errors, 0 warnings
pnpm lint --max-warnings 0
pnpm test               # all green
pnpm test --coverage    # ≥80% coverage
```

---

## 10. Testing Standards

- File layout: `apps/backend/src/__tests__/unit/services/` and `integration/routes/`
- One test per AC row, named `AC-{id}: {scenario name}`
- Integration tests use `TEST_DATABASE_URL` (separate DB)
- Always assert error code string: `expect(res.body.error.code).toBe("EMAIL_TAKEN")`
- Cover: happy path + every error path + boundary values

---

## 11. Ticket Sequence

| Ticket  | Feature                                                      | Status  |
| :------ | :----------------------------------------------------------- | :------ |
| AB-1001 | Auth (register, login, logout, refresh)                      | ✅ Done |
| AB-1002 | Notes CRUD                                                   | ✅ Done |
| AB-1003 | Notes soft-delete + list filtering                           | ✅ Done |
| AB-1004 | Tags (create, list, delete, attach, detach)                  | ✅ Done |
| AB-1005 | Notes pagination, sorting, filtering                         | ✅ Done |
| AB-1006 | Tags CRUD + note count                                       | ✅ Done |
| AB-1007 | Search — full-text with highlight + pagination               | ✅ Done |
| AB-1008 | Sharing — generate link, revoke, public access, view count   | ✅ Done |
| AB-1009 | Version history — snapshot, list, view, restore, auto-purge  | ✅ Done |
