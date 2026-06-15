# Tasks — AB-1010: Frontend — Auth Pages

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Frontend Scaffold

- [ ] Add production dependencies to `apps/frontend/package.json`: react-hook-form, @hookform/resolvers, @tiptap/react, @tiptap/starter-kit, @tiptap/pm, sonner, clsx, tailwind-merge, class-variance-authority, lucide-react, @radix-ui/react-dialog, @radix-ui/react-label, @radix-ui/react-slot
- [ ] Add dev dependencies to `apps/frontend/package.json`: tailwindcss, postcss, autoprefixer
- [ ] Run `pnpm install` to install all new packages
- [ ] Create `apps/frontend/tailwind.config.ts` — content paths covering `./src/**/*.{ts,tsx}`, darkMode: "class", theme extensions
- [ ] Create `apps/frontend/postcss.config.js` — tailwindcss + autoprefixer plugins
- [ ] Create `apps/frontend/components.json` — shadcn/ui config (style: default, rsc: false, tsx: true, path aliases)
- [ ] Replace `apps/frontend/src/index.css` with Tailwind directives (`@tailwind base`, `@tailwind components`, `@tailwind utilities`) + CSS variables for shadcn/ui theming
- [ ] Modify `apps/frontend/vite.config.ts` — add `resolve.alias`: `"@"` → `path.resolve(__dirname, "./src")`
- [ ] Modify `apps/frontend/tsconfig.json` — add `"baseUrl": "."` and `"paths": { "@/*": ["./src/*"] }`
- [ ] Create `apps/frontend/src/lib/utils.ts` — `cn()` helper using clsx + tailwind-merge
- [ ] Create `apps/frontend/src/components/ui/button.tsx` — shadcn Button component
- [ ] Create `apps/frontend/src/components/ui/input.tsx` — shadcn Input component
- [ ] Create `apps/frontend/src/components/ui/label.tsx` — shadcn Label component
- [ ] Create `apps/frontend/src/components/ui/card.tsx` — shadcn Card + CardHeader + CardContent + CardFooter
- [ ] Create `apps/frontend/src/components/ui/dialog.tsx` — shadcn Dialog component (wraps Radix Dialog)

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — Mutation Hooks

- [ ] Create `apps/frontend/src/lib/errorUtils.ts` — `getErrorMessage(err: unknown): string` extracts `err.response.data.error.message`, fallback to `"Something went wrong"`
- [ ] Create `apps/frontend/src/hooks/useLogin.ts`
  - [ ] `useMutation` calling `POST /auth/login` via `api`
  - [ ] `onSuccess`: `setAuth(data.accessToken, data.user)` + `navigate("/notes")`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`
- [ ] Create `apps/frontend/src/hooks/useRegister.ts`
  - [ ] `useMutation` calling `POST /auth/register` via `api`
  - [ ] Returns `IRegisterResponse` — no store update (caller chains login)
  - [ ] `onError`: `toast.error(getErrorMessage(err))`
- [ ] Create `apps/frontend/src/hooks/useForgotPassword.ts`
  - [ ] `useMutation` calling `POST /auth/forgot-password` via `api`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`
