# Tasks: AB-1002 — Authentication API

**Status:** Draft — awaiting human approval
**Created:** 2026-06-11
**Spec:** `openspec/changes/AB-1002-auth/specs/auth/spec.md`
**Plan:** `openspec/changes/AB-1002-auth/plan.md`
**Branch:** `feature/backend/AB-1002-auth`
**Layer:** Backend only (no Phase 3 — no frontend changes)

---

## Pre-flight

- [ ] Create and switch to branch: `git checkout -b feature/backend/AB-1002-auth`
- [ ] Verify `uuid` is in `apps/backend/package.json` dependencies; add if missing: `pnpm --filter backend add uuid@9.0.1 && pnpm --filter backend add -D @types/uuid@9.0.8`
- [ ] Verify `@types/bcrypt` is in `apps/backend/package.json` devDependencies; add if missing
- [ ] Verify `@types/supertest` is in `apps/backend/package.json` devDependencies; add if missing
- [ ] Confirm `TEST_DATABASE_URL` is set in `.env.test` (separate DB from `DATABASE_URL`)
- [ ] Confirm `JWT_SECRET` is set in `.env` (and `JWT_SECRET=test_secret_for_tests` in `.env.test`)

---

## Phase 1 — Shared Package + Migration

### 1.1 Shared Package Addition

- [ ] In `packages/shared/src/schemas/index.ts`, add at the bottom:
  `export type TRefreshInput = z.infer<typeof refreshSchema>;`
- [ ] Run `pnpm build` in `packages/shared` — confirm 0 errors

### 1.2 Prisma Migration

- [ ] Run: `pnpm --filter backend prisma migrate dev --name init`
- [ ] Confirm `apps/backend/prisma/migrations/<timestamp>_init/migration.sql` is created
- [ ] Confirm Prisma Client is regenerated (check output for "Generated Prisma Client")

### 1.3 Phase 1 Checkpoint

- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0` — 0 warnings

---

## Phase 2 — Backend Implementation

### 2.1 Repositories [PARALLEL]

Both repositories are independent — create in any order (or simultaneously with `/parallel`).

#### UserRepository

- [ ] Create `apps/backend/src/repositories/UserRepository.ts`
- [ ] Define internal `IUserRecord` interface: `{ id, email, passwordHash, createdAt: Date }`
- [ ] Implement `findByEmail(email: string): Promise<IUserRecord | null>` — query by `email` column
- [ ] Implement `findById(id: string): Promise<IUserRecord | null>` — needed by refresh token rotation
- [ ] Implement `create(data: { email: string; passwordHash: string }): Promise<IUserRecord>` — returns `{ id, email, passwordHash, createdAt }` only (no updatedAt)
- [ ] All methods return plain typed objects — never raw Prisma types

#### RefreshTokenRepository [PARALLEL]

- [ ] Create `apps/backend/src/repositories/RefreshTokenRepository.ts`
- [ ] Define internal `IRefreshTokenRecord` interface: `{ id, userId, token, expiresAt: Date, revokedAt: Date | null, createdAt: Date }`
- [ ] Implement `create(data: { userId: string; token: string; expiresAt: Date }): Promise<IRefreshTokenRecord>`
- [ ] Implement `findByToken(token: string): Promise<IRefreshTokenRecord | null>` — uses DB index on `token` column
- [ ] Implement `revoke(token: string): Promise<void>` — `UPDATE SET revokedAt = now() WHERE token = ?`
- [ ] All methods return plain typed objects — never raw Prisma types

### 2.2 Phase 2.1 Checkpoint

- [ ] `pnpm build` — 0 errors, 0 warnings

### 2.3 AuthService

- [ ] Create `apps/backend/src/services/AuthService.ts`
- [ ] Import from `@noteapp/shared`: `ErrorCode`, `TRegisterInput`, `TLoginInput`, `TRefreshInput`, `IAuthResponse`, `IRegisterResponse`, `IRefreshResponse`
- [ ] Import both repositories and `signAccessToken` and `createError`
- [ ] Set constants: `BCRYPT_ROUNDS = 12`, `REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000`

**`register` method:**
- [ ] Normalize email to lowercase before every query and before insert
- [ ] Call `UserRepository.findByEmail(normalizedEmail)`; if found → throw `EMAIL_TAKEN` 422
- [ ] `bcrypt.hash(input.password, BCRYPT_ROUNDS)` → `passwordHash`
- [ ] `UserRepository.create({ email: normalizedEmail, passwordHash })`
- [ ] Return `{ userId: user.id }`

**`login` method:**
- [ ] Normalize email to lowercase
- [ ] `UserRepository.findByEmail(normalizedEmail)` → `foundUser`
- [ ] If not found: run `bcrypt.compare(input.password, DUMMY_HASH)` (timing attack prevention), then throw `INVALID_CREDENTIALS` 401
- [ ] `bcrypt.compare(input.password, foundUser.passwordHash)`; if false → throw `INVALID_CREDENTIALS` 401
- [ ] `signAccessToken({ userId: foundUser.id, email: foundUser.email })`
- [ ] `uuidv4()` → `refreshTokenValue`; `expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)`
- [ ] `RefreshTokenRepository.create({ userId: foundUser.id, token: refreshTokenValue, expiresAt })`
- [ ] Return `{ accessToken, refreshToken: refreshTokenValue, user: { id, email, createdAt: createdAt.toISOString() } }`

**`logout` method:**
- [ ] `RefreshTokenRepository.findByToken(data.refreshToken)`
- [ ] If not found OR `revokedAt != null` → return void immediately (idempotent — no error)
- [ ] Otherwise: `RefreshTokenRepository.revoke(data.refreshToken)`

**`refreshToken` method:**
- [ ] `RefreshTokenRepository.findByToken(input.refreshToken)`
- [ ] If not found OR `revokedAt != null` → throw `REFRESH_INVALID` 401
- [ ] If `record.expiresAt < new Date()` → throw `REFRESH_EXPIRED` 401
- [ ] `RefreshTokenRepository.revoke(input.refreshToken)` (mark old token revoked)
- [ ] `uuidv4()` → `newToken`; insert new token via `RefreshTokenRepository.create`
- [ ] `UserRepository.findById(record.userId)` → `user` (needed for email in JWT payload)
- [ ] `signAccessToken({ userId: user.id, email: user.email })`
- [ ] Return `{ accessToken: newAccessToken }`

### 2.4 Phase 2.3 Checkpoint

- [ ] `pnpm build` — 0 errors, 0 warnings

### 2.5 Route Handlers

- [ ] Create `apps/backend/src/routes/authRoutes.ts`
- [ ] `POST /register` — `validate(registerSchema)` → `AuthService.register` → `201 { data: result }`
- [ ] `POST /login` — `validate(loginSchema)` → `AuthService.login` → `200 { data: result }`
- [ ] `POST /logout` — `requireAuth`, `validate(refreshSchema)` → `AuthService.logout` → `204` no body
- [ ] `POST /refresh` — `validate(refreshSchema)` → `AuthService.refreshToken` → `200 { data: result }`
- [ ] No try/catch in route handlers — all errors passed to `next(err)` only
- [ ] Export as `router as authRoutes`

### 2.6 Wire Routes in app.ts

- [ ] In `apps/backend/src/app.ts`, add import: `import { authRoutes } from "./routes/authRoutes.js";`
- [ ] Uncomment (or add): `app.use("/api/auth", authRoutes);`

### 2.7 Phase 2 Final Checkpoint

- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0` — 0 warnings

