# Plan: AB-1002 — Authentication API

**Status:** Draft — awaiting human approval
**Created:** 2026-06-11
**Spec:** `openspec/changes/AB-1002-auth/specs/auth/spec.md`
**Branch:** `feature/backend/AB-1002-auth`
**Layer:** Backend only

---

## 1. What Already Exists — Use As-Is

| File | Status | Notes |
| :--- | :--- | :--- |
| `packages/shared/src/errors.ts` | ✅ Complete | All 10 error codes defined |
| `packages/shared/src/types/index.ts` | ✅ Complete | IUserResponse, IAuthResponse, IRegisterResponse, IRefreshResponse all defined |
| `packages/shared/src/schemas/index.ts` | ⚠️ 1 addition | registerSchema, loginSchema, refreshSchema exist; missing `TRefreshInput` export |
| `apps/backend/prisma/schema.prisma` | ✅ Complete | User + RefreshToken models already in schema; no migration changes needed |
| `apps/backend/src/utils/token.ts` | ✅ Complete | signAccessToken, verifyAccessToken with lazy JWT_SECRET getter |
| `apps/backend/src/middleware/errorHandler.ts` | ✅ Complete | createError, errorHandler, notFound |
| `apps/backend/src/middleware/auth.ts` | ✅ Complete | requireAuth, AuthenticatedRequest interface |
| `apps/backend/src/middleware/validate.ts` | ✅ Complete | validate(schema) Zod middleware |
| `apps/backend/src/lib/prisma.ts` | ✅ Complete | PrismaClient singleton |
| `apps/backend/src/app.ts` | ⚠️ 1 line change | Uncomment authRoutes mount |

---

## 2. Files to Create (6 new files)

```
apps/backend/src/
  repositories/
    UserRepository.ts           NEW — User DB queries
    RefreshTokenRepository.ts   NEW — RefreshToken DB queries
  services/
    AuthService.ts              NEW — auth business logic
  routes/
    authRoutes.ts               NEW — 4 route handlers
  __tests__/
    unit/services/
      AuthService.test.ts       NEW — unit tests (mocked repos)
    integration/routes/
      auth.test.ts              NEW — Supertest integration tests
```

---

## 3. File to Modify (2 files)

### 3a. `packages/shared/src/schemas/index.ts`

Add one missing type export at the bottom of the file:

```typescript
export type TRefreshInput = z.infer<typeof refreshSchema>;
```

> `refreshSchema` (the Zod object) already exists — only the inferred type is missing. Used to type route bodies in logout and refresh handlers.

---

### 3b. `apps/backend/src/app.ts`

Uncomment the authRoutes mount and add the import:

```typescript
// Before:
// app.use("/api/auth", authRoutes);

// After:
import { authRoutes } from "./routes/authRoutes.js";
app.use("/api/auth", authRoutes);
```

---

## 4. DB Migration

Schema already contains all required models. Run the initial migration **before Phase 3**:

```bash
pnpm --filter backend prisma migrate dev --name init
```

This creates `apps/backend/prisma/migrations/<timestamp>_init/migration.sql`.
No schema file changes needed.

---

## 5. Internal Domain Types

These types are **internal to the backend** — they must NOT go in `@noteapp/shared` because `IUserRecord` contains `passwordHash` (sensitive) and these are DB-layer representations, not API response shapes.

Declare them locally inside each repository file:

```typescript
// UserRepository.ts — internal only
interface IUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

// RefreshTokenRepository.ts — internal only
interface IRefreshTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}
```

---

## 6. Repository Contracts

### `UserRepository.ts`

```typescript
import prisma from "../lib/prisma.js";

interface IUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
}

export const UserRepository = {
  findByEmail(email: string): Promise<IUserRecord | null>,
  create(data: { email: string; passwordHash: string }): Promise<IUserRecord>,
};
```

- `findByEmail` — query by `email` column (already stored lowercase)
- `create` — insert and return `{ id, email, passwordHash, createdAt }` (no `updatedAt` in response)
- Both return plain typed objects, never raw Prisma objects

