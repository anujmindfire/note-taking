# JotDown Developer Agents Guidelines (AGENTS.md)

## 1. Project Overview
JotDown is a secure, light-weight web-based workspace designed to help users capture thoughts, organize knowledge, search contextually, and share documents safely. It features robust version snapshotting, tagging, and immediate searchability, acting as a personal knowledge base.

## 2. Repository Structure
```txt
/
├── apps/
│   ├── web/                  # React 19 Client SPA
│   └── api/                  # Node.js 22 / Express 5 API Service
│       └── prisma/           # Database schemas & migrations
├── packages/
│   ├── shared/               # Domain logic (Zod validation schemas, types, DTOs, constants)
│   ├── ui/                   # Shared UI component library (shadcn/ui wrappers)
│   ├── eslint-config/        # Unified linting rules
│   └── typescript-config/    # Standardized compiler configurations
└── docs/                     # Product requirements (FRS.md) and systems design (SDS.md)
```

## 3. Tech Stack
* **Frontend:** React 19, TypeScript, Vite, Zustand (UI state), TanStack Query (server cache), TipTap (editor), Tailwind CSS + shadcn/ui.
* **Backend:** Node.js 22, Express 5.
* **Database & ORM:** PostgreSQL 16, Prisma.
* **Testing:** Vitest, Supertest, Playwright.

## 4. Key Commands
* **Install dependencies:** `pnpm install`
* **Development servers:** `pnpm dev`
* **Build application:** `pnpm build`
* **Run test suite:** `pnpm test`
* **Lint codebase:** `pnpm lint`

## 5. Architecture Patterns
* **Monorepo:** Controlled via pnpm workspaces and Turborepo.
* **Backend Module Organization:** Grouped by concern (auth, notes, tags, search, sharing, versions).
* **Client State Separation:** Zustand for UI configuration; TanStack Query for remote API state.
* **Data Flow:** Unidirectional contract matching; `packages/shared` drives validations on both client and server.

## 6. Coding Standards
* **Naming:** `camelCase` for functions/variables, `PascalCase` for components/classes/types, `UPPER_SNAKE_CASE` for constants.
* **Error Handling:** Standardized error shape returned on API failures:
  ```json
  { "success": false, "error": { "code": "ERROR_CODE", "message": "Message text", "fields": [] } }
  ```
* **Response Contract:** Successful endpoints wrap data in a unified envelope:
  ```json
  { "success": true, "data": { ... }, "meta": { ... } }
  ```

## 7. Authentication Approach
* **JWT Protocol:** Short-lived access token (15 mins) via Authorization headers; database-persisted refresh token (7 days) via HTTP-only cookie.
* **Security Mechanics:** Hashed password verification (bcrypt with 12 salt rounds).
* **Reset Flow:** Console-logged, time-limited (10 mins) hashed OTP validations.
* **Token Rotation:** Generates new refresh tokens upon query requests and invalidates revoked tokens.

## 8. API Design Conventions
* **REST Prefixes:** All API paths versioned under `/api/v1/...`
* **HTTP Verbs:** `GET` (fetch), `POST` (create), `PUT` (edit), `DELETE` (soft-delete).
* **REST Status Mapping:**
  * `200` Success | `201` Created | `400` Validation Failure
  * `401` Unauthorized | `403` Forbidden | `404` Not Found
  * `410` Expired | `422` Business Rule Violation | `500` Server Error

## 9. Database Schema Summary
* **User:** User account profiles (unique emails, password hashes).
* **Note:** Note records containing user ownership references and `deletedAt` soft-delete flags.
* **Tag:** Categories scoped to users.
* **NoteTag:** Junction table matching notes and tags.
* **SharedLink:** Expiry-aware public access tokens tracking `viewCount`.
* **NoteVersion:** Immutable snapshot store of historical note edits.
* **RefreshToken:** Persisted active session tokens.

## 10. Testing Approach
* **Unit Level:** Vitest validation tests covering schemas, DTOs, and pure utility functions.
* **Integration Level:** Supertest suites checking route authorizations, status codes, and JSON shapes.
* **E2E Level:** Playwright browser tests validating logins, note creation, tags, search, and history rollbacks.
* **NFR target:** Minimum statement coverage of 80% for new code.

## 11. Do NOT Do (Anti-Patterns)
* **Do NOT** duplicate types/schemas between Client and API. Maintain them in `/packages/shared`.
* **Do NOT** store password strings in plaintext. Always run them through bcrypt.
* **Do NOT** execute hard deletions. Keep notes recoverable using soft delete (`deletedAt` timestamps).
* **Do NOT** expose JWT secrets; use environment variables (`DATABASE_URL`, `JWT_ACCESS_SECRET`, etc.).
* **Do NOT** leak credentials or sensitive parameters to stdout log files.

## 12. Shared Packages (`/packages/shared`)
* `src/schemas/`: Zod validation parsers.
* `src/types/`: Centralized TypeScript definitions.
* `src/dto/`: Request payload and API response layout blueprints.
* `src/constants/`: Configuration parameters (password requirements, tokens, bounds).