---

## Phase 3 — Tests

> Backend only ticket — no frontend work. Phase 3 tests only.

### 3.1 Unit Tests — AuthService.test.ts [PARALLEL]

- [ ] Create `apps/backend/src/__tests__/unit/services/AuthService.test.ts`
- [ ] Set up `vi.mock` for both `UserRepository` and `RefreshTokenRepository`
- [ ] Set `process.env.JWT_SECRET = "test_secret_for_tests"` in `beforeAll`

**Register tests:**
- [ ] `AC-S1: valid registration` — mock findByEmail→null, create→user; assert returns `{ userId }`, create called with bcrypt hash
- [ ] `AC-S2: duplicate email exact` — mock findByEmail→user; assert throws with code `EMAIL_TAKEN`
- [ ] `AC-S3: duplicate email case-insensitive` — mock findByEmail returns user for lowercased email even when input is uppercased; assert `EMAIL_TAKEN`
- [ ] `AC-S10: password not stored plaintext` — capture `create` call args; assert passwordHash starts with `$2b$`

**Login tests:**
- [ ] `AC-S11: valid login` — assert returns `{ accessToken, refreshToken, user }` with correct shapes
- [ ] `AC-S12: accessToken has correct payload` — decode JWT (without verify); assert payload has `userId`, `email`
- [ ] `AC-S13: refreshToken persisted in DB` — assert `RefreshTokenRepository.create` called with correct `userId` and future `expiresAt`
- [ ] `AC-S14: wrong password` — mock findByEmail→user, bcrypt.compare→false; assert throws `INVALID_CREDENTIALS`
- [ ] `AC-S15: unknown email — no enumeration` — mock findByEmail→null; assert throws `INVALID_CREDENTIALS` (same code as wrong password)

