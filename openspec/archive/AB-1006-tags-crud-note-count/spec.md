# Spec — AB-1006: Tags — CRUD + Note Count per Tag

**Status:** Draft — awaiting approval
**Ticket:** AB-1006
**Branch:** feature/backend/AB-1006-tags-crud-note-count
**FRS References:** §4.3.1, §4.3.2, §4.3.3
**SDS References:** §5.2
**Layer:** Backend only
**Depends on:** AB-1005 (notes pagination branch; tag model + NoteTag already in schema)

---

## Summary

Implements the full tag management layer: list, create, rename, delete, attach to note, and detach from note. Extends the existing `ITagResponse` shape with a `noteCount` field (count of active, non-deleted notes carrying the tag) and an optional `color` hex field. The `GET /api/tags` list endpoint supports optional sorting by name or note count. Tag names are case-insensitively unique per user via `normalizedName`. All tag operations are strictly user-scoped.

---

## In Scope

- `GET /api/tags` — list authenticated user's tags with `noteCount` and optional sorting
- `POST /api/tags` — create tag with `name` and optional `color`
- `PATCH /api/tags/:id` — rename tag and/or update color
- `DELETE /api/tags/:id` — delete tag; cascade removes all `NoteTag` rows
- `POST /api/notes/:id/tags/:tagId` — attach tag to note (idempotent)
- `DELETE /api/notes/:id/tags/:tagId` — detach tag from note (idempotent)
- `noteCount` field on every `ITagResponse` (list endpoint and tags embedded in note responses)
- `color` field (optional hex string, nullable) on `ITagResponse` and tag create/update
- `TagRepository`, `TagService`, `tagRoutes` (all new files)
- Migration to add nullable `color` column to `Tag` table

## Out of Scope

