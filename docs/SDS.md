# Software Design Specification (SDS)

## Project: JotDown Note-Taking Platform
**Project Code:** textAB  
**Version:** 1.1.0-Release  
**Author:** Technical Architecture Team  

---

# 1. System Architecture

## 1.1 Architectural Topology
JotDown is built on a modular monorepo architecture leveraging `pnpm workspaces` and `Turborepo` to enforce boundary rules, optimize builds, and isolate concerns.

```mermaid
graph LR
    subgraph Frontend [Client Tier]
        SPA["React 19 SPA + Vite"]
        Zustand["Zustand Store"]
        Query["TanStack Query"]
    end

    subgraph Backend [Application Tier]
        API["Express 5 Server"]
        Auth["Auth Service"]
        Notes["Notes Service"]
        Search["Search Indexer"]
    end

    subgraph Database [Storage Tier]
        DB[("PostgreSQL 16")]
        Prisma["Prisma ORM"]
    end

    subgraph Shared [Common Contracts]
        PkgShared["packages/shared"]
    end

    SPA -->|HTTPS / JSON REST API| API
    SPA -.->|Reference Schemas/Types| PkgShared
    API -.->|Validate Payloads| PkgShared
    API --> Prisma
    Prisma --> DB
```

## 1.2 Technology Stack
The technology decisions balance modern runtime speed, type safety, developer velocity, and indexing capabilities.

| Ecosystem | Component | Technology | Rationale |
| :--- | :--- | :--- | :--- |
| **Frontend** | Build Tool & Library | React 19 + TypeScript + Vite | Minimal bundle footprint, fast hot-reloading, type safety. |
| | Core Client State | Zustand | Light state engine to manage sidebar toggle and editor preferences. |
| | Cache & Server State | TanStack Query (v5) | Cache synchronization, automated invalidation, and retry handlers. |
| | Rich Text Editor | TipTap | Headless, highly extensible editor engine with Markdown support. |
| | Styling & Design | Tailwind CSS + shadcn/ui | Radix UI accessible primitives with fully customizable layouts. |
| **Backend** | Server Runtime | Node.js 22 + Express 5 | Asynchronous REST APIs, native middleware handling. |
| | Object Relational Mapper| Prisma | Strongly-typed client generator, automated schema migrations. |
| | Payload Validation | Zod | Runtime validation schemas synced from the shared contracts package. |
| | Log Dispatcher | Pino | High-speed, structured JSON logger to feed centralized log collectors. |
| **Storage** | Database Engine | PostgreSQL 16 | ACID transactional compliance, native full-text search index support. |
| **Testing** | Suite Tools | Vitest, Supertest, Playwright | Seamless unit testing (Vitest), API mock calls (Supertest), and visual browsers (Playwright). |

---

# 2. Workspace & Monorepo Structure

The workspace is organized into application containers (`apps/`) and shared library packages (`packages/`) to maximize code reusability and enforce package boundaries.

```txt
jotdown/
├── apps/
│   ├── web/                     # React 19 Client SPA
│   └── api/                     # Node.js 22 / Express 5 API Service
│       └── prisma/
│           ├── schema.prisma    # Prisma DB Schema definition
│           └── migrations/      # SQL migration scripts
├── packages/
│   ├── shared/                  # Common domain modules (Zod schemas, DTOs, Enums)
│   │   └── src/
│   │       ├── schemas/         # Shared Zod validators
│   │       ├── types/           # Core TypeScript types
│   │       ├── dto/             # Request/Response payloads
│   │       └── constants/       # App-wide configuration constants
│   ├── ui/                      # Reusable UI component library (shadcn/ui wrapper)
│   ├── eslint-config/           # Unified lint rules
│   └── typescript-config/       # Root TS compiler specs
├── docs/                        # Architectural specifications
├── openspec/                    # RFC and API schema change proposals
├── turbo.json                   # Turborepo task pipeline config
└── pnpm-workspace.yaml          # PNPM workspaces configuration
```

> [!IMPORTANT]
> **Boundary Integrity Rule:** To prevent codebase divergence, `packages/shared` represents the single source of truth for API contracts. No type or validator schemas may be duplicated across the `apps/web` and `apps/api` boundaries.

