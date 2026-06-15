# Spec — AB-1010: Frontend — Auth Pages

**Status:** Draft — awaiting approval
**Ticket:** AB-1010
**Branch:** feature/frontend/AB-1010-auth-pages
**FRS References:** §4.1.1, §4.1.2, §4.1.3, §4.1.4, §4.1.5
**SDS References:** §3.1, §3.2, §6.1
**Layer:** Frontend only
**Depends on:** AB-1001 (backend auth endpoints — already implemented)

---

## Summary

Implements the full authentication UI for JotDown: a `/register` page, a `/login` page, and a two-step Forgot Password modal on the login page. This ticket also installs and configures the complete frontend UI stack — Tailwind CSS, shadcn/ui, react-hook-form with Zod resolvers, and TipTap — which all future frontend tickets will build on. Auth forms use react-hook-form + Zod for client-side validation; all errors (client and API) surface as Sonner toasts. Authenticated users visiting `/login` or `/register` are redirected to `/notes` immediately.

---

## In Scope

- Install and configure: Tailwind CSS v3, shadcn/ui, react-hook-form, @hookform/resolvers, TipTap core + starter-kit, Sonner (toasts)
- `/register` page: email + password form; on success auto-calls login and navigates to `/notes`
- `/login` page: email + password form; on success stores auth and navigates to `/notes`
- Forgot Password modal (accessible from login page): two-step — Step 1 enter email, Step 2 enter OTP + new password
- `GuestRoute` guard: redirects authenticated users away from `/login` and `/register` to `/notes`
- TanStack Query `useMutation` hooks: `useLogin`, `useRegister`, `useForgotPassword`, `useResetPassword`, `useLogout`
- `useLogout`: calls `POST /api/auth/logout`, clears auth store, navigates to `/login`
- Toast-based error and success feedback via Sonner
- `App.tsx` rewired to use real page components and `GuestRoute`
- Vitest + React Testing Library setup for frontend

## Out of Scope

- Silent token refresh (redirect-on-401 behavior in `api.ts` remains unchanged)
- Notes pages, tag pages, editor canvas (future tickets)
- Social / OAuth login
- TipTap editor UI (installed only; wired up in a future ticket)
- Logout button in the app shell UI (trigger deferred to the Notes dashboard ticket)
- Playwright E2E tests (deferred)

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | `POST /api/auth/register` returns `201 { data: { userId } }` — no tokens. The frontend auto-calls `POST /api/auth/login` immediately after to obtain `accessToken` + `user`. | FRS §4.1.1 AC3 + existing `IRegisterResponse` |
| A2 | The refresh token returned in `IAuthResponse.refreshToken` is NOT stored in the Zustand store; silent refresh is out of scope. The 401 interceptor in `api.ts` continues to redirect to `/login`. | User answer Q2 |
| A3 | The forgot-password flow is a modal on `/login`, not a separate route. | User answer Q3 |
| A4 | All error feedback — client validation and API errors — uses Sonner toasts, not inline field errors. | User answer Q5 |
| A5 | After successful login or register, the user navigates to `/notes`. | User answer Q4 |
| A6 | The email entered in Step 1 of the modal is carried silently into the Step 2 API call; it is not re-entered by the user. | FRS §4.1.5 AC1 |
| A7 | TipTap is installed (`@tiptap/react`, `@tiptap/starter-kit`) but no editor UI is built in this ticket. | User answer Q1 |
| A8 | The existing `authStore.ts` and `api.ts` are reused unchanged. | Existing code |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Register — happy path | User is on `/register`, unauthenticated | Submits valid email + compliant password | `POST /api/auth/register` called; auto-login called; auth store populated; navigated to `/notes` | §4.1.1 AC1, AC3 | — |
| S2 | Register — email already taken | User is on `/register` | Submits already-registered email | API returns `EMAIL_TAKEN`; toast shown; form remains | §4.1.1 AC4 | `EMAIL_TAKEN` |
| S3 | Register — password too weak | User is on `/register` | Submits password failing policy (e.g. no uppercase) | Zod validates before API call; toast shown; no API call made | §4.1.1 password rules | — (client) |
| S4 | Register — invalid email format | User is on `/register` | Submits malformed email | Zod validates before API call; toast shown; no API call made | §4.1.1 AC1 | — (client) |
| S5 | Login — happy path | User is on `/login`, unauthenticated | Submits valid email + password | API returns `{ accessToken, refreshToken, user }`; auth store populated; navigated to `/notes` | §4.1.2 AC1 | — |
| S6 | Login — invalid credentials | User is on `/login` | Submits wrong email or password | API returns `INVALID_CREDENTIALS`; toast shown; form remains | §4.1.2 AC3 | `INVALID_CREDENTIALS` |
| S7 | Login — empty fields | User is on `/login` | Submits with blank email or password | Zod validates before API call; toast shown; no API call made | §4.1.2 | — (client) |
| S8 | Already-authenticated user visits `/login` | User has valid `accessToken` in store | Navigates to `/login` | Immediately redirected to `/notes` | §3.2 (SDS) | — |
| S9 | Already-authenticated user visits `/register` | User has valid `accessToken` in store | Navigates to `/register` | Immediately redirected to `/notes` | §3.2 (SDS) | — |
| S10 | Forgot password — Step 1: email submitted | Modal open, Step 1 visible | User enters any valid-format email and submits | `POST /api/auth/forgot-password` called; modal advances to Step 2 regardless of whether email exists | §4.1.4 AC1, NOTE | — |
| S11 | Forgot password — Step 1: invalid email format | Modal open, Step 1 visible | User submits malformed email | Zod validates; toast shown; modal stays on Step 1; no API call | §4.1.4 | — (client) |
| S12 | Reset password — happy path | Modal open, Step 2 visible | User enters valid 6-digit OTP + compliant new password | `POST /api/auth/reset-password` called; modal closes; success toast shown; user stays on `/login` | §4.1.5 AC1, AC2 | — |
| S13 | Reset password — OTP expired | Modal open, Step 2 visible | User submits an expired OTP | API returns `OTP_EXPIRED`; toast shown; modal stays on Step 2 | §4.1.4 error table | `OTP_EXPIRED` |
| S14 | Reset password — OTP invalid | Modal open, Step 2 visible | User submits wrong OTP digits | API returns `OTP_INVALID`; toast shown; modal stays on Step 2 | §4.1.4 error table | `OTP_INVALID` |
| S15 | Reset password — new password too weak | Modal open, Step 2 visible | User submits non-compliant new password | Zod validates; toast shown; no API call made | §4.1.5 AC2 | — (client) |
| S16 | Logout — happy path | User is authenticated | `useLogout` mutation called | `POST /api/auth/logout` called; auth store cleared; navigated to `/login` | §4.1.3 AC1, AC3 | — |