---

### `RefreshTokenRepository.ts`

```typescript
import prisma from "../lib/prisma.js";

interface IRefreshTokenRecord {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export const RefreshTokenRepository = {
  create(data: { userId: string; token: string; expiresAt: Date }): Promise<IRefreshTokenRecord>,
  findByToken(token: string): Promise<IRefreshTokenRecord | null>,
  revoke(token: string): Promise<void>,
};
```

- `create` — insert and return record
- `findByToken` — lookup by `token` column (has DB index via `@@index([token])`)
- `revoke` — `UPDATE SET revokedAt = now() WHERE token = ?`

---

## 7. Service Contract

### `AuthService.ts`

```typescript
import bcrypt from "bcrypt";
import { v4 as uuidv4 } from "uuid";
import { UserRepository } from "../repositories/UserRepository.js";
import { RefreshTokenRepository } from "../repositories/RefreshTokenRepository.js";
import { signAccessToken } from "../utils/token.js";
import { createError } from "../middleware/errorHandler.js";
import { ErrorCode } from "@noteapp/shared";
import type { TRegisterInput, TLoginInput, TRefreshInput, IAuthResponse, IRegisterResponse, IRefreshResponse } from "@noteapp/shared";

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export const AuthService = {
  async register(input: TRegisterInput): Promise<IRegisterResponse>,
  async login(input: TLoginInput): Promise<IAuthResponse>,
  async logout(data: { userId: string; refreshToken: string }): Promise<void>,
  async refreshToken(input: TRefreshInput): Promise<IRefreshResponse>,
};
```

#### `register` logic:
1. Normalize email: `input.email.toLowerCase()`
2. `UserRepository.findByEmail(normalizedEmail)`
3. If found → throw `createError(422, ErrorCode.EMAIL_TAKEN, "Email already exists")`
4. `bcrypt.hash(input.password, BCRYPT_ROUNDS)`
5. `UserRepository.create({ email: normalizedEmail, passwordHash })`
6. Return `{ userId: user.id }`

#### `login` logic:
1. Normalize email: `input.email.toLowerCase()`
2. `UserRepository.findByEmail(normalizedEmail)` → `foundUser`
3. If not found: **run dummy bcrypt compare** (prevents timing attack), then throw `INVALID_CREDENTIALS`
4. `bcrypt.compare(input.password, foundUser.passwordHash)`
5. If compare fails → throw `createError(401, ErrorCode.INVALID_CREDENTIALS, "Invalid email or password")`
6. `signAccessToken({ userId: foundUser.id, email: foundUser.email })`
7. `uuidv4()` → refreshTokenValue
8. `expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)`
9. `RefreshTokenRepository.create({ userId: foundUser.id, token: refreshTokenValue, expiresAt })`
10. Return `{ accessToken, refreshToken: refreshTokenValue, user: { id, email, createdAt: createdAt.toISOString() } }`

#### `logout` logic:
1. `RefreshTokenRepository.findByToken(data.refreshToken)`
2. If not found or already revoked (`revokedAt != null`) → **return void** (idempotent)
3. Else: `RefreshTokenRepository.revoke(data.refreshToken)`
4. Return void

> Note: `userId` from the auth header is NOT used to validate the token — silently succeeds regardless.

#### `refreshToken` logic:
1. `RefreshTokenRepository.findByToken(input.refreshToken)`
2. If not found or `revokedAt != null` → throw `createError(401, ErrorCode.REFRESH_INVALID, "Refresh token is invalid or revoked")`
3. If `expiresAt < new Date()` → throw `createError(401, ErrorCode.REFRESH_EXPIRED, "Refresh token has expired")`
4. `RefreshTokenRepository.revoke(input.refreshToken)` (mark old token revoked)
5. `newToken = uuidv4()`; `newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)`
6. `RefreshTokenRepository.create({ userId: record.userId, token: newToken, expiresAt: newExpiresAt })`
7. `newAccessToken = signAccessToken({ userId: record.userId, email: ... })`

