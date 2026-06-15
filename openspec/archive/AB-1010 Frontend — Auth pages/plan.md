# Plan — AB-1010: Frontend — Auth Pages

**Based on spec:** `openspec/changes/AB-1010 Frontend — Auth pages/spec.md`
**Spec status:** Approved

---

## Phase 1 — Frontend Scaffold

Files to create/modify in `apps/frontend/`:

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `package.json` | Add tailwindcss, postcss, autoprefixer, shadcn/ui deps, react-hook-form, @hookform/resolvers, @tiptap/react, @tiptap/starter-kit, sonner, clsx, tailwind-merge, class-variance-authority, lucide-react, Radix UI primitives |
| CREATE | `tailwind.config.ts` | Content paths, darkMode: "class", theme extensions |
| CREATE | `postcss.config.js` | tailwindcss + autoprefixer plugins |
| CREATE | `components.json` | shadcn/ui config (style: default, rsc: false, tsx: true, aliases) |
| MODIFY | `src/index.css` | Replace with Tailwind directives (`@tailwind base/components/utilities`) + CSS variables for shadcn/ui theming |
| MODIFY | `vite.config.ts` | Add path alias: `"@"` → `"./src"` via `resolve.alias` |
| MODIFY | `tsconfig.json` | Add `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }` |
| CREATE | `src/lib/utils.ts` | `cn(...inputs: ClassValue[])` using clsx + tailwind-merge |
| CREATE | `src/components/ui/button.tsx` | shadcn Button (variant: default, destructive, outline, ghost, link) |
| CREATE | `src/components/ui/input.tsx` | shadcn Input |
| CREATE | `src/components/ui/label.tsx` | shadcn Label (wraps Radix Label) |
| CREATE | `src/components/ui/card.tsx` | shadcn Card + CardHeader + CardContent + CardFooter |
| CREATE | `src/components/ui/dialog.tsx` | shadcn Dialog (wraps Radix Dialog) |

**New dependencies (exact additions to `package.json`):**

```json
"dependencies": {
  "react-hook-form": "7.54.2",
  "@hookform/resolvers": "3.9.1",
  "@tiptap/react": "2.10.3",
  "@tiptap/starter-kit": "2.10.3",
  "@tiptap/pm": "2.10.3",
  "sonner": "1.7.4",
  "clsx": "2.1.1",
  "tailwind-merge": "2.6.0",
  "class-variance-authority": "0.7.1",
  "lucide-react": "0.469.0",
  "@radix-ui/react-dialog": "1.1.4",
  "@radix-ui/react-label": "2.1.1",
  "@radix-ui/react-slot": "1.1.2"
},
"devDependencies": {
  "tailwindcss": "3.4.17",
  "autoprefixer": "10.4.20",
  "postcss": "8.4.49"
}
```

**Checkpoint 1:** `pnpm build` — 0 errors | `pnpm lint --max-warnings 0`

---

## Phase 2 — Mutation Hooks

Files to create in `apps/frontend/src/`:

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `lib/errorUtils.ts` | `getErrorMessage(err: unknown): string` — extracts message from Axios error |
| CREATE | `hooks/useLogin.ts` | `useMutation` → POST /auth/login → `setAuth` + navigate to /notes |
| CREATE | `hooks/useRegister.ts` | `useMutation` → POST /auth/register → returns `IRegisterResponse` (no store update) |
| CREATE | `hooks/useForgotPassword.ts` | `useMutation` → POST /auth/forgot-password |
| CREATE | `hooks/useResetPassword.ts` | `useMutation` → POST /auth/reset-password |
| CREATE | `hooks/useLogout.ts` | `useMutation` → POST /auth/logout → `clearAuth` + navigate to /login |

**Hook signatures:**

