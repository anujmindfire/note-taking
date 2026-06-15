# Spec — AB-1008: Sharing — Generate Link, Revoke, Public Access, Atomic View Count

**Status:** Draft — awaiting approval
**Ticket:** AB-1008
**Branch:** feature/backend/AB-1008-sharing
**FRS References:** §4.5.1, §4.5.2, §4.5.3, §5.2.4, §5.3
**SDS References:** §5.1 (SharedLink ERD), §5.2 (Prisma SharedLink model)
**Layer:** Backend only
**Depends on:** AB-1004

---

## Summary

Adds share-link functionality for notes. Authenticated owners can generate unique, read-only public URLs for any of their active notes — optionally with an expiration date — and can list all share links for a note (with view counts) or revoke any link at any time. Anonymous visitors access shared notes via a cryptographic token with no authentication required. Each successful public access atomically increments the link's `viewCount` counter. Expired, revoked, and links to soft-deleted notes are refused with distinct HTTP status codes per FRS §4.5.3.

---

## In Scope

- `POST /api/notes/:noteId/shares` — generate a share link (auth required)
- `GET /api/notes/:noteId/shares` — list all share links for a note (auth required)
- `POST /api/shares/:shareId/revoke` — revoke a share link (auth required); returns updated link
- `GET /api/share/:token` — public read-only access to a shared note (no auth)
- Atomic `viewCount` increment on each successful public access via Prisma `increment`
- `SharedLink` Prisma model and migration
- New error codes: `SHARE_NOT_FOUND`, `SHARE_REVOKED`, `SHARE_EXPIRED`

## Out of Scope

