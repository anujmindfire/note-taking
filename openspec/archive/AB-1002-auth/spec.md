# Spec — AB-1002: User Authentication

**Status:** Archived
**Ticket:** AB-1002
**Branch:** feature/backend/AB-1002-auth
**FRS References:** §4.1.1 (Registration), §4.1.2 (Login), §4.1.3 (Logout), §5.2.2 (JWT), §5.2.4 (Auth middleware), §6.2 (Refresh token rotation)
**SDS References:** §6.2 (Refresh token rotation strategy)
**Layer:** Backend only
**Depends on:** AB-1001 (project setup, Prisma schema, middleware scaffolding)

---

## Summary

Implements the full authentication lifecycle for the NoteApp backend. Users can register with an email and password, log in to receive a short-lived JWT access token (15 minutes) and a long-lived refresh token (7 days), log out to revoke their refresh token, and call a refresh endpoint to rotate their refresh token and receive a new access token. All four endpoints are exposed under `/api/auth`. The `requireAuth` middleware is also delivered in this ticket and enforces Bearer token authentication on all protected routes. Passwords are stored as bcrypt hashes (12 rounds). Refresh tokens are opaque UUIDs stored in the `RefreshToken` table with a `revokedAt` timestamp for revocation tracking. Token rotation on refresh ensures each refresh token is single-use.

---

## In Scope

- `POST /api/auth/register` — create a new user account
- `POST /api/auth/login` — authenticate and issue JWT access token + refresh token
- `POST /api/auth/logout` — revoke a refresh token (idempotent, auth required)
- `POST /api/auth/refresh` — rotate refresh token and issue new access token
- `requireAuth` middleware — validate Bearer JWT on protected routes
- `UserRepository` — `findByEmail`, `findById`, `create`, `updatePasswordHash`
- `RefreshTokenRepository` — `create`, `findByToken`, `revoke`, `revokeAllByUserId`
- Case-insensitive email normalisation (lowercase before all queries and inserts)
- Timing-attack prevention on login for unknown emails (dummy bcrypt compare)

## Out of Scope