- Tag pagination (list returns all user tags, no page/limit)
- Tag search / filtering by name
- Bulk tag operations
- Transferring tags between users
- Public access to tags via share links

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | `noteCount` counts only active (non-deleted) notes; soft-deleted notes are excluded | User answer Q1 |
| A2 | `noteCount` is present in every `ITagResponse` instance, including tags embedded inside note responses (`INoteResponse.tags[]`) | User answer Q2 |
| A3 | `GET /api/tags` sort is controlled by optional query params `sortBy=name\|noteCount` and `sortDir=asc\|desc`; defaults are `sortBy=name`, `sortDir=asc` | Q3 unanswered; FRS §4.3.2 "sortable by frequency" |
| A4 | Tag rename (`PATCH /api/tags/:id`) is in scope for this ticket | User answer Q4 |
| A5 | `color` is optional (nullable) on create and update; validated as a 3- or 6-digit hex string (`#RGB` or `#RRGGBB`) when provided | User answer Q5; SDS §5.2 |
| A6 | On attach/detach, note ownership is verified before tag ownership; `NOTE_NOT_FOUND` takes precedence when both are missing | User answer Q6 |
| A7 | Renaming a tag to its own current name (same `normalizedName`) is a no-op and returns 200 | Idempotency; not specified otherwise |
| A8 | `PATCH /api/tags/:id` with an empty body `{}` is a valid no-op and returns 200 with the unchanged tag | Follows same pattern as `PATCH /api/notes/:id` |
| A9 | Attaching a tag from another user to one's own note is treated as `TAG_NOT_FOUND` (ownership enforced on tag) | Cross-user isolation rule; AGENTS.md §10 |
| A10 | `normalizedName` is stored as `name.trim().toLowerCase()` for uniqueness checking | Existing schema `@@unique([userId, normalizedName])` |
| A11 | Adding `noteCount` to `ITagResponse` requires `NoteRepository` to compute tag note counts in all note queries that include tags | User answer Q2; architecture impact |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| T1 | List tags — default sort | User has 2 tags; no sort params | GET /api/tags | 200 `{ data: [...] }` ordered by name asc; each tag has `id`, `name`, `color`, `noteCount`, `createdAt` | §4.3.2 AC1, AC3 | — |
| T2 | List tags — empty | User has no tags | GET /api/tags | 200 `{ data: [] }` | §4.3.2 AC3 | — |
| T3 | List tags — sort by noteCount desc | User has tags with varying note counts | GET /api/tags?sortBy=noteCount&sortDir=desc | 200, tags ordered highest noteCount first | §4.3.2 AC2 | — |
| T4 | List tags — sort by name desc | Any user with tags | GET /api/tags?sortBy=name&sortDir=desc | 200, tags ordered name Z→A | §4.3.2 AC2 | — |
| T5 | List tags — invalid sortBy | Any user | GET /api/tags?sortBy=color | 400 VALIDATION_ERROR, `error.fields` contains "sortBy" | §4.3.2 AC2 | `VALIDATION_ERROR` |
| T6 | List tags — invalid sortDir | Any user | GET /api/tags?sortDir=random | 400 VALIDATION_ERROR, `error.fields` contains "sortDir" | §4.3.2 AC2 | `VALIDATION_ERROR` |
| T7 | List tags — noteCount excludes soft-deleted notes | Tag attached to 1 active note and 1 soft-deleted note | GET /api/tags | 200, tag `noteCount=1` | §4.3.2 AC1 | — |
| T8 | List tags — cross-user isolation | UserA and UserB each have tags | GET /api/tags as UserA | 200, only UserA's tags returned | §4.3.2 AC3 | — |
| T9 | List tags — missing auth | No token | GET /api/tags | 401 UNAUTHORIZED | §4.3.2 AC3 | `UNAUTHORIZED` |
| T10 | Create tag — name + color | Valid name and hex color | POST /api/tags `{ name, color }` | 201 `{ data: { id, name, color, noteCount: 0, createdAt } }` | §4.3.1 AC1, AC2 | — |
| T11 | Create tag — name only, no color | Valid name, color omitted | POST /api/tags `{ name }` | 201, `color: null`, `noteCount: 0` | §4.3.1 AC1 | — |
| T12 | Create tag — duplicate name (exact) | Tag "Work" exists for user | POST /api/tags `{ name: "Work" }` | 422 TAG_NAME_TAKEN | §4.3.1 AC3 | `TAG_NAME_TAKEN` |
| T13 | Create tag — duplicate name (case-insensitive) | Tag "work" exists for user | POST /api/tags `{ name: "WORK" }` | 422 TAG_NAME_TAKEN | §4.3.1 AC3 | `TAG_NAME_TAKEN` |
| T14 | Create tag — same name, different user | Other user has tag "work" | POST /api/tags `{ name: "work" }` as this user | 201, tag created successfully | §4.3.1 AC2 | — |
| T15 | Create tag — invalid color (not hex) | Any user | POST /api/tags `{ name: "x", color: "red" }` | 400 VALIDATION_ERROR, `error.fields` contains "color" | §4.3.1 AC1 | `VALIDATION_ERROR` |
| T16 | Create tag — missing name | Any user | POST /api/tags `{}` | 400 VALIDATION_ERROR, `error.fields` contains "name" | §4.3.1 AC1 | `VALIDATION_ERROR` |
| T17 | Create tag — empty name | Any user | POST /api/tags `{ name: "" }` | 400 VALIDATION_ERROR | §4.3.1 AC1 | `VALIDATION_ERROR` |
| T18 | Create tag — name too long (>50 chars) | Any user | POST /api/tags with 51-char name | 400 VALIDATION_ERROR | §4.3.1 AC1 | `VALIDATION_ERROR` |
| T19 | Create tag — missing auth | No token | POST /api/tags | 401 UNAUTHORIZED | §4.3.1 AC2 | `UNAUTHORIZED` |
| T20 | Rename tag — update name | Tag exists, owned by user | PATCH /api/tags/:id `{ name: "New Name" }` | 200 `{ data: { id, name: "New Name", color, noteCount, createdAt } }` | §4.3.3 AC1 | — |
| T21 | Update tag — update color | Tag exists, owned by user | PATCH /api/tags/:id `{ color: "#FF0000" }` | 200, `color: "#FF0000"` | §4.3.3 AC1 | — |
| T22 | Update tag — clear color | Tag has color | PATCH /api/tags/:id `{ color: null }` | 200, `color: null` | §4.3.3 AC1 | — |
| T23 | Update tag — empty body no-op | Tag exists | PATCH /api/tags/:id `{}` | 200, unchanged tag returned | A8 | — |
| T24 | Rename tag — duplicate name (case-insensitive) | Tag "Work" exists; user owns tag "Ideas" | PATCH /api/tags/:ideas-id `{ name: "work" }` | 422 TAG_NAME_TAKEN | §4.3.1 AC3 | `TAG_NAME_TAKEN` |
| T25 | Rename tag — same name as self | Tag "Work" owned by user | PATCH /api/tags/:id `{ name: "work" }` | 200, unchanged (normalizedName collision with self is a no-op) | A7 | — |
| T26 | Update tag — not found | Tag ID doesn't exist | PATCH /api/tags/:id | 404 TAG_NOT_FOUND | §4.3.3 AC1 | `TAG_NOT_FOUND` |
| T27 | Update tag — other user's tag | Tag belongs to other user | PATCH /api/tags/:id | 404 TAG_NOT_FOUND | §4.3.3 AC1 | `TAG_NOT_FOUND` |
| T28 | Update tag — missing auth | No token | PATCH /api/tags/:id | 401 UNAUTHORIZED | §4.3.3 AC1 | `UNAUTHORIZED` |
| T29 | Delete tag — happy path | Tag exists, attached to 2 notes | DELETE /api/tags/:id | 204; NoteTag rows for that tag removed; notes still exist | §4.3.3 AC2, AC3 | — |
| T30 | Delete tag — not found | Tag ID doesn't exist | DELETE /api/tags/:id | 404 TAG_NOT_FOUND | §4.3.3 AC2 | `TAG_NOT_FOUND` |
| T31 | Delete tag — other user's tag | Tag belongs to other user | DELETE /api/tags/:id | 404 TAG_NOT_FOUND | §4.3.3 AC2 | `TAG_NOT_FOUND` |
| T32 | Delete tag — missing auth | No token | DELETE /api/tags/:id | 401 UNAUTHORIZED | §4.3.3 AC2 | `UNAUTHORIZED` |
| T33 | Attach tag — happy path | Active note + tag both owned by user | POST /api/notes/:id/tags/:tagId | 200 `{ data: note }` with tag in `tags[]` | §4.3.3 AC2 | — |
| T34 | Attach tag — idempotent | Tag already attached to note | POST /api/notes/:id/tags/:tagId | 200 same note, no error | A (idempotency) | — |
| T35 | Attach tag — note not found | Note ID doesn't exist | POST /api/notes/:id/tags/:tagId | 404 NOTE_NOT_FOUND | §4.3.3 | `NOTE_NOT_FOUND` |
| T36 | Attach tag — note soft-deleted | Note is soft-deleted | POST /api/notes/:id/tags/:tagId | 404 NOTE_NOT_FOUND | §4.3.3 | `NOTE_NOT_FOUND` |
| T37 | Attach tag — tag not found | Valid note, tag ID doesn't exist | POST /api/notes/:id/tags/:tagId | 404 TAG_NOT_FOUND | §4.3.3 | `TAG_NOT_FOUND` |
| T38 | Attach tag — both not found | Note and tag both missing | POST /api/notes/:id/tags/:tagId | 404 NOTE_NOT_FOUND (note checked first) | A6 | `NOTE_NOT_FOUND` |
| T39 | Attach tag — other user's note | Note belongs to other user | POST /api/notes/:id/tags/:tagId | 404 NOTE_NOT_FOUND | §4.3.3 | `NOTE_NOT_FOUND` |
| T40 | Attach tag — other user's tag | Own note, tag owned by other user | POST /api/notes/:id/tags/:tagId | 404 TAG_NOT_FOUND | A9 | `TAG_NOT_FOUND` |
| T41 | Attach tag — missing auth | No token | POST /api/notes/:id/tags/:tagId | 401 UNAUTHORIZED | §4.3.3 | `UNAUTHORIZED` |
| T42 | Detach tag — happy path | Tag is attached to note | DELETE /api/notes/:id/tags/:tagId | 200 `{ data: note }` without detached tag in `tags[]` | §4.3.3 AC2 | — |
| T43 | Detach tag — idempotent | Tag not attached to note | DELETE /api/notes/:id/tags/:tagId | 200, note returned (tags unchanged) | A (idempotency) | — |
| T44 | Detach tag — note not found | Note ID doesn't exist | DELETE /api/notes/:id/tags/:tagId | 404 NOTE_NOT_FOUND | §4.3.3 | `NOTE_NOT_FOUND` |
| T45 | Detach tag — note soft-deleted | Note is soft-deleted | DELETE /api/notes/:id/tags/:tagId | 404 NOTE_NOT_FOUND | §4.3.3 | `NOTE_NOT_FOUND` |
| T46 | Detach tag — tag not found | Valid note, tag ID doesn't exist | DELETE /api/notes/:id/tags/:tagId | 404 TAG_NOT_FOUND | §4.3.3 | `TAG_NOT_FOUND` |
| T47 | Detach tag — missing auth | No token | DELETE /api/notes/:id/tags/:tagId | 401 UNAUTHORIZED | §4.3.3 | `UNAUTHORIZED` |