**Logout tests:**
- [ ] `AC-S17: valid logout` — mock findByToken→active token; assert `revoke` called with correct token
- [ ] `AC-S20: idempotent logout — already revoked` — mock findByToken→`{ revokedAt: new Date() }`; assert `revoke` NOT called, resolves void
- [ ] `AC-S21: idempotent logout — unknown token` — mock findByToken→null; assert `revoke` NOT called, resolves void

**Refresh token tests:**
- [ ] `AC-S22: valid refresh` — mock findByToken→active token, findById→user; assert `revoke` called, `create` called with new token, returns `{ accessToken }`
- [ ] `AC-S23: refresh token not in DB` — mock findByToken→null; assert throws `REFRESH_INVALID`
- [ ] `AC-S24: refresh token revoked` — mock findByToken→`{ revokedAt: new Date() }`; assert throws `REFRESH_INVALID`
- [ ] `AC-S25: refresh token expired` — mock findByToken→`{ revokedAt: null, expiresAt: past date }`; assert throws `REFRESH_EXPIRED`

### 3.2 Integration Tests — auth.test.ts [PARALLEL]

- [ ] Create `apps/backend/src/__tests__/integration/routes/auth.test.ts`
- [ ] Set up Supertest with `createApp()`
- [ ] `beforeAll`: run `execSync("pnpm --filter backend prisma migrate reset --force --skip-seed")` against `TEST_DATABASE_URL`
- [ ] `afterAll`: call `prisma.$disconnect()`
- [ ] `beforeEach`: truncate tables in FK order: `RefreshToken` → `NoteTag` → `Note` → `Tag` → `User`

**Register integration tests:**
- [ ] `AC-S1: valid registration` — POST `{ email, password }` → assert 201, body `{ data: { userId } }`, UUID format
- [ ] `AC-S2: duplicate email` — register twice same email → assert 422, `body.error.code === "EMAIL_TAKEN"`
- [ ] `AC-S3: duplicate email case-insensitive` — register with `user@example.com` then `USER@EXAMPLE.COM` → assert 422 `EMAIL_TAKEN`
- [ ] `AC-S4: invalid email format` — `{ email: "notanemail", password: "Secret123" }` → assert 400, `body.error.code === "VALIDATION_ERROR"`, `fields` includes `"email"`
- [ ] `AC-S5: password too short` — `{ password: "Ab1" }` → assert 400 `VALIDATION_ERROR`, fields includes `"password"`
- [ ] `AC-S6: password missing uppercase` — `{ password: "secret123" }` → assert 400 `VALIDATION_ERROR`
- [ ] `AC-S7: password missing lowercase` — `{ password: "SECRET123" }` → assert 400 `VALIDATION_ERROR`
- [ ] `AC-S8: password missing digit` — `{ password: "SecretAbc" }` → assert 400 `VALIDATION_ERROR`
- [ ] `AC-S9: missing required fields` — POST `{}` → assert 400 `VALIDATION_ERROR`
- [ ] `AC-S10: password not stored plaintext` — after register, query DB directly; assert `passwordHash` starts with `$2b$`

**Login integration tests:**
- [ ] `AC-S11: valid login` — register then login → assert 200, body has `{ data: { accessToken, refreshToken, user } }`
- [ ] `AC-S12: accessToken is JWT with correct payload` — decode returned accessToken; assert `userId` and `email` in payload, `exp ≈ iat + 900`
- [ ] `AC-S13: refreshToken persisted in DB` — after login, query `RefreshToken` table; assert row exists with matching token
- [ ] `AC-S14: wrong password` — `{ email: existing, password: "WrongPass1" }` → assert 401 `INVALID_CREDENTIALS`
- [ ] `AC-S15: unknown email` — `{ email: "nobody@example.com", password: "Secret123" }` → assert 401 `INVALID_CREDENTIALS`
- [ ] `AC-S16: missing fields on login` — `{ email: "a@b.com" }` (no password) → assert 400 `VALIDATION_ERROR`

**Logout integration tests:**
- [ ] `AC-S17: valid logout` — register, login, logout with Bearer + refreshToken body → assert 204, no body; query DB to confirm `revokedAt` is set
- [ ] `AC-S18: logout without auth header` — POST logout no Authorization → assert 401 `UNAUTHORIZED`
- [ ] `AC-S19: logout with expired access token` — not directly testable via HTTP without clock manipulation; assert `TOKEN_EXPIRED` when sending an expired JWT (create one manually with `expiresIn: "0s"`)
- [ ] `AC-S20: idempotent logout — token already revoked` — logout twice with same refresh token → assert second call also 204
- [ ] `AC-S21: idempotent logout — unknown token` — logout with random UUID not in DB → assert 204

