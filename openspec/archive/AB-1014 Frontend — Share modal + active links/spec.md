# Spec — AB-1014: Frontend — Share Modal + Active Links

**Status:** Draft — awaiting approval
**Ticket:** AB-1014
**Branch:** feature/frontend/AB-1014-share-modal-active-links
**FRS References:** §4.5.1, §4.5.2, §4.5.3
**SDS References:** §3.1 (State Division Matrix), §3.2 (Client Route Registry)
**Layer:** Frontend only
**Depends on:** AB-1013 (Frontend — Search UI), AB-1008 (Sharing backend)

---

## Summary

Adds a Share button to the NoteEditorPage top bar that opens a modal for managing public share links. From the modal, authenticated users can generate new links with an optional expiry date (via a date picker), view all active and expired links for the note with per-link status badges, copy the full shareable URL to clipboard, and revoke any link inline. Also adds the public `/shared/:token` route (`SharedNotePage`) that anonymous visitors land on — a minimal read-only layout with no auth guard, no navbar, and distinct error messages for expired, revoked, and not-found tokens. No backend or shared-package changes are required; all four sharing endpoints and the `ISharedLinkResponse` type were shipped in AB-1008.

---

## In Scope

- Share button added to the right side of the NoteEditorPage top bar
- `ShareModal` component (shadcn `Dialog`) with:
  - List of all links for the note (active + expired, each with a status badge)
  - Generate-link form with optional expiry date picker (shadcn `Calendar` + `Popover`)
  - Copy-to-clipboard per link (full URL: `${window.location.origin}/shared/${token}`)
  - Inline revoke per link (no confirmation dialog; link removed from list on success)
- Three TanStack Query hooks: `useShareLinks`, `useCreateShareLink`, `useRevokeShareLink`
- Public `/shared/:token` page (`SharedNotePage`) — no auth, read-only note display
- `usePublicNote(token)` hook consuming `GET /api/share/:token`
- Distinct error UI for `SHARE_EXPIRED`, `SHARE_REVOKED`, `SHARE_NOT_FOUND`
- `/shared/:token` registered as a public route in `App.tsx` (before the catch-all `*` redirect)
- shadcn `Calendar` and `Popover` components added to `apps/frontend/src/components/ui/`

## Out of Scope

- Backend changes — all sharing endpoints exist from AB-1008
- Shared package additions — `ISharedLinkResponse` and `createShareLinkSchema` already exist
- Editing or commenting on content from the public page
- Version history or tag management on the public page
- Managing share links from the NotesPage or NoteCard
- Revoked links shown in the modal list — they disappear on inline revoke
- Email or social-sharing integrations

---

## Assumptions

| # | Assumption | Source |
|---|-----------|--------|
| A1 | The shareable URL is constructed client-side as `${window.location.origin}/shared/${link.token}` — the backend returns only `token`, not a `url` field | Code inspection of `ISharedLinkResponse` in `packages/shared/src/types/index.ts` |
| A2 | The modal link list shows active and expired links; revoked links are hidden (disappear immediately after inline revoke) | User answer Q2 |
| A3 | Expiry uses a shadcn `Calendar` + `Popover` date picker (date-only); selected date is sent as end-of-day local time converted to ISO 8601 (`T23:59:59.000Z` offset applied) | User answer Q4; `createShareLinkSchema` validates ISO 8601 datetime |
| A4 | Revoking a link fires the API call immediately with no confirmation dialog | User answer Q5 |
| A5 | The public `/shared/:token` page is in scope for this ticket | User answer Q6 |
| A6 | Expired, revoked, and not-found errors each render a distinct human-readable message on the public page | User answer Q7 |
| A7 | Share button is placed at the far right of the NoteEditorPage top bar, before the save-status label | User answer Q1 |
| A8 | `SharedNotePage` uses a bare layout with no `Navbar` and no auth guard | SDS §3.2 lists `/shared/:token` as a Public route |
| A9 | `GET /api/share/:token` returns an `INoteResponse`-shaped object including `tags[]` | `publicShareRoutes.ts` returns `{ data: note }` from `ShareLinkService.accessPublicLink` |
| A10 | Past dates (including today) are disabled in the date picker; if no date is selected the `expiresAt` field is omitted from the request body | `createShareLinkSchema` requires `expiresAt` to be in the future when present |

---

## Scenario Table