---

## API Contract

### GET /api/tags

**Auth required:** Yes
**Query params:**

| Param | Type | Default | Allowed values |
|-------|------|---------|----------------|
| `sortBy` | string | `name` | `name`, `noteCount` |
| `sortDir` | string | `asc` | `asc`, `desc` |

**Success response:** HTTP 200
```json
{
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "name": "Work",
      "color": "#3B82F6",
      "noteCount": 5,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```
**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid `sortBy` or `sortDir` value |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |

---

### POST /api/tags

**Auth required:** Yes
**Request body:**
```json
{
  "name": "string — required, 1–50 chars, trimmed",
  "color": "string | null — optional, hex format #RGB or #RRGGBB"
}
```
**Success response:** HTTP 201
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "name": "Work",
    "color": "#3B82F6",
    "noteCount": 0,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```
**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Missing/empty `name`, name >50 chars, invalid `color` format |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 422 | `TAG_NAME_TAKEN` | Tag with same name (case-insensitive) already exists for this user |

---

### PATCH /api/tags/:id

**Auth required:** Yes
**Request body:** (all fields optional; empty body `{}` is a valid no-op)
```json
{
  "name": "string — optional, 1–50 chars, trimmed",
  "color": "string | null — optional, hex format or null to clear"
}
```
**Success response:** HTTP 200
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "name": "Updated Name",
    "color": null,
    "noteCount": 3,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```