- [ ] Create `apps/frontend/src/hooks/useResetPassword.ts`
  - [ ] `useMutation` calling `POST /auth/reset-password` via `api`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`
- [ ] Create `apps/frontend/src/hooks/useLogout.ts`
  - [ ] `useMutation` calling `POST /auth/logout` via `api`
  - [ ] `onSuccess`: `clearAuth()` + `navigate("/login")`
  - [ ] `onError`: `clearAuth()` + `navigate("/login")` (always clears even on 401)
- [ ] Verify: all hooks import input/response types from `@noteapp/shared`
- [ ] Verify: no direct `axios` import — all calls use the shared `api` instance

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — Page Components

- [ ] Create `apps/frontend/src/pages/LoginPage.tsx`
  - [ ] `useForm<TLoginInput>({ resolver: zodResolver(loginSchema) })` from `@noteapp/shared`
  - [ ] Email field (Input + Label)
  - [ ] Password field (Input type="password" + Label)
  - [ ] Submit button (Button) — disabled while `loginMutation.isPending`
  - [ ] On submit: `loginMutation.mutate(data)` (validation errors surfaced as toast via onError)
  - [ ] "Forgot password?" button → opens `ForgotPasswordModal`
  - [ ] Link to `/register`
- [ ] Create `apps/frontend/src/pages/RegisterPage.tsx`
  - [ ] `useForm<TRegisterInput>({ resolver: zodResolver(registerSchema) })` from `@noteapp/shared`
  - [ ] Email field + password field
  - [ ] On submit: `registerMutation.mutate(data)` → `onSuccess` chains `loginMutation.mutate({ email, password })`
  - [ ] Submit button disabled while either mutation is pending
  - [ ] Link to `/login`
- [ ] Create `apps/frontend/src/components/ForgotPasswordModal.tsx`
  - [ ] Props: `open: boolean`, `onOpenChange: (open: boolean) => void`
  - [ ] Internal state: `step: 1 | 2`, `submittedEmail: string`
  - [ ] Step 1: `useForm` with `forgotPasswordSchema` — email field only
  - [ ] Step 1 submit → `forgotMutation.mutate({ email })` → on success set `submittedEmail` + `setStep(2)`
  - [ ] Step 2: local `step2Schema` for `otp` + `newPassword` fields (email pre-populated from state)
  - [ ] Step 2 submit → `resetMutation.mutate({ email: submittedEmail, otp, newPassword })`
  - [ ] Step 2 success → `onOpenChange(false)` + `toast.success("Password reset successfully")`
  - [ ] Step 2 error (OTP_EXPIRED / OTP_INVALID) → toast shown, modal stays on Step 2

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — App Wiring

- [ ] Modify `apps/frontend/src/App.tsx`
  - [ ] Add `GuestRoute` component: reads `accessToken` from store, redirects to `/notes` if present
  - [ ] Replace `/login` placeholder with `<GuestRoute><LoginPage /></GuestRoute>`
  - [ ] Replace `/register` placeholder with `<GuestRoute><RegisterPage /></GuestRoute>`
  - [ ] Keep `/notes` as `<ProtectedRoute>` with placeholder div
  - [ ] Import `LoginPage` and `RegisterPage`
- [ ] Modify `apps/frontend/src/main.tsx`
  - [ ] Import `Toaster` from `sonner`
  - [ ] Render `<Toaster position="top-right" richColors />` inside the app tree

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 5 — Tests

- [ ] Add test dev dependencies to `apps/frontend/package.json`: vitest, @vitest/coverage-v8, @testing-library/react, @testing-library/user-event, @testing-library/jest-dom, jsdom, msw
- [ ] Add scripts: `"test": "vitest run"`, `"test:coverage": "vitest run --coverage"`
- [ ] Create `apps/frontend/vitest.config.ts` — jsdom environment, setupFiles, path alias `@`
- [ ] Create `apps/frontend/src/setupTests.ts` — import `@testing-library/jest-dom`
- [ ] Create `apps/frontend/src/mocks/handlers.ts` — MSW request handlers for all 5 auth endpoints
- [ ] Create `apps/frontend/src/mocks/server.ts` — MSW `setupServer` export

**Hook unit tests** (`apps/frontend/src/__tests__/hooks/`):

- [ ] `useLogin.test.ts`
  - [ ] AC-S5: Login — happy path — auth store populated, navigate called with /notes
  - [ ] AC-S6: Login — INVALID_CREDENTIALS — toast.error called
- [ ] `useRegister.test.ts`
  - [ ] AC-S1: Register — happy path — mutation resolves with userId
  - [ ] AC-S2: Register — EMAIL_TAKEN — toast.error called
- [ ] `useForgotPassword.test.ts`
  - [ ] AC-S10: Forgot password — any email always resolves (anti-enumeration)
- [ ] `useResetPassword.test.ts`
  - [ ] AC-S12: Reset password — happy path — mutation resolves
  - [ ] AC-S13: Reset password — OTP_EXPIRED — toast.error called
  - [ ] AC-S14: Reset password — OTP_INVALID — toast.error called
- [ ] `useLogout.test.ts`
  - [ ] AC-S16: Logout — clearAuth called, navigate called with /login

**Component tests** (`apps/frontend/src/__tests__/pages/` and `components/`):

- [ ] `LoginPage.test.tsx`
  - [ ] AC-S5: Login — happy path — form submit calls API, user navigated to /notes
  - [ ] AC-S6: Login — invalid credentials — toast rendered
  - [ ] AC-S7: Login — empty fields — Zod prevents API call, toast shown
  - [ ] AC-S8: Authenticated user on /login — redirected to /notes
- [ ] `RegisterPage.test.tsx`
  - [ ] AC-S1: Register — happy path — auto-login triggered, navigated to /notes
  - [ ] AC-S2: Register — EMAIL_TAKEN — toast rendered
  - [ ] AC-S3: Register — password too weak — Zod toast, no API call
  - [ ] AC-S4: Register — invalid email — Zod toast, no API call
  - [ ] AC-S9: Authenticated user on /register — redirected to /notes
- [ ] `ForgotPasswordModal.test.tsx`
  - [ ] AC-S10: Step 1 email submit — modal advances to Step 2
  - [ ] AC-S11: Step 1 invalid email format — toast shown, stays on Step 1
  - [ ] AC-S12: Step 2 valid OTP + password — modal closes, success toast
  - [ ] AC-S13: Step 2 OTP_EXPIRED — toast shown, stays on Step 2
  - [ ] AC-S14: Step 2 OTP_INVALID — toast shown, stays on Step 2
  - [ ] AC-S15: Step 2 weak password — Zod toast, no API call

**Checkpoint 5 (final):**
- [ ] `pnpm build` — 0 errors
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] Coverage ≥ 80% on new files
