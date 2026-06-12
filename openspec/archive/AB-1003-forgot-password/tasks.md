# Tasks — AB-1003: Forgot Password + OTP Reset

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Shared Package

- [ ] Add `OTP_EXPIRED` and `OTP_INVALID` to `packages/shared/src/errors.ts`
- [ ] Add `forgotPasswordSchema` to `packages/shared/src/schemas/index.ts`
- [ ] Add `resetPasswordSchema` to `packages/shared/src/schemas/index.ts`
- [ ] Add `TForgotPasswordInput` inferred type to `packages/shared/src/schemas/index.ts`
- [ ] Add `TResetPasswordInput` inferred type to `packages/shared/src/schemas/index.ts`
- [ ] Add `IMessageResponse` interface to `packages/shared/src/types/index.ts`
- [ ] Verify all new exports are re-exported from `packages/shared/src/index.ts` (already exports `*` from each — no change needed, just confirm)

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Database

- [ ] Add `OtpToken` model to `apps/backend/prisma/schema.prisma` (id, userId, hashedOtp, expiresAt, createdAt, user relation, `@@index([userId])`)
- [ ] Add `otpTokens OtpToken[]` relation field to `User` model in `schema.prisma`
- [ ] Run migration: `pnpm --filter backend prisma migrate dev --name add_otp_token`
- [ ] Verify Prisma client regenerated: `pnpm --filter backend prisma generate`

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Repository Layer

- [ ] Create `apps/backend/src/repositories/OtpTokenRepository.ts`
- [ ] Implement `deleteAllByUserId(userId)` — `deleteMany` where userId, clears old OTPs before creating new one
- [ ] Implement `create({ userId, hashedOtp, expiresAt })` — inserts new row, returns mapped `IOtpTokenRecord`
- [ ] Implement `findByUserId(userId)` — `findFirst` where userId, returns `IOtpTokenRecord | null`
- [ ] Implement `deleteById(id)` — `delete` where id, used after successful reset
- [ ] Map all Prisma results to `IOtpTokenRecord` (no raw Prisma objects returned)
- [ ] Modify `apps/backend/src/repositories/UserRepository.ts` — add `updatePasswordHash(userId, passwordHash): Promise<void>`
- [ ] Modify `apps/backend/src/repositories/RefreshTokenRepository.ts` — add `revokeAllByUserId(userId): Promise<void>` using `updateMany` where `{ userId, revokedAt: null }`

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — Service Layer

- [ ] Modify `apps/backend/src/services/AuthService.ts` — add `import { randomInt } from "crypto"`
- [ ] Add `OTP_TTL_MS = 10 * 60 * 1000` constant
- [ ] Add `OtpTokenRepository` import
- [ ] Implement `forgotPassword(input: TForgotPasswordInput): Promise<IMessageResponse>`
  - [ ] Lowercase email, look up user
  - [ ] If user not found: return message immediately (no error, no log — anti-enumeration S2)
  - [ ] Call `OtpTokenRepository.deleteAllByUserId` (invalidate old OTP — S3)
  - [ ] Generate OTP via `randomInt(0, 1_000_000)` padded to 6 digits
  - [ ] Bcrypt-hash OTP, insert via `OtpTokenRepository.create` with `expiresAt = now + OTP_TTL_MS`
  - [ ] `console.log` plaintext OTP only when user exists
  - [ ] Return `{ message: "If that email is registered, an OTP has been sent." }`
- [ ] Implement `resetPassword(input: TResetPasswordInput): Promise<IMessageResponse>`
  - [ ] Lowercase email, look up user — throw `OTP_INVALID` 400 if not found (S10)
  - [ ] `OtpTokenRepository.findByUserId` — throw `OTP_INVALID` 400 if null (S9)
  - [ ] Check `otpRecord.expiresAt < new Date()` — throw `OTP_EXPIRED` 410 if true (S7)
  - [ ] `bcrypt.compare(input.otp, otpRecord.hashedOtp)` — throw `OTP_INVALID` 400 if false (S8)
  - [ ] `bcrypt.hash(input.newPassword, BCRYPT_ROUNDS)` — hash new password
  - [ ] `UserRepository.updatePasswordHash(user.id, newHash)` (S6)
  - [ ] `OtpTokenRepository.deleteById(otpRecord.id)` — single-use destroy (S13)
  - [ ] `RefreshTokenRepository.revokeAllByUserId(user.id)` — force re-auth (S14)
  - [ ] Return `{ message: "Password reset successfully." }`