**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | Invalid field values (empty name, bad color format) |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 404 | `TAG_NOT_FOUND` | Tag not found or belongs to another user |
| 422 | `TAG_NAME_TAKEN` | New name conflicts with another tag owned by this user |

---

### DELETE /api/tags/:id

**Auth required:** Yes
**Success response:** HTTP 204 (no body)
**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 404 | `TAG_NOT_FOUND` | Tag not found or belongs to another user |

---

### POST /api/notes/:id/tags/:tagId

**Auth required:** Yes
**Success response:** HTTP 200 — full note object with updated `tags[]`
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "title": "My Note",
    "content": "...",
    "deletedAt": null,
    "createdAt": "...",
    "updatedAt": "...",
    "tags": [
      {
        "id": "uuid",
        "userId": "uuid",
        "name": "Work",
        "color": "#3B82F6",
        "noteCount": 3,
        "createdAt": "..."
      }
    ]
  }
}
```
**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 404 | `NOTE_NOT_FOUND` | Note not found, soft-deleted, or belongs to another user (checked first) |
| 404 | `TAG_NOT_FOUND` | Tag not found or belongs to another user |

---

### DELETE /api/notes/:id/tags/:tagId

**Auth required:** Yes
**Success response:** HTTP 200 — full note object with updated `tags[]` (same shape as attach)
**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 404 | `NOTE_NOT_FOUND` | Note not found, soft-deleted, or belongs to another user |
| 404 | `TAG_NOT_FOUND` | Tag not found or belongs to another user |

---

## Database Changes

### Migration: `add_tag_color`

**Type:** Additive only — adds one nullable column.

```prisma
model Tag {
  id             String   @id @default(uuid())
  userId         String
  name           String
  normalizedName String
  color          String?  // NEW — nullable hex color string
  createdAt      DateTime @default(now())

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  noteTags NoteTag[]

  @@unique([userId, normalizedName])
}
```

No other schema changes. `NoteTag` cascade-delete behavior is already in place.

---

## Shared Package Changes

### `packages/shared/src/types/index.ts`

Update `ITagResponse` — add `color` and `noteCount`:

```typescript
export interface ITagResponse {
  id: string;
  userId: string;
  name: string;
  color: string | null;   // NEW
  noteCount: number;       // NEW
  createdAt: string;
}
```

> **Impact:** `INoteResponse.tags` is typed as `ITagResponse[]`. Adding these fields means `NoteRepository` must compute `noteCount` for tags in all note queries (see Architecture Notes).

### `packages/shared/src/schemas/index.ts`

Add three new schemas:

```typescript
// For POST /api/tags
export const createTagSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color")
    .nullable()
    .optional(),
});

