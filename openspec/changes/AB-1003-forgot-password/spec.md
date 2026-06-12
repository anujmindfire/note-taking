# Spec — AB-1003: Forgot Password + OTP Reset

**Status:** Draft — awaiting approval
**Ticket:** AB-1003
**Branch:** feature/backend/AB-1003-forgot-password
**FRS References:** §4.1.4, §4.1.5, §5.2 (security/rate-limiting note)
**SDS References:** §6.3 (OTP details)
**Layer:** Backend only
**Depends on:** AB-1001 (auth scaffold — User, RefreshToken models, bcrypt, JWT utils)

---

## Summary

Implement the two-step forgot-password flow: a user submits their email to receive a 6-digit OTP (logged to console), then submits that OTP alongside a new password to reset their credentials. The endpoint always returns HTTP 200 on the first step regardless of whether the email is registered (anti-enumeration). On successful reset, all active refresh tokens for that user are revoked and the OTP is destroyed. A new `OtpToken` table persists hashed OTPs with a 10-minute TTL.

---

## In Scope

- `POST /api/auth/forgot-password` — generate OTP, log to console, always 200
- `POST /api/auth/reset-password` — validate OTP, update password hash, revoke all refresh tokens
- `OtpToken` Prisma model with `userId`, `hashedOtp`, `expiresAt`
- New error codes: `OTP_EXPIRED` (410), `OTP_INVALID` (400)
- New shared types: `IForgotPasswordRequest`, `IResetPasswordRequest`
- New shared Zod schemas: `forgotPasswordSchema`, `resetPasswordSchema`

## Out of Scope

- Email delivery (SMTP) — OTP is console-logged only per FRS §6 assumption 3
- IP-based rate limiting on these endpoints — deferred to a later infrastructure ticket
- "Same password as old" rejection — FRS is silent; accept silently
- Frontend pages or UI components
- OTP audit trail / soft-delete of OTP rows

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | OTP is a cryptographically random 6-digit numeric string (`Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')` seeded via `crypto.randomInt`) | SDS §6.3 |
| A2 | OTP is bcrypt-hashed before storage — consistent with password storage and SDS §6.3 "hashed string" | SDS §6.3, project convention |
| A3 | `OtpToken` table uses one-row-per-user: generating a new OTP hard-deletes all existing OTP rows for that `userId` before inserting | FRS §4.1.4 AC3, user answer |
| A4 | `/forgot-password` console-logs the plaintext OTP only when the email maps to a real user | User answer (prevents log-based enumeration) |
| A5 | `/reset-password` returns `OTP_INVALID` (400) for all failure cases except expiry: wrong OTP, no OTP record, unknown email — same code prevents enumeration | User answer |
| A6 | Refresh token revocation on reset marks `revokedAt = now()` on all non-revoked `RefreshToken` rows for the user — consistent with the logout revocation path | User answer |
| A7 | Resetting to the same password as the current one is accepted silently | User answer |
| A8 | OTP row is hard-deleted immediately after successful password reset (single-use guarantee) | FRS §4.1.5 AC4 |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| **Forgot Password** | | | | | | |
| S1 | Registered email — OTP created | User exists in DB | `POST /api/auth/forgot-password { email }` | HTTP 200 `{ data: { message: "If that email is registered, an OTP has been sent." } }`, new `OtpToken` row created, plaintext OTP logged to server console | §4.1.4 AC1, AC2 | — |
| S2 | Unknown email — anti-enumeration | No user with that email | `POST /api/auth/forgot-password { email }` | HTTP 200, same response body as S1, no OtpToken created, nothing logged | §4.1.4 Note | — |
| S3 | Second request invalidates first OTP | User has an existing `OtpToken` | `POST /api/auth/forgot-password { email }` again | HTTP 200, old OtpToken row deleted, new OtpToken row created with fresh 10-min expiry | §4.1.4 AC3 | — |
| S4 | Missing email field | — | `POST /api/auth/forgot-password {}` | HTTP 400 `VALIDATION_ERROR`, `fields: ["email"]` | §4.1.4 | VALIDATION_ERROR |
| S5 | Invalid email format | — | `POST /api/auth/forgot-password { email: "notanemail" }` | HTTP 400 `VALIDATION_ERROR`, `fields: ["email"]` | §4.1.4 | VALIDATION_ERROR |
| **Reset Password** | | | | | | |
| S6 | Valid OTP + valid new password | User has unexpired OtpToken | `POST /api/auth/reset-password { email, otp, newPassword }` | HTTP 200 `{ data: { message: "Password reset successfully." } }`, `User.passwordHash` updated, OtpToken row deleted, all non-revoked `RefreshToken` rows for user have `revokedAt` set | §4.1.5 AC1–AC4 | — |
| S7 | Expired OTP | OtpToken exists but `expiresAt` < now | `POST /api/auth/reset-password { email, otp, newPassword }` | HTTP 410 `OTP_EXPIRED` | §4.1.4 error table | OTP_EXPIRED |
| S8 | Wrong OTP (hash mismatch) | OtpToken exists, OTP is wrong | `POST /api/auth/reset-password { email, otp: "000000", newPassword }` | HTTP 400 `OTP_INVALID` | §4.1.4 error table | OTP_INVALID |
| S9 | No OTP record for email | User exists, no OtpToken row | `POST /api/auth/reset-password { email, otp, newPassword }` | HTTP 400 `OTP_INVALID` | §4.1.5 AC1 | OTP_INVALID |
| S10 | Unknown email | No user with that email | `POST /api/auth/reset-password { email, otp, newPassword }` | HTTP 400 `OTP_INVALID` (same as S9 — no enumeration) | §4.1.5 AC1 | OTP_INVALID |
| S11 | Password fails strength rules | Valid OTP | `POST /api/auth/reset-password { email, otp, newPassword: "weak" }` | HTTP 400 `VALIDATION_ERROR`, `fields: ["newPassword"]` | §4.1.5 AC2, §4.1.1 password rules | VALIDATION_ERROR |
| S12 | Missing required fields | — | `POST /api/auth/reset-password {}` | HTTP 400 `VALIDATION_ERROR`, `fields` lists missing fields | §4.1.5 | VALIDATION_ERROR |
| S13 | OTP single-use — cannot be reused | S6 was just completed | `POST /api/auth/reset-password` with same OTP again | HTTP 400 `OTP_INVALID` (row was deleted) | §4.1.5 AC4 | OTP_INVALID |
| S14 | Refresh tokens revoked after reset | User had 2 active sessions | S6 completed | Subsequent `POST /api/auth/refresh` with old refresh token returns 401 `REFRESH_INVALID` | §4.1.5 AC3 | REFRESH_INVALID |