- Frontend UI
- Email verification
- Rate limiting
- Password reset / forgot-password (delivered in AB-1003; `OtpTokenRepository` and `forgotPassword`/`resetPassword` methods are present in final files but belong to AB-1003)
- `revokeAllByUserId` is present in `RefreshTokenRepository` but is only called by `resetPassword` (AB-1003)

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | `User` and `RefreshToken` Prisma models exist in `schema.prisma` before this ticket; the initial migration (`--name init`) creates the tables | plan.md |
| A2 | `JWT_SECRET` is provided via environment variable; access token is HS256, 15-minute expiry | `utils/token.ts` |
| A3 | Refresh tokens are opaque UUID v4 strings — NOT JWTs | `AuthService.ts` |
| A4 | Refresh token TTL is 7 days (`REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000`) | `AuthService.ts` |
| A5 | bcrypt cost factor is 12 rounds (`BCRYPT_ROUNDS = 12`) | `AuthService.ts` |
| A6 | Email is normalised to lowercase before every DB read and write; uniqueness enforced at DB level via `@unique` on `User.email` | `AuthService.ts` + schema |
| A7 | `refreshSchema` (shape `{ refreshToken: string }`) is reused for both logout and refresh request bodies | `schemas/index.ts` + `authRoutes.ts` |
| A8 | Logout is idempotent: an unknown refresh token or already-revoked token both return 204 with no error | `AuthService.ts` |
| A9 | Token refresh is a rotation: old token is immediately revoked and a new token inserted before the new access token is signed | `AuthService.ts` |
| A10 | `UserRepository.findById` is required by `refreshToken` service method because `RefreshTokenRecord` does not store email | plan.md |
| A11 | A malformed or expired access token presented to `requireAuth` returns `TOKEN_EXPIRED`; `UNAUTHORIZED` is returned only when the `Authorization` header is absent or does not start with `"Bearer "` | `middleware/auth.ts` |
| A12 | Integration tests use `DATABASE_URL` (not a separate `TEST_DATABASE_URL`) and skip gracefully when `DATABASE_URL` is not set | `auth.test.ts` |
| A13 | `IUserRecord` and `IRefreshTokenRecord` are internal backend types declared inside each repository file; never exported to `@noteapp/shared` because `IUserRecord` contains `passwordHash` | plan.md |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Valid registration | Database empty; valid email + password | POST `/api/auth/register` `{ email, password }` | 201 `{ data: { userId: string } }`; user row created; password stored as bcrypt hash | §4.1.1 AC1–AC2 | — |
| S2 | Duplicate email exact case | User with `user@example.com` already exists | POST `/api/auth/register` `{ email: "user@example.com" }` | 422 `EMAIL_TAKEN` | §4.1.1 AC4 | `EMAIL_TAKEN` |
| S3 | Duplicate email mixed case | User with `user@example.com` already exists | POST `/api/auth/register` `{ email: "USER@EXAMPLE.COM" }` | 422 `EMAIL_TAKEN` (email normalised to lowercase before lookup) | §4.1.1 AC4 | `EMAIL_TAKEN` |
| S4 | Invalid email format | — | POST `/api/auth/register` `{ email: "notanemail", password: "Secret123" }` | 400 `VALIDATION_ERROR`; `fields` includes `"email"` | §4.1.1 | `VALIDATION_ERROR` |
| S5 | Password too short | — | POST `/api/auth/register` `{ password: "Ab1" }` | 400 `VALIDATION_ERROR`; `fields` includes `"password"` | §4.1.1 | `VALIDATION_ERROR` |
| S6 | Password missing uppercase | — | POST `/api/auth/register` `{ password: "secret123" }` | 400 `VALIDATION_ERROR` | §4.1.1 | `VALIDATION_ERROR` |
| S7 | Password missing lowercase | — | POST `/api/auth/register` `{ password: "SECRET123" }` | 400 `VALIDATION_ERROR` | §4.1.1 | `VALIDATION_ERROR` |
| S8 | Password missing digit | — | POST `/api/auth/register` `{ password: "SecretAbc" }` | 400 `VALIDATION_ERROR` | §4.1.1 | `VALIDATION_ERROR` |
| S9 | Missing required fields | — | POST `/api/auth/register` `{}` | 400 `VALIDATION_ERROR` | §4.1.1 | `VALIDATION_ERROR` |
| S10 | Password not stored in plaintext | Valid registration | Row inserted in DB | `passwordHash` column starts with `$2b$`; raw password not stored | §4.1.1 AC2 | — |
| S11 | Valid login | User `user@example.com / Secret123` exists | POST `/api/auth/login` `{ email, password }` | 200 `{ data: { accessToken, refreshToken, user: { id, email, createdAt } } }`; `RefreshToken` row created | §4.1.2 AC1–AC2 | — |
| S12 | Access token has correct payload and expiry | User just logged in | Decode `accessToken` (JWT) | Payload contains `userId` and `email`; `exp - iat === 900` (15 minutes) | §5.2.2 | — |
| S13 | Refresh token persisted in database | User just logged in | Query `RefreshToken` table | Row exists; `userId` matches; `expiresAt` in future; `revokedAt` is null | §4.1.2 AC2 | — |
| S14 | Wrong password | User exists | POST `/api/auth/login` with correct email but wrong password | 401 `INVALID_CREDENTIALS` with message `"Invalid email or password"` | §4.1.2 AC3 | `INVALID_CREDENTIALS` |
| S15 | Unknown email — no user enumeration | No user with the given email | POST `/api/auth/login` | 401 `INVALID_CREDENTIALS` — same code and message as wrong password; dummy bcrypt compare runs | §4.1.2 AC3 | `INVALID_CREDENTIALS` |
| S16 | Missing fields on login | — | POST `/api/auth/login` `{ email: "a@b.com" }` (no password) | 400 `VALIDATION_ERROR` | §4.1.2 | `VALIDATION_ERROR` |
| S17 | Valid logout | User has valid `accessToken` and active `refreshToken` | POST `/api/auth/logout` with `Authorization: Bearer <accessToken>` and `{ refreshToken }` | 204 no body; `RefreshToken` row has `revokedAt` set | §4.1.3 AC1 | — |
| S18 | Logout without Authorization header | — | POST `/api/auth/logout` with no `Authorization` header | 401 `UNAUTHORIZED` | §5.2.4 | `UNAUTHORIZED` |
| S19 | Logout with expired access token | Access token past 15-min expiry | POST `/api/auth/logout` with expired Bearer token | 401 `TOKEN_EXPIRED` | §5.2.2 | `TOKEN_EXPIRED` |
| S20 | Idempotent logout — token already revoked | `RefreshToken` row has `revokedAt` set | POST `/api/auth/logout` with that token and valid `accessToken` | 204 no body; no error | §4.1.3 | — |
| S21 | Idempotent logout — unknown refresh token | No `RefreshToken` row for given value | POST `/api/auth/logout` with unknown refresh token | 204 no body; no error | §4.1.3 | — |
| S22 | Valid token refresh | Active (non-revoked, non-expired) `RefreshToken` row | POST `/api/auth/refresh` `{ refreshToken }` | 200 `{ data: { accessToken: string } }`; old token `revokedAt` set; new `RefreshToken` row created | §6.2 | — |
| S23 | Refresh token not in DB | No `RefreshToken` row for given value | POST `/api/auth/refresh` `{ refreshToken }` | 401 `REFRESH_INVALID` | §6.2 | `REFRESH_INVALID` |
| S24 | Refresh token revoked | `RefreshToken` row has `revokedAt` set | POST `/api/auth/refresh` `{ refreshToken }` | 401 `REFRESH_INVALID` | §6.2 | `REFRESH_INVALID` |
| S25 | Refresh token expired | `RefreshToken` row exists with `expiresAt` in the past | POST `/api/auth/refresh` `{ refreshToken }` | 401 `REFRESH_EXPIRED` | §5.2.2 | `REFRESH_EXPIRED` |
| S26 | Missing `refreshToken` field on refresh | — | POST `/api/auth/refresh` `{}` | 400 `VALIDATION_ERROR` | — | `VALIDATION_ERROR` |
| S27 | Protected route — no Authorization header | — | Any protected endpoint with no `Authorization` header | 401 `UNAUTHORIZED` | §5.2.4 | `UNAUTHORIZED` |
| S28 | Protected route — valid access token | Valid, non-expired JWT | GET `/api/notes` with `Authorization: Bearer <validToken>` | Auth guard passes; not 401 | §5.2.4 | — |
| S29 | Protected route — malformed Bearer token | — | `Authorization: Bearer not-a-jwt` on any protected endpoint | 401 `TOKEN_EXPIRED` | §5.2.4 | `TOKEN_EXPIRED` |