- Frontend implementation
- Updating any share link field after creation (e.g., changing `expiresAt`)
- Bulk revocation of all links for a note in a single call
- Per-link analytics beyond `viewCount`
- Email or push notification on link access or revocation

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | Token generated via `crypto.randomBytes(32).toString('hex')` — 64-char lowercase hex string; unique enforced by DB `@@unique` | User Q1 |
| A2 | Accessing a share link whose note has `deletedAt` set → 410 `SHARE_EXPIRED` (soft-delete treated as implicit expiry) | User Q2 |
| A3 | Public access response includes the full note matching `INoteResponse` shape: all date fields as ISO strings, tags array with `noteCount` | User Q3 |
| A4 | `GET /api/notes/:noteId/shares` is in scope for this ticket | User Q4 |
| A5 | Maximum `expiresAt` = now + 365 days (UTC); values beyond this → 400 `VALIDATION_ERROR` | User Q5 |
| A6 | Revoking an already-revoked link is idempotent — returns 200 with the existing link record unchanged | Spec default |
| A7 | `POST /api/shares/:shareId/revoke` returns 200 with the updated `ISharedLinkResponse` (not 204) | User Q6 |
| A8 | `viewCount` incremented only on successful access (valid token, not revoked, not expired, note not soft-deleted); error responses do not increment | FRS §4.5.3 AC2 — "successful load" |
| A9 | Generating a share link for a soft-deleted note → 404 `NOTE_NOT_FOUND` (consistent with all other note operations) | Existing pattern |
| A10 | Share links are NOT cascade-deleted when a note is soft-deleted; they stop working at access time (A2) but remain in DB; they ARE hard-deleted when a note is hard-deleted (Prisma `onDelete: Cascade`) | Complement to A2 |
| A11 | List endpoint returns all links for the note regardless of state (active, expired, revoked) — owner needs full visibility | Spec default |
| A12 | Ownership check for revoke joins through `SharedLink → Note.userId`; the `SharedLink` table has no direct `userId` column | SDS §5.1 ERD |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Generate link — no expiry | Auth user owns active note | `POST /api/notes/:noteId/shares` body `{}` | HTTP 201 `{ data: ISharedLinkResponse }` — `expiresAt: null`, `revokedAt: null`, `viewCount: 0`, 64-char hex `token` | §4.5.1 AC1 | — |
| S2 | Generate link — valid future expiresAt | Auth user owns active note | `POST /api/notes/:noteId/shares` body `{ "expiresAt": "<ISO within 1 year>" }` | HTTP 201 `{ data: ISharedLinkResponse }` with `expiresAt` set | §4.5.1 AC2 | — |
| S3 | Generate link — multiple links same note | Auth user owns note; 1 link already exists | `POST /api/notes/:noteId/shares` body `{}` | HTTP 201 second link created; both independently valid; original unaffected | §4.5.1 AC4 | — |
| S4 | Generate link — expiresAt in past | Auth user | `POST /api/notes/:noteId/shares` body `{ "expiresAt": "<ISO past>" }` | HTTP 400 `VALIDATION_ERROR`, `fields: ["expiresAt"]` | §4.5.1 AC2 | `VALIDATION_ERROR` |
| S5 | Generate link — expiresAt exceeds 1-year max | Auth user | `POST /api/notes/:noteId/shares` body `{ "expiresAt": "<date > 365 days from now>" }` | HTTP 400 `VALIDATION_ERROR`, `fields: ["expiresAt"]` | A5 | `VALIDATION_ERROR` |
| S6 | Generate link — note not found | Auth user | `POST /api/notes/:nonexistentId/shares` | HTTP 404 `NOTE_NOT_FOUND` | §4.5.1 AC1 | `NOTE_NOT_FOUND` |
| S7 | Generate link — note belongs to other user | User B owns note; User A requests | `POST /api/notes/:noteId/shares` as User A | HTTP 404 `NOTE_NOT_FOUND` | §4.5.1 AC1 | `NOTE_NOT_FOUND` |
| S8 | Generate link — note is soft-deleted | Auth user; note has `deletedAt` set | `POST /api/notes/:noteId/shares` | HTTP 404 `NOTE_NOT_FOUND` | A9 | `NOTE_NOT_FOUND` |
| S9 | Generate link — no auth | No Authorization header | `POST /api/notes/:noteId/shares` | HTTP 401 `UNAUTHORIZED` | §5.2 AC4 | `UNAUTHORIZED` |
| S10 | List links — note has links | Auth user owns note with 2 links | `GET /api/notes/:noteId/shares` | HTTP 200 `{ data: [ISharedLinkResponse, ISharedLinkResponse] }` | A4 | — |
| S11 | List links — no links exist | Auth user owns note; no links generated | `GET /api/notes/:noteId/shares` | HTTP 200 `{ data: [] }` | A4 | — |
| S12 | List links — includes revoked and expired links | Auth user owns note with 1 active + 1 revoked link | `GET /api/notes/:noteId/shares` | HTTP 200 `{ data: [...both links...] }` — all states returned | A11 | — |
| S13 | List links — note not found | Auth user | `GET /api/notes/:nonexistentId/shares` | HTTP 404 `NOTE_NOT_FOUND` | A4 | `NOTE_NOT_FOUND` |
| S14 | List links — note belongs to other user | User B owns note; User A requests | `GET /api/notes/:noteId/shares` as User A | HTTP 404 `NOTE_NOT_FOUND` | A4 | `NOTE_NOT_FOUND` |
| S15 | List links — no auth | No Authorization header | `GET /api/notes/:noteId/shares` | HTTP 401 `UNAUTHORIZED` | §5.2 AC4 | `UNAUTHORIZED` |
| S16 | Revoke link — happy path | Auth user owns note and link; link is active | `POST /api/shares/:shareId/revoke` | HTTP 200 `{ data: ISharedLinkResponse }` with `revokedAt` set to current timestamp | §4.5.2 AC1 | — |
| S17 | Revoke link — already revoked (idempotent) | Auth user; link already has `revokedAt` set | `POST /api/shares/:shareId/revoke` | HTTP 200 `{ data: ISharedLinkResponse }` with original `revokedAt` unchanged | A6 | — |
| S18 | Revoke link — immediate effect | Auth user revokes link | `GET /api/share/:token` after revoke | HTTP 403 `SHARE_REVOKED` — link invalid immediately | §4.5.2 AC2 | `SHARE_REVOKED` |
| S19 | Revoke link — not found | Auth user | `POST /api/shares/:nonexistentId/revoke` | HTTP 404 `SHARE_NOT_FOUND` | §4.5.2 AC1 | `SHARE_NOT_FOUND` |
| S20 | Revoke link — belongs to other user's note | User B owns note/link; User A requests | `POST /api/shares/:shareId/revoke` as User A | HTTP 404 `SHARE_NOT_FOUND` | §4.5.2 AC1 | `SHARE_NOT_FOUND` |
| S21 | Revoke link — no auth | No Authorization header | `POST /api/shares/:shareId/revoke` | HTTP 401 `UNAUTHORIZED` | §5.2 AC4 | `UNAUTHORIZED` |
| S22 | Public access — valid active link | Non-expired, non-revoked link; note is active | `GET /api/share/:token` (no auth header) | HTTP 200 `{ data: INoteResponse (full with tags) }`; `viewCount` atomically incremented by 1 | §4.5.3 AC1, AC2 | — |
| S23 | Public access — viewCount increments correctly | Auth user views valid link | `GET /api/share/:token` × 3 sequential | `viewCount` increases by exactly 3; each response HTTP 200 | §4.5.3 AC2, NFR §5.3 | — |
| S24 | Public access — token not found | Unknown token string | `GET /api/share/unknowntoken` | HTTP 404 `SHARE_NOT_FOUND` | §4.5.3 AC3 | `SHARE_NOT_FOUND` |
| S25 | Public access — link revoked | `revokedAt` is set | `GET /api/share/:token` | HTTP 403 `SHARE_REVOKED` | §4.5.3 AC3 | `SHARE_REVOKED` |
| S26 | Public access — link expired | `expiresAt` is in the past | `GET /api/share/:token` | HTTP 410 `SHARE_EXPIRED` | §4.5.3 AC3 | `SHARE_EXPIRED` |
| S27 | Public access — note soft-deleted | Note has `deletedAt` set; link otherwise active | `GET /api/share/:token` | HTTP 410 `SHARE_EXPIRED` | A2 | `SHARE_EXPIRED` |
| S28 | Public access — no auth required | No Authorization header | `GET /api/share/:token` for valid link | HTTP 200 — public endpoint, no JWT required | §5.2 AC4 | — |
| S29 | Public access — error precedence: revoked beats expired | Link has both `revokedAt` and past `expiresAt` set | `GET /api/share/:token` | HTTP 403 `SHARE_REVOKED` (revoked checked before expired) | A2, §4.5.3 | `SHARE_REVOKED` |