---

# 3. Client SPA Architecture

## 3.1 State Division Matrix
* **Server-Synchronized Cache:** All backend data fetching, caching, query invalidation, and update mutations are managed exclusively via **TanStack Query**.
* **Client-Local Context:** Temporary UI state (e.g., sidebar collapse toggles, current workspace view, editor configuration parameters) is managed by **Zustand**.
* **Form States:** User registration, login credentials, and tag configurations use **React Hook Form** with Zod resolvers.

## 3.2 Client Route Registry
| Path | Route Type | Purpose |
| :--- | :--- | :--- |
| `/login` | Public | Credentials entry for authentication. |
| `/register` | Public | New account registration page. |
| `/notes` | Protected | Dashboard listing all non-deleted, user-owned notes. |
| `/notes/:id` | Protected | Markdown canvas editor for editing specific note content. |
| `/shared/:token` | Public | Read-only presentation layout of a shared note. |

---

## 3.3 Editor Canvas & Autosave Flow
JotDown uses TipTap to support drafting. To prevent data loss while avoiding excessive API traffic, the autosave feature runs on a debounced strategy.

```mermaid
sequenceDiagram
    autonumber
    actor User as Writer
    participant Editor as TipTap Component
    participant Hook as Autosave Hook
    participant API as API Server (/api/v1/notes/:id)
    participant DB as Postgres Database

    User->>Editor: Inputs text changes
    Editor->>Hook: Trigger onChange event
    Note over Hook: Debounce for 2.0 Seconds
    alt User types more within 2.0s
        User->>Editor: Continues input
        Note over Hook: Reset 2.0s Timer
    else 2.0s Timer Expires
        Note over Hook: Verify: User is Auth?<br/>Verify: Content changed?<br/>Verify: No request currently pending?
        Hook->>API: HTTP PUT /notes/:id (Send title & content)
        API->>DB: Write to database & create version record
        DB-->>API: Confirm Save
        API-->>Hook: Return HTTP 200 (Success)
        Note over Hook: Update status to "Synced"
    end
```

### Autosave Strategy Constraints:
1. **Debounce Interval:** Set to `2000 milliseconds`.
2. **Change Validation:** Only dispatch the update payload if the content differs from the last successful API save.
3. **Pending Guard:** If a save request is active, postpone subsequent triggers until the current request resolves.
4. **Auth Constraint:** Autosave must only run for authenticated user sessions.
5. **Fault Recovery:** In the event of a network failure, retry the save action exactly once after a 3-second delay. If the retry fails, alert the user with a UI banner.
6. **Concurrency Resolution:** Use a **Latest-Write-Wins** strategy based on request timestamps.

---

# 4. REST API Architecture

## 4.1 Modular Layout
The API application utilizes a modular design, grouping logic by business capabilities.

```txt
apps/api/src/
├── modules/
│   ├── auth/         # Registrations, Logins, Tokens, OTPs
│   ├── notes/        # Note CRUD, Soft-deletes
│   ├── tags/         # Tag Definitions, Assignments
│   ├── search/       # Full-text postgres search queries
│   ├── sharing/      # Public token generation, access endpoints
│   └── versions/     # Note snapshots, rollback handlers
├── middleware/       # JWT guards, rate limiters, error catches
├── lib/              # Prisma Client, Logger initialization
└── config/           # Environment variable validations
```

## 4.2 API Path Specs
All API endpoints must be prefixed with the version namespace `/api/v1`.

* `/api/v1/auth/register` (POST)
* `/api/v1/auth/login` (POST)
* `/api/v1/notes` (GET / POST)
* `/api/v1/notes/:id` (GET / PUT / DELETE)
* `/api/v1/search` (GET)

---

## 4.3 API JSON Schemas

### Standard Success Response
```json
{
  "success": true,
  "data": {
    "id": "e26eb8b7-84ad-4cb6-829d-472dfdb709f1",
    "title": "Weekly Planning Notes",
    "content": "Review sprint progress and goals."
  },
  "meta": {}
}
```