> Problem: `RefreshTokenRecord` does not contain `email` — need to look up the user to get email for the new JWT payload. Options:
> - Option A: `UserRepository.findByEmail` is not suitable (we have userId, not email)
> - Option B: Add `findById` to UserRepository (cleanest)
> - Option C: Include email in RefreshToken record (schema change — not acceptable)
>
> **Decision: Add `findById(id: string)` to UserRepository.** This is minimal — one extra method, no schema change, no abstraction overhead.

Revised `refreshToken` step 7:
```
user = await UserRepository.findById(record.userId)
// user will always exist if token exists (CASCADE delete handles orphans)
newAccessToken = signAccessToken({ userId: user.id, email: user.email })
```

8. Return `{ accessToken: newAccessToken }`

---

## 8. Route Handlers Contract

### `authRoutes.ts`

```typescript
import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { AuthService } from "../services/AuthService.js";
import { registerSchema, loginSchema, refreshSchema } from "@noteapp/shared";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router = Router();

router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const result = await AuthService.register(req.body);
    res.status(201).json({ data: result });
  } catch (err) { next(err); }
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body);
    res.json({ data: result });
  } catch (err) { next(err); }
});

router.post("/logout", requireAuth, validate(refreshSchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    await AuthService.logout({ userId, refreshToken: req.body.refreshToken });
    res.status(204).send();
  } catch (err) { next(err); }
});

router.post("/refresh", validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await AuthService.refreshToken(req.body);
    res.json({ data: result });
  } catch (err) { next(err); }
});

export { router as authRoutes };
```

> Routes call service only. No DB access. No business logic. `validate()` and `requireAuth` are middleware — routes never try/catch validation errors.

---

## 9. UserRepository Revision

Add `findById` per the decision above:

```typescript
export const UserRepository = {
  findByEmail(email: string): Promise<IUserRecord | null>,
  findById(id: string): Promise<IUserRecord | null>,   // added for refresh token rotation
  create(data: { email: string; passwordHash: string }): Promise<IUserRecord>,
};
```

---

## 10. Testing Strategy

### Unit Tests — `AuthService.test.ts`

Mock both repositories with `vi.mock`. No DB connection. 16 unit tests:

| Test name | Spec scenario | What is asserted |
| :--- | :--- | :--- |
| `AC-S1: valid registration` | S1 | Returns `{ userId }`, findByEmail called once, create called with hashed password |
| `AC-S2: duplicate email exact` | S2 | Throws with code EMAIL_TAKEN |
| `AC-S3: duplicate email case-insensitive` | S3 | Throws EMAIL_TAKEN when only case differs |
| `AC-S10: password not stored plaintext` | S10 | create() called with passwordHash starting `$2b$` |
| `AC-S11: valid login` | S11 | Returns accessToken + refreshToken + user shape |
| `AC-S12: accessToken has correct payload` | S12 | Decoded payload has userId and email |
| `AC-S13: refreshToken persisted` | S13 | RefreshTokenRepository.create called with correct userId |
| `AC-S14: wrong password` | S14 | Throws INVALID_CREDENTIALS |
| `AC-S15: unknown email` | S15 | Throws INVALID_CREDENTIALS (same error, no enumeration) |
| `AC-S17: valid logout` | S17 | revoke() called with correct token |
| `AC-S20: idempotent logout — already revoked` | S20 | resolves void without calling revoke() |
| `AC-S21: idempotent logout — token not found` | S21 | resolves void without calling revoke() |
| `AC-S22: valid refresh` | S22 | Returns new accessToken, old token revoked, new token created |
| `AC-S23: refresh token not in DB` | S23 | Throws REFRESH_INVALID |
| `AC-S24: refresh token revoked` | S24 | Throws REFRESH_INVALID |
| `AC-S25: refresh token expired` | S25 | Throws REFRESH_EXPIRED |

---

### Integration Tests — `auth.test.ts`

Supertest + real `TEST_DATABASE_URL` DB. 29 integration tests covering all spec scenarios S1–S29.