---

## API Contract

### POST /api/notes/:noteId/shares

**Auth required:** Yes

**Request body:**
```json
{
  "expiresAt": "ISO 8601 datetime string — optional; must be future; max 365 days from now"
}
```

**Success response:** HTTP 201
```json
{
  "data": {
    "id": "uuid",
    "noteId": "uuid",
    "token": "a3f8c2e1...64-char-hex",
    "expiresAt": "2025-01-01T00:00:00.000Z",
    "revokedAt": null,
    "viewCount": 0,
    "createdAt": "2024-06-15T10:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | `expiresAt` is not a valid ISO datetime, is in the past, or exceeds 365 days from now |
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 404 | `NOTE_NOT_FOUND` | Note not found, belongs to another user, or is soft-deleted |

---

### GET /api/notes/:noteId/shares

**Auth required:** Yes

**Success response:** HTTP 200
```json
{
  "data": [
    {
      "id": "uuid",
      "noteId": "uuid",
      "token": "a3f8c2e1...64-char-hex",
      "expiresAt": "2025-01-01T00:00:00.000Z",
      "revokedAt": null,
      "viewCount": 42,
      "createdAt": "2024-06-15T10:00:00.000Z"
    }
  ]
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 404 | `NOTE_NOT_FOUND` | Note not found or belongs to another user |

---

### POST /api/shares/:shareId/revoke

**Auth required:** Yes

**Request body:** none

**Success response:** HTTP 200
```json
{
  "data": {
    "id": "uuid",
    "noteId": "uuid",
    "token": "a3f8c2e1...64-char-hex",
    "expiresAt": null,
    "revokedAt": "2024-06-15T10:05:00.000Z",
    "viewCount": 7,
    "createdAt": "2024-06-15T10:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid Authorization header |
| 404 | `SHARE_NOT_FOUND` | Share link not found or note belongs to another user |

---

### GET /api/share/:token

**Auth required:** No

**Success response:** HTTP 200
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "title": "Weekly Planning Notes",
    "content": "Review sprint progress and goals for the week.",
    "deletedAt": null,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "tags": [
      {
        "id": "uuid",
        "userId": "uuid",
        "name": "Work",
        "color": "#ff0000",
        "noteCount": 3,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 403 | `SHARE_REVOKED` | Link `revokedAt` is set (checked before expiry) |
| 404 | `SHARE_NOT_FOUND` | Token not found in DB |
| 410 | `SHARE_EXPIRED` | `expiresAt` is in the past, or note has `deletedAt` set |

---

## Database Changes

**New model:** `SharedLink`

Add to `apps/backend/prisma/schema.prisma`:

```prisma
model SharedLink {
  id        String    @id @default(uuid())
  noteId    String
  token     String    @unique
  expiresAt DateTime?
  revokedAt DateTime?
  viewCount Int       @default(0)
  createdAt DateTime  @default(now())

  note Note @relation(fields: [noteId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([noteId])
}
```

**Update `Note` model** — add relation back-reference (no SQL column added):

```prisma
model Note {
  ...existing fields...
  sharedLinks SharedLink[]
}
```

**Migration:** `add_shared_link` — **ADDITIVE**. Creates `SharedLink` table and its two indexes. No changes to existing columns or data; the `Note` back-reference is Prisma-only (no SQL change to the `Note` table).

---

## Shared Package Changes

### New interface in `src/types/index.ts`

```typescript
export interface ISharedLinkResponse {
  id: string;
  noteId: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  createdAt: string;
}
```

### New Zod schema in `src/schemas/index.ts`

```typescript
export const createShareLinkSchema = z.object({
  expiresAt: z
    .string()
    .datetime({ message: 'expiresAt must be a valid ISO 8601 datetime' })
    .refine((v) => new Date(v) > new Date(), {
      message: 'expiresAt must be in the future',
    })
    .refine((v) => new Date(v) <= new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), {
      message: 'expiresAt must not exceed 1 year from now',
    })
    .optional(),
});

export type TCreateShareLinkInput = z.infer<typeof createShareLinkSchema>;
```

### New error codes in `src/errors.ts`

```typescript
SHARE_NOT_FOUND: "SHARE_NOT_FOUND",  // 404 — token or shareId not found, or note belongs to another user
SHARE_REVOKED:   "SHARE_REVOKED",    // 403 — link has revokedAt set
SHARE_EXPIRED:   "SHARE_EXPIRED",    // 410 — expiresAt in past, or note is soft-deleted
```

---

## Architecture Notes

**Route mounting:** Three distinct path prefixes require separate route files or careful co-location:
- Note-scoped endpoints (`POST /api/notes/:noteId/shares`, `GET /api/notes/:noteId/shares`) — add to existing `noteRoutes.ts` or a new `noteShareRoutes.ts` mounted at `/api/notes`
- Owner action (`POST /api/shares/:shareId/revoke`) — new `shareRoutes.ts` mounted at `/api/shares`
- Public endpoint (`GET /api/share/:token`) — new `publicShareRoutes.ts` mounted at `/api/share`

**Public endpoint has no `requireAuth`:** `GET /api/share/:token` is the only endpoint in this ticket that must not apply `requireAuth` middleware (per FRS §5.2.4 — "except public share URLs").

**Atomic view count:** `ShareRepository` must use Prisma's atomic `increment` operator to satisfy NFR §5.3 (no lost-update race conditions):
```typescript
prisma.sharedLink.update({
  where: { id: link.id },
  data: { viewCount: { increment: 1 } },
})
```

**Ownership check for revoke:** `SharedLink` has no `userId` column. Ownership is verified by joining through `note`: `SharedLink.note.userId === requestingUserId`. The repository method `findByIdForOwner(shareId, userId)` must query `prisma.sharedLink.findFirst({ where: { id: shareId, note: { userId } } })`.

**Error precedence on public access** (S29): Service must check in this order:
1. Token exists → 404 `SHARE_NOT_FOUND` if not
2. `revokedAt` is set → 403 `SHARE_REVOKED`
3. `expiresAt` is past OR `note.deletedAt` is set → 410 `SHARE_EXPIRED`
4. Increment `viewCount` atomically → return note

This ordering ensures revoked takes priority over expired, preventing information leakage about expiry state of revoked links.