---

## API Contract

No new API endpoints. This ticket consumes existing backend endpoints:

| Method | Path | Hook | Success | Error codes handled |
|--------|------|------|---------|---------------------|
| POST | `/api/auth/register` | `useRegister` | 201 `{ data: { userId } }` | `EMAIL_TAKEN`, `VALIDATION_ERROR` |
| POST | `/api/auth/login` | `useLogin` | 200 `{ data: { accessToken, refreshToken, user } }` | `INVALID_CREDENTIALS`, `VALIDATION_ERROR` |
| POST | `/api/auth/logout` | `useLogout` | 204 (no body) | `UNAUTHORIZED` |
| POST | `/api/auth/forgot-password` | `useForgotPassword` | 200 `{ data: { message } }` | Always 200 (anti-enumeration guard) |
| POST | `/api/auth/reset-password` | `useResetPassword` | 200 `{ data: { message } }` | `OTP_EXPIRED`, `OTP_INVALID`, `VALIDATION_ERROR` |

---

## Database Changes

None. Frontend-only ticket.

---

## Shared Package Changes

None. All required types and Zod schemas already exist:
- Zod schemas: `registerSchema`, `loginSchema`, `forgotPasswordSchema`, `resetPasswordSchema`
- Types: `IAuthResponse`, `IRegisterResponse`, `IUserResponse`, `IMessageResponse`, `IErrorResponse`

---

## Architecture Notes

### New file structure

```
apps/frontend/src/
├── pages/
│   ├── LoginPage.tsx               login form + forgot-password trigger
│   └── RegisterPage.tsx            register form
├── components/
│   ├── ForgotPasswordModal.tsx     two-step dialog
│   └── ui/                         shadcn/ui generated components
├── hooks/
│   ├── useLogin.ts
│   ├── useRegister.ts
│   ├── useForgotPassword.ts
│   ├── useResetPassword.ts
│   └── useLogout.ts
└── lib/
    ├── api.ts                       (existing — unchanged)
    ├── utils.ts                     cn() helper (new)
    └── errorUtils.ts                getErrorMessage() helper (new)
```

### GuestRoute guard

```tsx
function GuestRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) return <Navigate to="/notes" replace />;
  return <>{children}</>;
}
```

### Auto-login after register

`RegisterPage` calls `useRegister` → on success immediately calls `useLogin` with the same credentials → stores auth → navigates to `/notes`. The plaintext password is held only in React state for the duration of the mutation sequence.

### Hook shape

```typescript
export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: TLoginInput) =>
      api.post<{ data: IAuthResponse }>("/auth/login", data).then((r) => r.data.data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      navigate("/notes");
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}
```

### Toast error helper

`getErrorMessage(err: unknown): string` extracts `err.response.data.error.message` from Axios errors, falling back to `"Something went wrong"`.