**Refresh integration tests:**
- [ ] `AC-S22: valid refresh` — login, then refresh → assert 200, body `{ data: { accessToken } }`; verify old token `revokedAt` set in DB
- [ ] `AC-S23: refresh token not in DB` — POST `{ refreshToken: uuidv4() }` → assert 401 `REFRESH_INVALID`
- [ ] `AC-S24: refresh token revoked` — login, logout (revokes token), then try to refresh → assert 401 `REFRESH_INVALID`
- [ ] `AC-S25: refresh token expired` — insert a RefreshToken row with past `expiresAt` directly in DB; POST refresh → assert 401 `REFRESH_EXPIRED`
- [ ] `AC-S26: missing refreshToken field` — POST `{}` → assert 400 `VALIDATION_ERROR`

**Auth middleware integration tests:**
- [ ] `AC-S27: protected route — no header` — GET `/api/notes` (no Authorization) → assert 401 `UNAUTHORIZED`
- [ ] `AC-S28: protected route — valid token` — GET `/api/notes` with valid Bearer → assert NOT 401 (notes route not yet implemented; accept 404 as pass)
- [ ] `AC-S29: protected route — malformed Bearer` — Authorization: `"Bearer not-a-jwt"` → assert 401 `TOKEN_EXPIRED`

### 3.3 Phase 3 Final Checkpoint

- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0` — 0 warnings
- [ ] `pnpm test` — all 45 tests green (16 unit + 29 integration)
- [ ] `pnpm test --coverage` — ≥80% coverage on all new files

---

## Phase 4 — Commit

- [ ] Stage files:
  ```
  packages/shared/src/schemas/index.ts
  apps/backend/src/repositories/UserRepository.ts
  apps/backend/src/repositories/RefreshTokenRepository.ts
  apps/backend/src/services/AuthService.ts
  apps/backend/src/routes/authRoutes.ts
  apps/backend/src/app.ts
  apps/backend/src/__tests__/unit/services/AuthService.test.ts
  apps/backend/src/__tests__/integration/routes/auth.test.ts
  apps/backend/prisma/migrations/
  ```
- [ ] Commit: `feat(auth): implement register, login, logout, JWT refresh AB#1002`
- [ ] Husky pre-commit gate passes (build + lint + test)
- [ ] Commitlint gate passes (AB#1002 reference present)

---

## Phase 5 — Review + Archive

- [ ] Run `/review AB-1002-auth` in a **fresh terminal** (new Claude instance)
- [ ] Review output shows all ✅ — no ❌, ⚠️, 🔴, or 📋
- [ ] Move spec: `mv openspec/changes/AB-1002-auth openspec/archive/AB-1002-auth`
- [ ] Run `/pr` to raise pull request

---

## Scenario Coverage Matrix

| Spec ID | Scenario | Unit test | Integration test |
| :--- | :--- | :--- | :--- |
| S1 | Valid registration | AC-S1 | AC-S1 |
| S2 | Duplicate email exact | AC-S2 | AC-S2 |
| S3 | Duplicate email case-insensitive | AC-S3 | AC-S3 |
| S4 | Invalid email format | — | AC-S4 |
| S5 | Password too short | — | AC-S5 |
| S6 | Password missing uppercase | — | AC-S6 |
| S7 | Password missing lowercase | — | AC-S7 |
| S8 | Password missing digit | — | AC-S8 |
| S9 | Missing required fields | — | AC-S9 |
| S10 | Password not stored plaintext | AC-S10 | AC-S10 |
| S11 | Valid login | AC-S11 | AC-S11 |
| S12 | accessToken correct payload | AC-S12 | AC-S12 |
| S13 | refreshToken persisted | AC-S13 | AC-S13 |
| S14 | Wrong password | AC-S14 | AC-S14 |
| S15 | Unknown email | AC-S15 | AC-S15 |
| S16 | Missing fields on login | — | AC-S16 |
| S17 | Valid logout | AC-S17 | AC-S17 |
| S18 | Logout without auth header | — | AC-S18 |
| S19 | Logout with expired access token | — | AC-S19 |
| S20 | Idempotent logout — already revoked | AC-S20 | AC-S20 |
| S21 | Idempotent logout — unknown token | AC-S21 | AC-S21 |
| S22 | Valid refresh | AC-S22 | AC-S22 |
| S23 | Refresh token not in DB | AC-S23 | AC-S23 |
| S24 | Refresh token revoked | AC-S24 | AC-S24 |
| S25 | Refresh token expired | AC-S25 | AC-S25 |
| S26 | Missing refreshToken field | — | AC-S26 |
| S27 | Protected route — no header | — | AC-S27 |
| S28 | Protected route — valid token | — | AC-S28 |
| S29 | Protected route — malformed Bearer | — | AC-S29 |

**Total tasks:** 6 new files + 2 modified + 45 test assertions (16 unit + 29 integration)  
**All 29 spec scenarios covered** ✅
