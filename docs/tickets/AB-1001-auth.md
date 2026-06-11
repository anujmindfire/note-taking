# Ticket AB-1001 — Authentication API

**FRS Reference:** §4.1.1 Account Registration, §4.1.2 Session Authentication, §4.1.3 Session Termination  
**Branch:** `feature/backend/AB-1001-auth`  
**Layer:** Backend only

---

## Requirement

Implement the authentication API: user registration, login, logout, and token refresh. All user sessions are managed via JWT access tokens (15 min) and refresh tokens (7 days, stored in DB).

---

## Acceptance Criteria

1. `POST /api/auth/register` accepts `{ email, password }`, hashes password with bcrypt, creates user, returns `{ data: { userId } }` with 201.
2. `POST /api/auth/login` accepts `{ email, password }`, verifies credentials, returns `{ data: { accessToken, refreshToken, user } }` with 200.
3. `POST /api/auth/logout` requires Bearer token, deletes refresh token from DB, returns 204.
4. `POST /api/auth/refresh` accepts `{ refreshToken }`, validates it is in DB and not expired/revoked, returns `{ data: { accessToken } }` with 200 and rotates the refresh token.
5. Password is hashed with bcrypt before storage — never stored plaintext.
6. Access token expires in 15 minutes; refresh token expires in 7 days.

---

## Error Scenarios

| Case | Code | HTTP |
| :--- | :--- | :--- |
| Duplicate email on register | `EMAIL_TAKEN` | 422 |
| Invalid email format | `VALIDATION_ERROR` | 400 |
| Password policy violation | `VALIDATION_ERROR` | 400 |
| Wrong email or password on login | `INVALID_CREDENTIALS` | 401 |
| Missing/invalid Bearer token | `UNAUTHORIZED` | 401 |
| Access token expired | `TOKEN_EXPIRED` | 401 |
| Refresh token not in DB | `REFRESH_INVALID` | 401 |
| Refresh token past 7 days | `REFRESH_EXPIRED` | 401 |

---

## Out of Scope

- Password reset / OTP flow (FRS §4.1.4–§4.1.5)
- Frontend login/register pages
- Rate limiting on auth endpoints
