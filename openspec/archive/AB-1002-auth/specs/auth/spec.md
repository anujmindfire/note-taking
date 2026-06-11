# Spec Delta — AB-1002 Auth

**Type:** ADDED  
**Affects:** `/api/auth/*` (4 new endpoints), `RefreshToken` table, `User` table  
**No existing endpoints modified.**

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Register** | | | | | | |
| S1 | Valid registration | DB empty, valid email + password | POST /api/auth/register | 201 `{ data: { userId } }`, user row created, password hashed | §4.1.1 AC1–AC2 | — |
| S2 | Duplicate email (exact case) | User with email already exists | POST /api/auth/register same email | 422 `EMAIL_TAKEN` | §4.1.1 AC4 | EMAIL_TAKEN |
| S3 | Duplicate email (mixed case) | User with `user@example.com` exists | POST with `USER@EXAMPLE.COM` | 422 `EMAIL_TAKEN` (case-insensitive) | §4.1.1 AC4 | EMAIL_TAKEN |
| S4 | Invalid email format | — | POST `{ email: "notanemail" }` | 400 `VALIDATION_ERROR`, fields: ["email"] | §4.1.1 pass rules | VALIDATION_ERROR |
| S5 | Password too short | — | POST `{ password: "Ab1" }` | 400 `VALIDATION_ERROR`, fields: ["password"] | §4.1.1 pass rules | VALIDATION_ERROR |
| S6 | Password missing uppercase | — | POST `{ password: "secret123" }` | 400 `VALIDATION_ERROR`, fields: ["password"] | §4.1.1 pass rules | VALIDATION_ERROR |
| S7 | Password missing lowercase | — | POST `{ password: "SECRET123" }` | 400 `VALIDATION_ERROR`, fields: ["password"] | §4.1.1 pass rules | VALIDATION_ERROR |
| S8 | Password missing digit | — | POST `{ password: "SecretAbc" }` | 400 `VALIDATION_ERROR`, fields: ["password"] | §4.1.1 pass rules | VALIDATION_ERROR |
| S9 | Missing required fields | — | POST `{}` | 400 `VALIDATION_ERROR` | §4.1.1 AC1 | VALIDATION_ERROR |
| S10 | Password not stored plaintext | Valid registration | Row inserted in User table | `passwordHash` column is bcrypt hash (starts with `$2b$`) | §4.1.1 AC2 | — |
| **Login** | | | | | | |
| S11 | Valid login | User exists | POST /api/auth/login correct credentials | 200 `{ data: { accessToken, refreshToken, user } }`, RefreshToken row created | §4.1.2 AC1–AC2 | — |
| S12 | accessToken is JWT with correct payload | User logged in | Decode accessToken | Payload contains `userId`, `email`, expires in ~15 min | §5.2.2 | — |
| S13 | refreshToken persisted in DB | User logged in | Query RefreshToken table | Row exists for userId with future `expiresAt` | §4.1.2 AC2 | — |
| S14 | Wrong password | User exists | POST /api/auth/login wrong password | 401 `INVALID_CREDENTIALS` (generic message) | §4.1.2 AC3 | INVALID_CREDENTIALS |
| S15 | Unknown email | No user with that email | POST /api/auth/login | 401 `INVALID_CREDENTIALS` (same message — no enumeration) | §4.1.2 AC3 | INVALID_CREDENTIALS |
| S16 | Missing fields on login | — | POST `{ email: "a@b.com" }` (no password) | 400 `VALIDATION_ERROR` | §4.1.2 | VALIDATION_ERROR |
| **Logout** | | | | | | |
| S17 | Valid logout | User logged in with valid accessToken + refreshToken | POST /api/auth/logout with Bearer + refreshToken body | 204, RefreshToken row `revokedAt` set | §4.1.3 AC1 | — |
| S18 | Logout without auth header | — | POST /api/auth/logout no Authorization | 401 `UNAUTHORIZED` | §5.2.4 | UNAUTHORIZED |
| S19 | Logout with expired access token | accessToken past 15 min | POST /api/auth/logout | 401 `TOKEN_EXPIRED` | §5.2.2 | TOKEN_EXPIRED |
| S20 | Logout idempotent — token already revoked | refreshToken already revoked | POST /api/auth/logout with that token | 204 (silently succeeds) | §4.1.3 | — |
| S21 | Logout idempotent — unknown token | refreshToken not in DB | POST /api/auth/logout with unknown token | 204 (silently succeeds) | §4.1.3 | — |
| **Refresh** | | | | | | |
| S22 | Valid refresh | Active refreshToken in DB | POST /api/auth/refresh `{ refreshToken }` | 200 `{ data: { accessToken } }`, old token revoked, new token created in DB | §6.2 (SDS) | — |
| S23 | Refresh token not in DB | No matching row | POST /api/auth/refresh | 401 `REFRESH_INVALID` | §6.2 | REFRESH_INVALID |
| S24 | Refresh token revoked | Row exists, `revokedAt` is set | POST /api/auth/refresh | 401 `REFRESH_INVALID` | §6.2 | REFRESH_INVALID |
| S25 | Refresh token expired | Row exists, `expiresAt` is in the past | POST /api/auth/refresh | 401 `REFRESH_EXPIRED` | §5.2.2 | REFRESH_EXPIRED |
| S26 | Missing refreshToken field | — | POST /api/auth/refresh `{}` | 400 `VALIDATION_ERROR` | — | VALIDATION_ERROR |
| **Auth Middleware** | | | | | | |
| S27 | Protected route — no header | — | GET /api/notes (no Authorization) | 401 `UNAUTHORIZED` | §5.2.4 | UNAUTHORIZED |
| S28 | Protected route — valid token | Valid accessToken | GET /api/notes | Passes to route handler (tested via health or mock route) | §5.2.4 | — |
| S29 | Protected route — malformed Bearer | — | Authorization: "Bearer not-a-jwt" | 401 `TOKEN_EXPIRED` | §5.2.4 | TOKEN_EXPIRED |

---

## Response Shape Reference

All successes wrap in `{ data: ... }`. All errors use `{ error: { code, message, fields? } }`.

```typescript
// Register 201
{ data: { userId: string } }

// Login 200
{ data: { accessToken: string; refreshToken: string; user: { id: string; email: string; createdAt: string } } }

// Refresh 200
{ data: { accessToken: string } }

// Logout 204 — no body

// Error (all)
{ error: { code: TErrorCode; message: string; fields?: string[] } }
```

---

## DB Changes

**No schema migrations required** — `User` and `RefreshToken` models already exist in `prisma/schema.prisma`.

**Action required before implementation:** Run initial Prisma migration to create the tables:
```bash
pnpm --filter backend prisma migrate dev --name init
```

---

## No Frontend Changes
This ticket is backend only.