---

## API Contract

### POST /api/auth/forgot-password

**Auth required:** No
**Request body:**
```json
{
  "email": "string — registered email address"
}
```
**Success response:** HTTP 200
```json
{
  "data": {
    "message": "If that email is registered, an OTP has been sent."
  }
}
```
**Server side effect:** If email maps to a real user — delete all existing `OtpToken` rows for that user, generate cryptographically random 6-digit OTP via `crypto.randomInt(0, 1_000_000)`, bcrypt-hash it, insert `OtpToken` row with `expiresAt = now + 10 minutes`, `console.log` the plaintext OTP.

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing or malformed `email` field |

---

### POST /api/auth/reset-password

**Auth required:** No
**Request body:**
```json
{
  "email": "string — the user's registered email",
  "otp": "string — the 6-digit code from console log",
  "newPassword": "string — must satisfy password strength rules"
}
```
**Password strength rules (same as registration):** min 8 chars, at least one uppercase, one lowercase, one digit.

**Success response:** HTTP 200
```json
{
  "data": {
    "message": "Password reset successfully."
  }
}
```
**Server side effect:** Bcrypt-hash `newPassword`, update `User.passwordHash`, hard-delete `OtpToken` row, set `revokedAt = now()` on all non-revoked `RefreshToken` rows for that user.

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing fields or `newPassword` fails strength rules |
| 400 | `OTP_INVALID` | OTP hash mismatch, no OtpToken row exists, or unknown email |
| 410 | `OTP_EXPIRED` | OtpToken row exists but `expiresAt` < now |

**Error precedence:** Zod validation runs first. If fields are valid, look up user → if not found, return `OTP_INVALID`. If user found, look up OtpToken → if none, `OTP_INVALID`. If found, check expiry → `OTP_EXPIRED`. Then compare hash → `OTP_INVALID` on mismatch. Proceed with reset only if all pass.

---

## Database Changes

### New model: `OtpToken`

```prisma
model OtpToken {
  id         String   @id @default(uuid())
  userId     String
  hashedOtp  String
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

### Modified model: `User`

Add relation field (no migration column — Prisma relation only):
```prisma
otpTokens OtpToken[]
```

**Migration:** Additive only — new table, new index, new relation. No existing columns dropped or altered.

---

## Shared Package Changes

### `packages/shared/src/types/auth.ts` (new file or extend existing)

```typescript
export interface IForgotPasswordRequest {
  email: string;
}

export interface IResetPasswordRequest {
  email: string;
  otp: string;
  newPassword: string;
}

export interface IMessageResponse {
  message: string;
}
```

### `packages/shared/src/schemas/auth.ts` (new file or extend existing)

```typescript
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Must contain uppercase')
    .regex(/[a-z]/, 'Must contain lowercase')
    .regex(/[0-9]/, 'Must contain digit'),
});
```

### `packages/shared/src/errors.ts` (extend)

```typescript
OTP_EXPIRED: "OTP_EXPIRED",   // 410 — OTP exists but past expiresAt
OTP_INVALID: "OTP_INVALID",   // 400 — wrong OTP, no record, or unknown email
```

---

## Architecture Notes

**OTP comparison:** bcrypt compare is async and timing-safe — use `bcrypt.compare(plainOtp, hashedOtp)`. Do not use string equality.

**`crypto.randomInt`:** Use Node's built-in `crypto.randomInt(0, 1_000_000)` for cryptographic randomness, then `String(n).padStart(6, '0')` to get the 6-digit string. Do not use `Math.random()`.

**Refresh token revocation:** The service calls `RefreshTokenRepository.revokeAllForUser(userId)` which issues a single `updateMany` with `where: { userId, revokedAt: null }` — existing logout path issues one-at-a-time; this ticket adds the bulk variant.

**No auth guard on these routes:** Both endpoints are public. They must NOT use the `authenticate` middleware.
