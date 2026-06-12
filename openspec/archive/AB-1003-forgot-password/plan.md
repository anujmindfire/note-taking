# Plan — AB-1003: Forgot Password + OTP Reset

**Based on spec:** openspec/changes/AB-1003-forgot-password/spec.md
**Spec status:** Approved

---

## Phase 1 — Shared Package

Files to modify in `packages/shared/src/`:

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `src/errors.ts` | Add `OTP_EXPIRED`, `OTP_INVALID` |
| MODIFY | `src/schemas/index.ts` | Add `forgotPasswordSchema`, `resetPasswordSchema` and their inferred types |
| MODIFY | `src/types/index.ts` | Add `IMessageResponse` interface |

### Exact changes to `src/errors.ts`

Append to the `ErrorCode` object:

```typescript
OTP_EXPIRED: "OTP_EXPIRED",  // 410 — OtpToken row exists but expiresAt < now
OTP_INVALID: "OTP_INVALID",  // 400 — wrong OTP, no record, or unknown email
```

### Exact changes to `src/schemas/index.ts`

Reuse the same password regex already defined for `registerSchema`. Append:

```typescript
export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6).regex(/^\d{6}$/, "OTP must be a 6-digit number"),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[a-z]/, "Must contain lowercase")
    .regex(/[0-9]/, "Must contain digit"),
});

export type TForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type TResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

### Exact changes to `src/types/index.ts`

Append:

```typescript
export interface IMessageResponse {
  message: string;
}
```

**Checkpoint 1:**
```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 2 — Database

**Migration name:** `add_otp_token`
**Migration is:** ADDITIVE — new table and index only, no existing columns modified or dropped.

### Changes to `apps/backend/prisma/schema.prisma`

**Add new model:**

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

**Modify `User` model** — add relation field (no new column, Prisma relation only):

```prisma
otpTokens  OtpToken[]
```

**Run migration:**

```bash
pnpm --filter backend prisma migrate dev --name add_otp_token
pnpm --filter backend prisma generate
```

**Checkpoint 2:**
```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 3 — Repository Layer

| Action | File | Methods |
|--------|------|---------|
| CREATE | `apps/backend/src/repositories/OtpTokenRepository.ts` | `deleteAllByUserId`, `create`, `findByUserId`, `deleteById` |
| MODIFY | `apps/backend/src/repositories/UserRepository.ts` | Add `updatePasswordHash` |
| MODIFY | `apps/backend/src/repositories/RefreshTokenRepository.ts` | Add `revokeAllByUserId` |

---

### `OtpTokenRepository.ts` — full file

Internal record type (not exported — internal to this repository):

```typescript
interface IOtpTokenRecord {
  id: string;
  userId: string;
  hashedOtp: string;
  expiresAt: Date;
  createdAt: Date;
}
```

Methods:

**`deleteAllByUserId(userId: string): Promise<void>`**
- Prisma: `prisma.otpToken.deleteMany({ where: { userId } })`
- Used before creating a new OTP to enforce one-OTP-per-user invariant

**`create(data: { userId: string; hashedOtp: string; expiresAt: Date }): Promise<IOtpTokenRecord>`**
- Prisma: `prisma.otpToken.create({ data })`
- Returns mapped domain type (never raw Prisma object)

**`findByUserId(userId: string): Promise<IOtpTokenRecord | null>`**
- Prisma: `prisma.otpToken.findFirst({ where: { userId } })`
- Returns `null` if no record exists

**`deleteById(id: string): Promise<void>`**
- Prisma: `prisma.otpToken.delete({ where: { id } })`
- Called immediately after successful password reset (S13 — OTP single-use)

---

### `UserRepository.ts` — add method

**`updatePasswordHash(userId: string, passwordHash: string): Promise<void>`**
- Prisma: `prisma.user.update({ where: { id: userId }, data: { passwordHash } })`
- No return value needed

---

### `RefreshTokenRepository.ts` — add method

**`revokeAllByUserId(userId: string): Promise<void>`**
- Prisma: `prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } })`
- Single `updateMany` — revokes all active sessions in one query (S14 scenario)

**Checkpoint 3:**
```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 4 — Service Layer

| Action | File | Methods to add |
|--------|------|---------------|
| MODIFY | `apps/backend/src/services/AuthService.ts` | `forgotPassword`, `resetPassword` |

Add constants at top of `AuthService.ts`:

```typescript
import { randomInt } from "crypto";
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
```

---

### `AuthService.forgotPassword(input: TForgotPasswordInput): Promise<IMessageResponse>`