**Test setup:**
```typescript
// beforeAll: run prisma migrate reset (clean state for entire suite)
// afterAll: prisma.$disconnect()
// beforeEach: DELETE from tables in FK order: RefreshToken → NoteTag → Note → Tag → User
```

**Environment variable required:**
```
TEST_DATABASE_URL=postgresql://.../<test_db_name>
```

Tests assert exact error code strings:
```typescript
expect(res.body.error.code).toBe("EMAIL_TAKEN");         // not just res.status
expect(res.body.error.code).toBe("INVALID_CREDENTIALS"); // etc.
```

---

## 11. Implementation Phases

### Phase 0 — Shared package addition
**Files changed:** `packages/shared/src/schemas/index.ts` (+1 line)
**Checkpoint:** `pnpm build` in packages/shared — 0 errors

---

### Phase 1 — DB Migration
**Command:** `pnpm --filter backend prisma migrate dev --name init`
**Output:** `apps/backend/prisma/migrations/<ts>_init/migration.sql`
**Checkpoint:** Migration completes, Prisma Client regenerated

---

### Phase 2 — Repositories
**Files created:** `UserRepository.ts`, `RefreshTokenRepository.ts`
**Checkpoint:** `pnpm build` — 0 errors, 0 warnings

---

### Phase 3 — Service
**Files created:** `AuthService.ts`
**Checkpoint:** `pnpm build` — 0 errors, 0 warnings

---

### Phase 4 — Routes + App wiring
**Files created:** `authRoutes.ts`
**Files modified:** `app.ts` (unmount)
**Checkpoint:** `pnpm build` → `pnpm lint --max-warnings 0` — both must pass

---

### Phase 5 — Unit Tests
**Files created:** `__tests__/unit/services/AuthService.test.ts`
**Checkpoint:** `pnpm test` — all green (unit suite only)

---

### Phase 6 — Integration Tests
**Files created:** `__tests__/integration/routes/auth.test.ts`
**Checkpoint:** `pnpm build` → `pnpm lint --max-warnings 0` → `pnpm test` — all green

---

## 12. Dependencies Check

| Package | Already installed | Used in |
| :--- | :--- | :--- |
| `bcrypt` | ✅ 5.1.1 | AuthService.register, AuthService.login |
| `@types/bcrypt` | verify in devDeps | AuthService |
| `jsonwebtoken` | ✅ 9.0.2 | token.ts (already used) |
| `uuid` | check needed | AuthService (uuidv4) |
| `@types/uuid` | check needed | AuthService |
| `supertest` | ✅ 7.0.0 | Integration tests |
| `@types/supertest` | verify in devDeps | Integration tests |

> Action: verify `uuid` and `@types/bcrypt` / `@types/supertest` are in `apps/backend/package.json` before Phase 3.

---

## 13. Risks and Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| JWT_SECRET not set in test env | tests throw on service import | token.ts uses lazy getter — safe to import; only throws when actually called. Test env must set `JWT_SECRET=test_secret_for_tests` |
| TEST_DATABASE_URL not set | integration tests fail at connection | Add to `.env.test` (not committed); document in README |
| bcrypt timing on CI | tests slow (12 rounds × many tests) | Use bcrypt.hash mock in unit tests; only real bcrypt in integration (unavoidable) |
| Prisma migrate reset in CI | destroys prod DB if env misconfigured | Integration tests MUST use `TEST_DATABASE_URL`, never `DATABASE_URL` |
| Email stored mixed case in existing rows | findByEmail misses case-insensitive duplicates | Service always normalizes to lowercase before create AND before query |

---

## 14. Assumptions

1. `uuid` package is available (check `apps/backend/package.json`; add if missing).
2. Integration tests run against `TEST_DATABASE_URL` — a separate DB instance.
3. `JWT_SECRET=test_secret_for_tests` is set in the test environment.
4. `pnpm --filter backend prisma migrate dev --name init` runs successfully against `DATABASE_URL`.
5. No rate limiting is added in this ticket (out of scope per proposal).
6. `logoutSchema` is not needed — reuse `refreshSchema` (same `{ refreshToken }` shape) for the logout body validation.