```typescript
// lib/errorUtils.ts
export function getErrorMessage(err: unknown): string
// Extracts err.response.data.error.message; falls back to "Something went wrong"

// hooks/useLogin.ts
export function useLogin(): UseMutationResult<IAuthResponse, Error, TLoginInput>
// onSuccess: setAuth(data.accessToken, data.user) + navigate("/notes")
// onError: toast.error(getErrorMessage(err))

// hooks/useRegister.ts
export function useRegister(): UseMutationResult<IRegisterResponse, Error, TRegisterInput>
// No store update — caller chains useLogin after success
// onError: toast.error(getErrorMessage(err))

// hooks/useForgotPassword.ts
export function useForgotPassword(): UseMutationResult<IMessageResponse, Error, TForgotPasswordInput>
// onError: toast.error(getErrorMessage(err))

// hooks/useResetPassword.ts
export function useResetPassword(): UseMutationResult<IMessageResponse, Error, TResetPasswordInput>
// onError: toast.error(getErrorMessage(err))

// hooks/useLogout.ts
export function useLogout(): UseMutationResult<void, Error, void>
// onSuccess: clearAuth() + navigate("/login")
// onError: clearAuth() + navigate("/login") — always clears even on 401
```

All hooks:
- Use `api` from `src/lib/api.ts` (never raw `axios`)
- Import input types from `@noteapp/shared`
- Import response types from `@noteapp/shared`

**Checkpoint 2:** `pnpm build` — 0 errors | `pnpm lint --max-warnings 0`

---

## Phase 3 — Page Components

Files to create in `apps/frontend/src/`:

| Action | File | Routes |
|--------|------|--------|
| CREATE | `pages/LoginPage.tsx` | `/login` |
| CREATE | `pages/RegisterPage.tsx` | `/register` |
| CREATE | `components/ForgotPasswordModal.tsx` | Modal on `/login` |

**LoginPage.tsx:**
- `useForm<TLoginInput>({ resolver: zodResolver(loginSchema) })`
- Fields: `email` (Input), `password` (Input type="password")
- Submit → `loginMutation.mutate(data)` (from `useLogin`)
- Validation errors caught by `handleSubmit` — toast shown via `useLogin` `onError`
- "Forgot password?" button → sets `modalOpen = true`
- Renders `<ForgotPasswordModal open={modalOpen} onOpenChange={setModalOpen} />`
- Footer link: "Don't have an account? Register" → `/register`

**RegisterPage.tsx:**
- `useForm<TRegisterInput>({ resolver: zodResolver(registerSchema) })`
- Fields: `email` (Input), `password` (Input type="password")
- Submit sequence:
  1. `registerMutation.mutate(data)`
  2. On success → `loginMutation.mutate({ email: data.email, password: data.password })`
  3. `useLogin` `onSuccess` handles auth store + navigation
- Footer link: "Already have an account? Login" → `/login`

**ForgotPasswordModal.tsx:**
- Props: `open: boolean`, `onOpenChange: (open: boolean) => void`
- Internal state: `step: 1 | 2`, `submittedEmail: string`
- Step 1 form: `useForm<TForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })`
  - Field: `email`
  - Submit → `forgotMutation.mutate({ email })` → on success set `submittedEmail` + `setStep(2)`
- Step 2 form: `useForm<{ otp: string; newPassword: string }>({ resolver: zodResolver(step2Schema) })`
  - Fields: `otp` (6 digits), `newPassword`
  - Submit → `resetMutation.mutate({ email: submittedEmail, otp, newPassword })`
  - On success → `onOpenChange(false)` + `toast.success("Password reset successfully")`
  - On error → toast shown; modal stays on Step 2
- Step 2 local Zod schema (`step2Schema`): `z.object({ otp: z.string().length(6).regex(/^\d{6}$/), newPassword: resetPasswordSchema.shape.newPassword })`

**Checkpoint 3:** `pnpm build` — 0 errors | `pnpm lint --max-warnings 0`

---

## Phase 4 — App Wiring

Files to modify:

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `apps/frontend/src/App.tsx` | Add `GuestRoute`; replace placeholder divs with real components |
| MODIFY | `apps/frontend/src/main.tsx` | Add `<Toaster />` from sonner |