---

## API Contract

### POST `/api/auth/register`

**Auth required:** No
**Request body:**
```json
{ "email": "user@example.com", "password": "Secret123" }
```
Password rules (Zod): min 8 chars, ≥1 uppercase, ≥1 lowercase, ≥1 digit.

**Success response — 201:**
```json
{ "data": { "userId": "uuid-string" } }
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid email format, password fails policy |
| 422 | `EMAIL_TAKEN` | Email already registered (case-insensitive) |

---

### POST `/api/auth/login`

**Auth required:** No
**Request body:**
```json
{ "email": "user@example.com", "password": "Secret123" }
```

**Success response — 200:**
```json
{
  "data": {
    "accessToken": "jwt-string",
    "refreshToken": "uuid-string",
    "user": { "id": "uuid", "email": "user@example.com", "createdAt": "2024-01-01T00:00:00.000Z" }
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing required fields |
| 401 | `INVALID_CREDENTIALS` | Wrong password or unknown email (same message for both) |

---

### POST `/api/auth/logout`

**Auth required:** Yes (`Authorization: Bearer <accessToken>`)
**Request body:**
```json
{ "refreshToken": "uuid-string" }
```

**Success response — 204:** no body.

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or non-Bearer Authorization header |
| 401 | `TOKEN_EXPIRED` | Expired or malformed access token |

Note: unknown or already-revoked `refreshToken` returns 204 (idempotent).

---

### POST `/api/auth/refresh`

**Auth required:** No
**Request body:**
```json
{ "refreshToken": "uuid-string" }
```

**Success response — 200:**
```json
{ "data": { "accessToken": "jwt-string" } }
```
Old refresh token is revoked; new refresh token created in DB (token rotation). New refresh token value is NOT returned in the response.

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing `refreshToken` field |
| 401 | `REFRESH_INVALID` | Token not in DB or already revoked |
| 401 | `REFRESH_EXPIRED` | Token `expiresAt` is in the past |

---

## Database Changes

`User` and `RefreshToken` models exist in `schema.prisma` from AB-1001. The initial migration (`--name init`) creates both tables.

### `User` model
| Column | Type | Constraint |
|--------|------|-----------|
| `id` | `String` (UUID) | `@id @default(uuid())` |
| `email` | `String` | `@unique` |
| `passwordHash` | `String` | — |
| `createdAt` | `DateTime` | `@default(now())` |
| `updatedAt` | `DateTime` | `@updatedAt` |

### `RefreshToken` model
| Column | Type | Constraint |
|--------|------|-----------|
| `id` | `String` (UUID) | `@id @default(uuid())` |
| `userId` | `String` | FK → `User.id` `onDelete: Cascade` |
| `token` | `String` | `@unique` |
| `expiresAt` | `DateTime` | — |
| `revokedAt` | `DateTime?` | nullable; set on revocation |
| `createdAt` | `DateTime` | `@default(now())` |

Index: `@@index([token])` for fast lookup.

---

## Shared Package Changes

### `packages/shared/src/types/index.ts`
- `IUserResponse` — `{ id: string; email: string; createdAt: string }`
- `IAuthResponse` — `{ accessToken: string; refreshToken: string; user: IUserResponse }`
- `IRegisterResponse` — `{ userId: string }`
- `IRefreshResponse` — `{ accessToken: string }`

### `packages/shared/src/schemas/index.ts`
- `registerSchema` — email + password with policy validation
- `loginSchema` — email + password (min 1 char at login)
- `refreshSchema` — `{ refreshToken: string }` (reused for logout body too)
- `TRefreshInput` type export — `z.infer<typeof refreshSchema>`

### `packages/shared/src/errors.ts`
Error codes used: `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `REFRESH_EXPIRED`, `REFRESH_INVALID`, `UNAUTHORIZED`, `VALIDATION_ERROR`.

---

## Architecture Notes

**JWT strategy:** HS256, `JWT_SECRET` from env (accessed lazily — throws at call time if unset). Payload: `{ userId, email }`. Expiry: `"15m"` (900 s).

**Refresh token:** opaque UUID v4, not a JWT. Stored in DB, single-use via rotation.

**Token rotation on refresh:**
1. Validate token (must exist, not revoked, not expired)
2. Revoke old token (`revokedAt = now()`)
3. Create new `RefreshToken` row (new UUID, new 7-day `expiresAt`)
4. Look up user by `userId` from old token record to get `email` for JWT payload
5. Sign and return new access token only

**Timing-attack prevention on login:** when email not found, `bcrypt.compare(input.password, DUMMY_HASH)` runs before throwing `INVALID_CREDENTIALS` — response time is indistinguishable from wrong-password path.

**`requireAuth` error semantics:**
- Missing or non-`Bearer` `Authorization` header → `UNAUTHORIZED` (401)
- Any `jwt.verify` failure → `TOKEN_EXPIRED` (401)

**Three-layer separation:**
- `authRoutes.ts` — Zod validation, calls `AuthService`, sends response; no business logic
- `AuthService.ts` — all business rules; no `prisma` imports; no `Request`/`Response` types
- `UserRepository.ts`, `RefreshTokenRepository.ts` — all Prisma queries; return typed internal records (`IUserRecord`, `IRefreshTokenRecord`); `IUserRecord` never exported to shared (contains `passwordHash`)