Business rules:
1. Lowercase the email
2. Look up user via `UserRepository.findByEmail`
3. If user **not found**: return `{ message }` immediately — no error, no log (anti-enumeration, S2)
4. If user **found**:
   - `OtpTokenRepository.deleteAllByUserId(user.id)` — invalidates old OTP (S3)
   - Generate OTP: `String(randomInt(0, 1_000_000)).padStart(6, '0')`
   - `bcrypt.hash(plainOtp, BCRYPT_ROUNDS)` — hash before storage
   - `OtpTokenRepository.create({ userId, hashedOtp, expiresAt: now + 10min })`
   - `console.log(`[OTP] Reset code for ${email}: ${plainOtp}`)` — console only, never in response
5. Return `{ message: "If that email is registered, an OTP has been sent." }` in all cases

Throws: nothing — always resolves with `IMessageResponse`

---

### `AuthService.resetPassword(input: TResetPasswordInput): Promise<IMessageResponse>`

Business rules (in this exact order per spec error precedence):
1. Lowercase the email
2. `UserRepository.findByEmail(email)` → if null: throw `OTP_INVALID` 400 (S10)
3. `OtpTokenRepository.findByUserId(user.id)` → if null: throw `OTP_INVALID` 400 (S9)
4. Check `otpRecord.expiresAt < new Date()` → if expired: throw `OTP_EXPIRED` 410 (S7)
5. `bcrypt.compare(input.otp, otpRecord.hashedOtp)` → if false: throw `OTP_INVALID` 400 (S8)
6. All checks passed — execute reset:
   - `bcrypt.hash(input.newPassword, BCRYPT_ROUNDS)`
   - `UserRepository.updatePasswordHash(user.id, newHash)`
   - `OtpTokenRepository.deleteById(otpRecord.id)` — single-use guarantee (S13)
   - `RefreshTokenRepository.revokeAllByUserId(user.id)` — force re-auth (S14)
7. Return `{ message: "Password reset successfully." }`

Throws: `OTP_INVALID` (400), `OTP_EXPIRED` (410)

No Prisma imports. No `req`/`res`. Calls repositories only.

**Checkpoint 4:**
```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 5 — Route Layer

| Action | File | Routes added |
|--------|------|-------------|
| MODIFY | `apps/backend/src/routes/authRoutes.ts` | `POST /forgot-password`, `POST /reset-password` |

No new files needed — both routes mount on the existing `authRoutes` router already registered at `/api/auth` in `app.ts`.

**No `requireAuth` middleware on either route** — both are public endpoints.

```typescript
router.post("/forgot-password", validate(forgotPasswordSchema), async (req, res, next) => {
  try {
    const result = await AuthService.forgotPassword(req.body as TForgotPasswordInput);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const result = await AuthService.resetPassword(req.body as TResetPasswordInput);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});
```

Import additions needed in `authRoutes.ts`:

```typescript
import { forgotPasswordSchema, resetPasswordSchema } from "@noteapp/shared";
import type { TForgotPasswordInput, TResetPasswordInput } from "@noteapp/shared";
```

**Checkpoint 5:**
```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 6 — Tests

Delegated to the **test-writer agent**. Pass it:
- `openspec/changes/AB-1003-forgot-password/spec.md` — 14 scenarios (S1–S14)
- The 4 implementation files above
- Existing test files as pattern reference

| File | Type | Scenarios |
|------|------|-----------|
| `apps/backend/src/__tests__/unit/services/AuthService.forgotPassword.test.ts` | Unit | S1, S2, S3, S4, S5 |
| `apps/backend/src/__tests__/unit/services/AuthService.resetPassword.test.ts` | Unit | S6, S7, S8, S9, S10, S11, S12, S13, S14 |
| `apps/backend/src/__tests__/integration/routes/auth.forgotPassword.test.ts` | Integration | S1, S2, S3, S4, S5 |
| `apps/backend/src/__tests__/integration/routes/auth.resetPassword.test.ts` | Integration | S6, S7, S8, S9, S10, S11, S12, S13, S14 |

**Checkpoint 6 (final):**
```bash
pnpm build
pnpm lint --max-warnings 0
pnpm test
pnpm test --coverage    # ≥80% on new/modified files
```

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|----------------|-----------|
| R1 | `deleteAllByUserId` + `create` are two separate queries — theoretical race condition if two requests arrive simultaneously | Acceptable for this scope; no `@@unique([userId])` constraint needed given tutorial context |
| R2 | `bcrypt.compare` on a 6-digit OTP space (1,000,000 values) is brute-force-able | Mitigated by 10-minute TTL and single-use deletion; rate limiting deferred to a later ticket |
| R3 | `UserRepository.updatePasswordHash` uses `update` which throws if the user is not found at DB level | User existence is already confirmed earlier in `resetPassword` service method — no orphan possible |
| R4 | Existing `AuthService.test.ts` may need to be split or extended | Use separate test files per method to keep files focused |