### Standard Paginated Response
```json
{
  "success": true,
  "data": [
    {
      "id": "e26eb8b7-84ad-4cb6-829d-472dfdb709f1",
      "title": "Weekly Planning Notes"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Input payload failed schema validation",
    "fields": [
      {
        "field": "email",
        "message": "Please supply a valid email address format."
      }
    ]
  }
}
```

---

# 5. Database Schema & Indexing Design

## 5.1 Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    User ||--o{ Note : "creates"
    User ||--o{ Tag : "owns"
    User ||--o{ RefreshToken : "authorizes"
    Note ||--o{ NoteTag : "tagged"
    Tag ||--o{ NoteTag : "applies"
    Note ||--o{ NoteVersion : "snapshots"
    Note ||--o{ SharedLink : "exposes"

    User {
        string id PK
        string email
        string passwordHash
        datetime createdAt
        datetime updatedAt
    }

    Note {
        string id PK
        string userId FK
        string title
        string content
        datetime deletedAt
        datetime createdAt
        datetime updatedAt
    }

    Tag {
        string id PK
        string userId FK
        string name
        string color
        datetime createdAt
    }

    NoteTag {
        string noteId PK, FK
        string tagId PK, FK
    }

    SharedLink {
        string id PK
        string noteId FK
        string token
        datetime expiresAt
        datetime revokedAt
        int viewCount
        datetime createdAt
    }

    NoteVersion {
        string id PK
        string noteId FK
        int version
        string title
        string content
        datetime createdAt
    }

    RefreshToken {
        string id PK
        string userId FK
        string token
        datetime expiresAt
        datetime revokedAt
        datetime createdAt
    }
```

---

## 5.2 Prisma Schema Modeling

```prisma
// User Entity definition
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  notes         Note[]
  tags          Tag[]
  refreshTokens RefreshToken[]
}

// Document Entity definition
model Note {
  id          String   @id @default(uuid())
  userId      String
  title       String
  content     String
  deletedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  noteTags     NoteTag[]
  versions     NoteVersion[]
  sharedLinks  SharedLink[]

  @@index([userId])
  @@index([deletedAt])
}

// Tag Entity definition
model Tag {
  id         String   @id @default(uuid())
  userId     String
  name       String
  color      String
  createdAt  DateTime @default(now())

  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  noteTags   NoteTag[]

  @@unique([userId, name])
}

// Note Tag Junction Table
model NoteTag {
  noteId String
  tagId  String

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)
  tag  Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([noteId, tagId])
}

// Shared Links Entity
model SharedLink {
  id         String   @id @default(uuid())
  noteId     String
  token      String   @unique
  expiresAt  DateTime?
  revokedAt  DateTime?
  viewCount  Int      @default(0)
  createdAt  DateTime @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@index([token])
}

// Note Versions Entity
model NoteVersion {
  id         String   @id @default(uuid())
  noteId     String
  version    Int
  title      String
  content    String
  createdAt  DateTime @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)
}

// Refresh Tokens Entity
model RefreshToken {
  id         String   @id @default(uuid())
  userId     String
  token      String   @unique
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
}
```

---

## 5.3 Database Indexing Design
To maintain database response times below the NFR requirements, the following indexing structures must be applied:

1. **B-Tree Indexes:**
   * `User(email)` (Enforced by Prisma `@unique` index).
   * `Note(userId)` to optimize active note lookups for users.
   * `Note(deletedAt)` to enable fast filtering of active notes vs. trashed notes.
   * `SharedLink(token)` to ensure rapid loading of public read-only shares.
   * `RefreshToken(token)` to optimize login refresh routines.

2. **Full-Text Search Index:**
   * Full-text search queries must execute against a PostgreSQL Generalized Inverted Index (**GIN**) mapped across the `title` and `content` fields of the `Note` table.
   * A dynamic DB migration script must construct a generated tsvector column:
     ```sql
     CREATE INDEX note_search_idx ON "Note" USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')));
     ```

---

# 6. Security, Validation & Token Strategy

## 6.1 Token Lifetimes
* **JWT Access Token:** Valid for **15 minutes**. Signed with HMAC-SHA256 containing user ID and email. Passed in the HTTP Authorization Header as `Bearer <token>`.
* **JWT Refresh Token:** Valid for **7 days**. Cryptographically secure random uuid stored in the database. Managed using HTTP-only cookies.

---

## 6.2 Refresh Token Rotation Flow
To secure user sessions, JotDown uses a strict refresh token rotation flow.

```mermaid
sequenceDiagram
    autonumber
    actor Client as SPA App
    participant API as API Server (/api/v1/auth/refresh)
    participant DB as Postgres Database

    Client->>API: Post Refresh Token (Cookie)
    API->>DB: Query token record
    alt Token not found or revoked
        DB-->>API: No matching active token
        API-->>Client: Return HTTP 401 (Force Logout)
        Note over Client: Clear user cache & session
    else Token is valid and active
        Note over API: Verify Token has not expired
        API->>DB: Mark old token as revoked (revokedAt = now)
        API->>DB: Generate and insert NEW RefreshToken record
        API->>Client: Return NEW Access Token (JSON) & NEW Refresh Token (Cookie)
    end
```

---

## 6.3 Verification OTP Details
For forgot-password validation routines:
* **Format:** Secure, randomly generated 6-digit numeric string.
* **Expiration:** Invalidated 10 minutes post-creation.
* **Storage:** Stored in the database as a hashed string to prevent database read exposure.
* **Delivery:** Written to standard out console logging only.

---

# 7. Quality & Testing Architecture

## 7.1 Testing Boundaries
```txt
               [ Playwright E2E Tests ]
             (Full User Flow Verification)
                         │
            [ Supertest API Integration ]
          (JSON Payloads, Roles, & Headers)
                         │
             [ Vitest Unit Tests Engine ]
           (Pure Utilities, Schemas & DTOs)
```

1. **Vitest Unit Engine:**
   * **Domain:** Focuses on synchronous calculations, utility transformations, dynamic Zod validator parsers, and custom hook engines.
2. **Supertest API Integration:**
   * **Domain:** Spawns mock HTTP Express listeners. Verifies header inputs, JSON validations, REST response structures, custom error mappings, and route authentication blocks.
3. **Playwright E2E Suites:**
   * **Domain:** Runs browser-level automated interactions (headless Chromium/Firefox) across registration pages, editor states, tag modifications, search results, and version restore processes.

---

# 8. Background Workflows & Operational Specs

## 8.1 Background Job Queue
An internal scheduler (Node.js cron or event daemon) handles database housekeeping:
1. **OTP Cleanup:** Automatically deletes expired password reset OTPs.
2. **Expired Token Invalidation:** Automatically purges database-persisted refresh tokens that have exceeded their 7-day lifetime.
3. **Version Retention Purge:** Deletes historical note snapshots that fall outside the configured system retention period, while leaving current active notes unaffected.

---

## 8.2 Environment Configurations
```env
# Database Connections
DATABASE_URL="postgresql://username:password@localhost:5432/jotdown?schema=public"

# Session Keys
JWT_ACCESS_SECRET="super-secret-cryptographic-access-key"
JWT_REFRESH_SECRET="super-secret-cryptographic-refresh-key"

# Port Setup
PORT=8080
```

---

## 8.3 Operational Pipeline Rules
1. **Pinned Dependencies:** All `package.json` configurations must use exact package version numbers (no wildcards or caret ranges).
2. **Pre-commit Checklist:** All builds, ESLint validations, and Vitest test suites must pass without errors before changes can be merged.
3. **Traceability:** Every user scenario mentioned in the FRS must map to a corresponding, named test case.
4. **Change Management:** Specs must be updated, submitted, and approved before implementing code changes.

---

# 9. Future Roadmap Extensions

The system architecture is structured to support the following future enhancements:
* **Collaboration Channels:** Real-time multi-user editing utilizing WebSocket gateways or CRDT sync.
* **Asset Attachments:** Integration with Amazon S3 or Google Cloud Storage via signed file upload APIs.
* **AI Copilot:** Integrations with Large Language Models for automated summary generation and tag recommendations.
* **Offline Workspace:** Client-side IndexedDB caching and synchronization queues to support editing notes offline.