**Updated App.tsx route structure:**

```tsx
<Routes>
  <Route path="/login"    element={<GuestRoute><LoginPage /></GuestRoute>} />
  <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
  <Route path="/notes"    element={<ProtectedRoute><div>Notes — coming soon</div></ProtectedRoute>} />
  <Route path="*"         element={<Navigate to="/notes" replace />} />
</Routes>
```

**Updated main.tsx:**

```tsx
import { Toaster } from "sonner";
// Inside render:
<Toaster position="top-right" richColors />
```

**Checkpoint 4:** `pnpm build` — 0 errors | `pnpm lint --max-warnings 0`

---

## Phase 5 — Tests

Add to `apps/frontend/package.json` devDependencies:

```json
"vitest": "2.1.8",
"@vitest/coverage-v8": "2.1.8",
"@testing-library/react": "16.1.0",
"@testing-library/user-event": "14.5.2",
"@testing-library/jest-dom": "6.6.3",
"jsdom": "25.0.1",
"msw": "2.7.0"
```

Add scripts to `apps/frontend/package.json`:

```json
"test": "vitest run",
"test:coverage": "vitest run --coverage"
```

Files to create:

| File | Type | Scenarios covered |
|------|------|-------------------|
| `apps/frontend/vitest.config.ts` | Config | — |
| `apps/frontend/src/setupTests.ts` | Setup | — |
| `apps/frontend/src/mocks/handlers.ts` | MSW handlers | All auth endpoints |
| `apps/frontend/src/mocks/server.ts` | MSW server setup | — |
| `apps/frontend/src/__tests__/hooks/useLogin.test.ts` | Unit | S5, S6 |
| `apps/frontend/src/__tests__/hooks/useRegister.test.ts` | Unit | S1, S2 |
| `apps/frontend/src/__tests__/hooks/useForgotPassword.test.ts` | Unit | S10 |
| `apps/frontend/src/__tests__/hooks/useResetPassword.test.ts` | Unit | S12, S13, S14 |
| `apps/frontend/src/__tests__/hooks/useLogout.test.ts` | Unit | S16 |
| `apps/frontend/src/__tests__/pages/LoginPage.test.tsx` | Component | S5, S6, S7, S8 |
| `apps/frontend/src/__tests__/pages/RegisterPage.test.tsx` | Component | S1, S2, S3, S4, S9 |
| `apps/frontend/src/__tests__/components/ForgotPasswordModal.test.tsx` | Component | S10, S11, S12, S13, S14, S15 |

**vitest.config.ts shape:**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    globals: true,
  },
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
});
```

**Checkpoint 5 (final):** `pnpm build` | `pnpm lint --max-warnings 0` | `pnpm test` — all green | coverage ≥ 80%

---

## Checkpoints Summary

| Phase | Gate |
|-------|------|
| 1 — Scaffold | build + lint |
| 2 — Hooks | build + lint |
| 3 — Components | build + lint |
| 4 — Wiring | build + lint |
| 5 — Tests | build + lint + test + coverage |

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|----------------|-----------|
| R1 | shadcn/ui requires exact Radix + Tailwind wiring — config drift breaks components | Pin all versions; verify with `pnpm build` after Phase 1 |
| R2 | Auto-login after register requires holding plaintext password across two mutations | Hold in React state only for the duration of the call sequence; cleared by component state when done |
| R3 | Vitest config for frontend must not conflict with backend vitest config | Each workspace has its own `vitest.config.ts`; turbo runs `pnpm test` per workspace independently |
| R4 | TipTap peer deps (`@tiptap/pm`) may require explicit install | Install `@tiptap/pm` alongside `@tiptap/react` and `@tiptap/starter-kit` |
| R5 | `resetPasswordSchema` requires `email` field but Step 2 form only shows `otp` + `newPassword` | Use a local `step2Schema` for form validation; merge `submittedEmail` from Step 1 state before calling the mutation |