- [ ] Verify: no `prisma` import in `AuthService.ts`
- [ ] Verify: no `req`/`res`/`Request`/`Response` in `AuthService.ts`

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — Route Layer

- [ ] Modify `apps/backend/src/routes/authRoutes.ts` — add imports for `forgotPasswordSchema`, `resetPasswordSchema`, `TForgotPasswordInput`, `TResetPasswordInput` from `@noteapp/shared`
- [ ] Add `POST /forgot-password` route — `validate(forgotPasswordSchema)`, call `AuthService.forgotPassword`, respond `200 { data: result }`
- [ ] Add `POST /reset-password` route — `validate(resetPasswordSchema)`, call `AuthService.resetPassword`, respond `200 { data: result }`
- [ ] Verify: no `requireAuth` middleware on either route (both are public)
- [ ] Verify: no business logic in route handlers
- [ ] Verify: no Prisma import in `authRoutes.ts`
- [ ] No changes needed to `app.ts` — routes mount via existing `/api/auth` registration

**Checkpoint 5:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Pass it the spec, plan, and all modified implementation files.

**Unit tests** (`apps/backend/src/__tests__/unit/services/`):

- [ ] `AuthService.forgotPassword.test.ts` — mock `UserRepository`, `OtpTokenRepository`, `bcrypt`, `crypto.randomInt`
  - [ ] AC-S1: registered email — OTP created, console.log called, message returned
  - [ ] AC-S2: unknown email — message returned, no OTP created, console.log not called
  - [ ] AC-S3: second request invalidates first OTP — deleteAllByUserId called before create
  - [ ] AC-S4: missing email field — caught by Zod (route-level, integration only)
  - [ ] AC-S5: invalid email format — caught by Zod (route-level, integration only)

- [ ] `AuthService.resetPassword.test.ts` — mock `UserRepository`, `OtpTokenRepository`, `RefreshTokenRepository`, `bcrypt`
  - [ ] AC-S6: valid email + valid OTP + valid password — password updated, OTP deleted, refresh tokens revoked, message returned
  - [ ] AC-S7: expired OTP — throws OTP_EXPIRED (410)
  - [ ] AC-S8: wrong OTP (hash mismatch) — throws OTP_INVALID (400)
  - [ ] AC-S9: no OTP record for email — throws OTP_INVALID (400)
  - [ ] AC-S10: unknown email — throws OTP_INVALID (400)
  - [ ] AC-S11: password fails strength rules — caught by Zod (route-level, integration only)
  - [ ] AC-S12: missing required fields — caught by Zod (route-level, integration only)
  - [ ] AC-S13: OTP single-use — deleteById called, second call returns OTP_INVALID
  - [ ] AC-S14: refresh tokens revoked — revokeAllByUserId called with correct userId

**Integration tests** (`apps/backend/src/__tests__/integration/routes/`):

- [ ] `auth.forgotPassword.test.ts` — Supertest against real DB
  - [ ] AC-S1: registered email — 200, correct message body, OtpToken row exists in DB
  - [ ] AC-S2: unknown email — 200, same message body, no OtpToken row created
  - [ ] AC-S3: second request — 200, only one OtpToken row exists in DB after two calls
  - [ ] AC-S4: missing email — 400 `VALIDATION_ERROR`, `fields: ["email"]`
  - [ ] AC-S5: invalid email format — 400 `VALIDATION_ERROR`, `fields: ["email"]`

- [ ] `auth.resetPassword.test.ts` — Supertest against real DB
  - [ ] AC-S6: valid OTP + valid password — 200, `{ data: { message: "Password reset successfully." } }`, user can log in with new password
  - [ ] AC-S7: expired OTP — 410, `res.body.error.code === "OTP_EXPIRED"`
  - [ ] AC-S8: wrong OTP — 400, `res.body.error.code === "OTP_INVALID"`
  - [ ] AC-S9: no OTP record — 400, `res.body.error.code === "OTP_INVALID"`
  - [ ] AC-S10: unknown email — 400, `res.body.error.code === "OTP_INVALID"`
  - [ ] AC-S11: password fails strength — 400, `res.body.error.code === "VALIDATION_ERROR"`, `fields: ["newPassword"]`
  - [ ] AC-S12: missing fields — 400, `res.body.error.code === "VALIDATION_ERROR"`
  - [ ] AC-S13: OTP cannot be reused — second reset with same OTP returns 400 `OTP_INVALID`
  - [ ] AC-S14: refresh tokens revoked — after reset, `POST /api/auth/refresh` with old token returns 401 `REFRESH_INVALID`

**Checkpoint 6 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on new/modified files
