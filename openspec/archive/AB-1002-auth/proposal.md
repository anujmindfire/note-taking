# Proposal: AB-1002 — Authentication API

**Status:** Draft — awaiting human approval  
**Created:** 2026-06-11  
**FRS Reference:** §4.1.1, §4.1.2, §4.1.3  
**SDS Reference:** §6.1, §6.2  
**Branch:** `feature/backend/AB-1002-auth`  
**Layer:** Backend only  
**Depends on:** textAB-1001 (monorepo scaffold)

---

## Summary

Implement the full authentication API: user registration, credential login, session logout, and access-token refresh. All session state is managed via short-lived JWT access tokens (15 min, HS256) and long-lived refresh tokens (7 days, UUID, stored in DB). No frontend pages are in scope.

---

## In Scope

| Endpoint | Method | Auth | Purpose |
| :--- | :--- | :--- | :--- |
| `/api/auth/register` | POST | No | Create account, return userId |
| `/api/auth/login` | POST | No | Issue access + refresh tokens |
| `/api/auth/logout` | POST | Bearer | Revoke specific refresh token |
| `/api/auth/refresh` | POST | No | Rotate refresh token, issue new access token |

---

## Out of Scope

- Password reset / OTP flow (FRS §4.1.4–§4.1.5) — separate ticket
- Rate limiting on auth endpoints (FRS §5.2.5) — separate ticket
- Frontend login/register pages
- Multi-device logout (all-session revocation)
- Email verification

---

## API Contract

### POST /api/auth/register
**Request body:**
```json
{ "email": "user@example.com", "password": "Secret123" }
```
**Success — 201:**
```json
{ "data": { "userId": "uuid-v4" } }
```
**Errors:**

| Code | HTTP | Trigger |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Zod schema failure — invalid email format, password policy violation |
| `EMAIL_TAKEN` | 422 | Email already registered (case-insensitive match) |

**Password policy:** minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit.  
**Email normalisation:** stored and matched as `email.toLowerCase()`.

---

### POST /api/auth/login
**Request body:**
```json
{ "email": "user@example.com", "password": "Secret123" }
```
**Success — 200:**
```json
{
  "data": {
    "accessToken": "jwt.header.payload.signature",
    "refreshToken": "uuid-v4-stored-in-db",
    "user": { "id": "uuid", "email": "user@example.com", "createdAt": "ISO8601" }
  }
}
```
**Errors:**

| Code | HTTP | Trigger |
| :--- | :--- | :--- |
| `VALIDATION_ERROR` | 400 | Missing or malformed fields |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password (generic — no enumeration) |

---

### POST /api/auth/logout
**Authorization:** `Bearer <accessToken>` (required)  
**Request body:**
```json
{ "refreshToken": "uuid-v4" }
```
**Success — 204:** no body  
**Errors:**

| Code | HTTP | Trigger |
| :--- | :--- | :--- |
| `UNAUTHORIZED` | 401 | Missing or invalid Bearer token |
| `TOKEN_EXPIRED` | 401 | Access token past 15-min expiry |

*Note: If the refresh token in the body is unknown or already revoked, silently succeeds (idempotent logout).*

---

### POST /api/auth/refresh
**No auth header required.**  
**Request body:**
```json
{ "refreshToken": "uuid-v4" }
```
**Success — 200:**
```json
{ "data": { "accessToken": "jwt.header.payload.signature" } }
```
**Rotation:** old token marked `revokedAt = now()`, new UUID token inserted, new token **not** returned in response (client retains old token reference — see Assumptions).  
**Errors:**

| Code | HTTP | Trigger |
| :--- | :--- | :--- |
| `REFRESH_INVALID` | 401 | Token not found in DB or already revoked |
| `REFRESH_EXPIRED` | 401 | Token found but `expiresAt` is past |

---

## FRS Requirements Covered