| ID | Scenario | Given | When | Then | FRS AC | Error Code |
|:---|:---------|:------|:-----|:-----|:-------|:-----------|
| S1 | Open modal — no links yet | User is on NoteEditorPage; note has no share links | User clicks Share button | Modal opens; link list shows empty state ("No links yet"); generate form is visible | §4.5.1 AC1 | — |
| S2 | Open modal — links exist | Note has ≥1 existing link | User clicks Share button | Modal opens; all non-revoked links listed with truncated token, creation date, expiry (or "No expiry"), status badge, copy button, and revoke button | §4.5.1 AC4 | — |
| S3 | Generate link — no expiry | Modal is open; expiry field is blank | User clicks "Generate link" | `POST /api/notes/:id/shares` called with `{}` body; 201 response; new link appears at top of list with "Active" badge; toast "Link created" | §4.5.1 AC1, AC2 | — |
| S4 | Generate link — with expiry | Modal is open; user picks a future date in the date picker | User clicks "Generate link" | `POST /api/notes/:id/shares` called with `{ expiresAt: "<ISO datetime>" }`; 201; new link appears with expiry date and "Active" badge; toast "Link created" | §4.5.1 AC2 | — |
| S5 | Date picker disables past dates | Modal is open; date picker rendered | User attempts to select today or any past date | Calendar renders those dates as disabled; selection is rejected; "Generate link" is enabled only when field is blank or a valid future date is selected | §4.5.1 AC2 | — |
| S6 | Copy link to clipboard | Modal is open; a link is in the list | User clicks the copy icon next to a link | Full URL (`${origin}/shared/${token}`) written to clipboard; copy icon shows a checkmark for 2 s; toast "Copied to clipboard" | §4.5.1 AC3, §4.5.3 AC1 | — |
| S7 | Expired link shown with badge | Note has a link whose `expiresAt` is in the past and `revokedAt` is null | Modal opens | Expired link is listed with an "Expired" badge; copy and revoke buttons still present | §4.5.2 AC1 | — |
| S8 | Revoke an active link | Modal is open; ≥1 active link is visible | User clicks Revoke on a link | `POST /api/shares/:shareId/revoke` called; on 200, link removed from list (query `["shares", noteId]` invalidated); toast "Link revoked" | §4.5.2 AC1, AC2 | — |
| S9 | Revoke — link already gone | Link was deleted between page load and click | User clicks Revoke | API returns 404; toast shows error message; `["shares", noteId]` query refetched | §4.5.2 AC2 | `SHARE_NOT_FOUND` |
| S10 | Generate — note not found | Note soft-deleted in another session | User clicks Generate link | API returns 404 `NOTE_NOT_FOUND`; toast shows error; form is reset | §4.5.1 AC1 | `NOTE_NOT_FOUND` |
| S11 | Public page — valid token, loading | Anonymous visitor navigates to `/shared/:token` | Page mounts; API call in-flight | Skeleton placeholders shown for title and content area | §4.5.3 AC1 | — |
| S12 | Public page — valid active token | Valid, non-expired, non-revoked token | `GET /api/share/:token` returns 200 | Note title and rich-text content rendered read-only; tags displayed as badges; no navbar; view count incremented by backend atomically | §4.5.3 AC1, AC2 | — |
| S13 | Public page — expired token | Token `expiresAt` is in the past | Visitor navigates to `/shared/:token` | API returns 410; page shows "This link has expired." with a distinct message | §4.5.3 AC3 | `SHARE_EXPIRED` |
| S14 | Public page — note soft-deleted | Note associated with token was soft-deleted | Visitor navigates to `/shared/:token` | Backend returns 410 `SHARE_EXPIRED`; page shows "This link has expired." (same as S13) | §4.5.3 AC3 | `SHARE_EXPIRED` |
| S15 | Public page — revoked token | Token `revokedAt` is set | Visitor navigates to `/shared/:token` | API returns 403; page shows "This link has been revoked by the owner." | §4.5.3 AC3 | `SHARE_REVOKED` |
| S16 | Public page — token not found | Token string does not exist in DB | Visitor navigates to `/shared/:token` | API returns 404; page shows "This link could not be found." | §4.5.3 AC3 | `SHARE_NOT_FOUND` |

---

## API Contract

All four endpoints are pre-existing from AB-1008. Documented here for frontend consumption.

### POST /api/notes/:id/shares

**Auth required:** Yes
**Request body:**
```json
{
  "expiresAt": "2026-12-31T23:59:59.000Z"
}
```
`expiresAt` is optional — omit the field entirely for a no-expiry link.