// For PATCH /api/tags/:id
export const updateTagSchema = z.object({
  name: z.string().min(1).max(50).trim().optional(),
  color: z
    .string()
    .regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, "Invalid hex color")
    .nullable()
    .optional(),
});

// For GET /api/tags query params
export const listTagsQuerySchema = z.object({
  sortBy: z.enum(['name', 'noteCount']).default('name'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
});

export type TCreateTagInput = z.infer<typeof createTagSchema>;
export type TUpdateTagInput = z.infer<typeof updateTagSchema>;
export type TListTagsQuery = z.infer<typeof listTagsQuerySchema>;
```

> Note: The existing `createTagSchema` (name-only) will be **replaced** by the above.

### `packages/shared/src/errors.ts`

No new error codes required. All needed codes (`TAG_NOT_FOUND`, `TAG_NAME_TAKEN`, `NOTE_NOT_FOUND`, `UNAUTHORIZED`, `VALIDATION_ERROR`) already exist.

---

## Architecture Notes

### noteCount in NoteRepository

Adding `noteCount` to `ITagResponse` requires updating the `noteInclude` constant in `NoteRepository.ts` to compute note counts for each tag. The Prisma query shape becomes:

```typescript
const noteInclude = {
  noteTags: {
    include: {
      tag: {
        include: {
          _count: {
            select: {
              noteTags: { where: { note: { deletedAt: null } } },
            },
          },
        },
      },
    },
  },
} as const;
```

`mapRecord` must then map `nt.tag._count.noteTags` → `noteCount` in the tag shape. This is the only change to `NoteRepository.ts`.

### Tag-sort by noteCount on GET /api/tags

Prisma does not support `orderBy` on aggregate counts in a straightforward way with `findMany`. Two options:

1. Fetch all tags with `_count.noteTags` and sort in application code (acceptable for typical tag list sizes).
2. Use a raw query. Option 1 is preferred to avoid raw SQL.

`TagRepository.findAllByUserId` will fetch all tags with counts, then the service sorts before returning.

### Rename idempotency (PATCH self-name)

When renaming to the same `normalizedName` that already belongs to the same tag (self-collision), `Prisma.update` would succeed (no unique violation since it's the same record). The service can detect this by comparing normalized names before checking uniqueness, or simply let Prisma update succeed as a no-op.