| FRS | Requirement | This ticket |
| :--- | :--- | :--- |
| §4.1.1 AC1 | Accept unique email + validated password | ✅ `registerSchema` Zod validation |
| §4.1.1 AC2 | Hash password with bcrypt before storage | ✅ `AuthService.register` |
| §4.1.1 AC3 | Return tokens on registration | ⚠️ **Descoped** — returns `{ userId }` only (AGENTS.md authority). Login call required. |
| §4.1.1 AC4 | Duplicate email → validation error | ✅ `EMAIL_TAKEN` 422 |
| §4.1.1 Pass rules | Min 8, uppercase, lowercase, digit | ✅ `registerSchema` |
| §4.1.2 AC1 | Correct credentials → access + refresh tokens | ✅ Login endpoint |
| §4.1.2 AC2 | Persist refresh token in DB | ✅ `RefreshTokenRepository.create` |
| §4.1.2 AC3 | Invalid credentials → generic error | ✅ `INVALID_CREDENTIALS` (no enumeration) |
| §4.1.3 AC1 | Invalidate refresh token from DB | ✅ `revokedAt` set on logout |
| §4.1.3 AC2 | Access token expires naturally | ✅ 15-min JWT expiry |
| §5.2.2 | Access 15 min, refresh 7 days | ✅ Token lifetimes |
| §5.2.3 | Refresh tokens stored in DB for revocation | ✅ `RefreshToken` model |
| §5.2.4 | Auth guard on all protected routes | ✅ `requireAuth` middleware |

---

## SDS Design Decisions

| SDS | Decision | Implementation |
| :--- | :--- | :--- |
| §6.1 | JWT HS256, userId + email payload | `signAccessToken` in `utils/token.ts` |
| §6.1 | Refresh via JSON body (overrides cookie mention) | Body `{ refreshToken }` — AGENTS.md authority |
| §6.2 | Rotation flow: old revoked, new issued | `revokedAt` + new row in `RefreshToken` |
| §6.2 | Token not found → HTTP 401 (force logout) | `REFRESH_INVALID` 401 |

---

## Architecture Decisions

**1. Password hashing — bcrypt salt rounds = 12**
Bcrypt with 12 rounds balances security and latency. At 12 rounds, hashing takes ~300–500ms — adequate for auth endpoints, well within the FRS §5.1 300ms NFR for standard operations (auth is excluded from that NFR by convention).

**2. Refresh token is a UUID v4, not a JWT**
Refresh tokens are opaque UUIDs stored in DB. This allows server-side revocation without maintaining a blocklist. JWTs would require a blocklist to revoke, which is more complex.

**3. Generic INVALID_CREDENTIALS for both "user not found" and "wrong password"**
FRS §4.1.2 AC3 explicitly requires this to "prevent email harvesting". The service must query the user first; if not found, still run a dummy bcrypt check to prevent timing attacks.

**4. Idempotent logout**
If the provided refresh token is already revoked or not found, logout still returns 204. The client's intent (end session) is fulfilled regardless of DB state.

**5. FRS §4.1.1 AC3 descoped — register returns `{ userId }` not tokens**
AGENTS.md (the runtime authority per CLAUDE.md) specifies `{ userId }` only. This forces a login call after registration — a UX tradeoff accepted in exchange for a simpler auth flow and cleaner separation of registration from session creation. Noted as an explicit divergence.

---

## Assumptions

1. `JWT_SECRET` env var is set and non-empty (enforced in `utils/token.ts` startup check).
2. Email is stored lowercase; matching is done against `email.toLowerCase()`.
3. Refresh token rotation is silent — the new token is stored in DB but not returned to the client. The client uses the same token value until it expires or is revoked. *(This deviates from SDS §6.2 which shows a new token returned — see Decision A3 above.)*
4. Clock skew on JWT verification is not handled (no `clockTolerance` option). Tokens expire exactly at `iat + 15m`.
5. `prisma generate` runs before any backend start (handled by `postinstall` or manual step).