**Success response:** HTTP 201
```json
{
  "data": {
    "id": "uuid",
    "noteId": "uuid",
    "token": "string",
    "expiresAt": "2026-12-31T23:59:59.000Z",
    "revokedAt": null,
    "viewCount": 0,
    "createdAt": "2026-06-15T10:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 400 | `VALIDATION_ERROR` | `expiresAt` fails schema (past date, wrong format, >1 year) |
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 404 | `NOTE_NOT_FOUND` | Note not found or belongs to another user |

---

### GET /api/notes/:id/shares

**Auth required:** Yes
**Success response:** HTTP 200
```json
{
  "data": [
    {
      "id": "uuid",
      "noteId": "uuid",
      "token": "string",
      "expiresAt": "2026-12-31T23:59:59.000Z",
      "revokedAt": null,
      "viewCount": 5,
      "createdAt": "2026-06-15T10:00:00.000Z"
    }
  ]
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
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
    "token": "string",
    "expiresAt": null,
    "revokedAt": "2026-06-15T12:00:00.000Z",
    "viewCount": 5,
    "createdAt": "2026-06-15T10:00:00.000Z"
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 401 | `UNAUTHORIZED` | Missing or invalid access token |
| 404 | `SHARE_NOT_FOUND` | Share link not found or belongs to another user's note |

---

### GET /api/share/:token

**Auth required:** No
**Success response:** HTTP 200
```json
{
  "data": {
    "id": "uuid",
    "userId": "uuid",
    "title": "Note title",
    "content": "<p>HTML content</p>",
    "deletedAt": null,
    "createdAt": "2026-06-15T10:00:00.000Z",
    "updatedAt": "2026-06-15T11:00:00.000Z",
    "tags": [
      { "id": "uuid", "name": "research", "color": "#3b82f6", "userId": "uuid", "noteCount": 3, "createdAt": "..." }
    ]
  }
}
```

**Error responses:**

| Status | Code | When |
|--------|------|------|
| 403 | `SHARE_REVOKED` | Token exists but `revokedAt` is set |
| 404 | `SHARE_NOT_FOUND` | Token not found in DB |
| 410 | `SHARE_EXPIRED` | `expiresAt` is in the past, or the note is soft-deleted |

---

## Database Changes

None — this is a frontend-only ticket. The `SharedLink` model was built in AB-1008.

---

## Shared Package Changes

None — `ISharedLinkResponse`, `createShareLinkSchema`, and `TCreateShareLinkInput` already exist in `packages/shared/src/`.

---

## Architecture Notes

### New files

| File | Purpose |
|------|---------|
| `apps/frontend/src/components/ShareModal.tsx` | Dialog with link list, generate form, copy + revoke per row |
| `apps/frontend/src/hooks/useShareLinks.ts` | `GET /api/notes/:id/shares`, key `["shares", noteId]` |
| `apps/frontend/src/hooks/useCreateShareLink.ts` | `POST /api/notes/:id/shares`, invalidates `["shares", noteId]` |
| `apps/frontend/src/hooks/useRevokeShareLink.ts` | `POST /api/shares/:shareId/revoke`, invalidates `["shares", noteId]` |
| `apps/frontend/src/hooks/usePublicNote.ts` | `GET /api/share/:token`, key `["public-note", token]` |
| `apps/frontend/src/pages/SharedNotePage.tsx` | Bare-layout public read-only note view |

### Modified files

| File | Change |
|------|--------|
| `apps/frontend/src/pages/NoteEditorPage.tsx` | Add Share button + `ShareModal` to top bar |
| `apps/frontend/src/App.tsx` | Add `/shared/:token` route before the catch-all `*`; no auth guard |

### shadcn components to install

`Calendar` and `Popover` are not yet present in `components/ui/`. They must be added via `pnpm dlx shadcn@latest add calendar popover` before implementing the date picker. `react-day-picker` will be pulled in as a peer dependency.

### URL construction

The full shareable URL is built client-side: `${window.location.origin}/shared/${link.token}`. The backend does not return a `url` field in `ISharedLinkResponse`.

### Public route registration

`/shared/:token` must be added to `App.tsx` **before** the catch-all `<Route path="*" …>` redirect, with no `ProtectedRoute` or `GuestRoute` wrapper. The `usePublicNote` hook calls the endpoint without the `Authorization` header (the backend route has no `requireAuth` middleware).

### TipTap on public page

`SharedNotePage` renders the note's HTML content read-only. Use TipTap's `useEditor` with `editable: false` and `EditorContent` — this is consistent with how the editor is already set up in `NoteEditorPage` and avoids a raw `dangerouslySetInnerHTML`.

### Link status derivation

A link's display status is derived client-side from the `ISharedLinkResponse` fields:
- `revokedAt !== null` → "Revoked" (hidden from list per A2)
- `expiresAt !== null && new Date(expiresAt) < new Date()` → "Expired"
- otherwise → "Active"
