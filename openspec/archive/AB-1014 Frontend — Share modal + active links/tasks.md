# Tasks — AB-1014: Frontend — Share Modal + Active Links

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — shadcn UI Components

- [ ] Run `pnpm dlx shadcn@latest add calendar --cwd apps/frontend` to generate `apps/frontend/src/components/ui/calendar.tsx`
- [ ] Run `pnpm dlx shadcn@latest add popover --cwd apps/frontend` to generate `apps/frontend/src/components/ui/popover.tsx`
- [ ] Verify `react-day-picker` is present in `apps/frontend/node_modules` (peer dependency pulled by shadcn)
- [ ] If `date-fns` is missing from the build, add it: `pnpm add date-fns --filter frontend`

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 2 — TanStack Query Hooks

- [ ] Create `apps/frontend/src/hooks/useShareLinks.ts`
  - [ ] `useQuery` with key `["shares", noteId]`
  - [ ] `GET /api/notes/:noteId/shares` via `api` instance
  - [ ] Returns `ISharedLinkResponse[]`
  - [ ] Accepts `enabled: boolean` parameter (only fetches when modal is open)
  - [ ] `throwOnError: false`; `meta.onError` fires `toast.error(getErrorMessage(err))`

- [ ] Create `apps/frontend/src/hooks/useCreateShareLink.ts`
  - [ ] `useMutation` accepting `TCreateShareLinkInput` (omit `expiresAt` entirely for no-expiry links — do not send `null`)
  - [ ] `POST /api/notes/:noteId/shares`
  - [ ] Returns `ISharedLinkResponse` (201)
  - [ ] `onSuccess`: invalidate `["shares", noteId]` + `toast.success("Link created")`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`

- [ ] Create `apps/frontend/src/hooks/useRevokeShareLink.ts`
  - [ ] `useMutation` accepting `shareId: string`
  - [ ] `POST /api/shares/:shareId/revoke` (no request body)
  - [ ] Returns `ISharedLinkResponse` (200)
  - [ ] `onSuccess`: invalidate `["shares", noteId]` + `toast.success("Link revoked")`
  - [ ] `onError`: `toast.error(getErrorMessage(err))`

- [ ] Create `apps/frontend/src/hooks/usePublicNote.ts`
  - [ ] `useQuery` with key `["public-note", token]`
  - [ ] `GET /api/share/:token` via `api` instance (no auth header needed — interceptor only adds it when token exists in store)
  - [ ] Returns `INoteResponse`
  - [ ] `throwOnError: false`; do NOT add `meta.onError` toast — `SharedNotePage` handles errors via `isError` + `error` directly

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 3 — ShareModal Component

- [ ] Create `apps/frontend/src/components/ShareModal.tsx`
  - [ ] Props: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void }`
  - [ ] Internal state: `selectedDate: Date | undefined`, `copied: string | null` (shareId of recently copied link)
  - [ ] Consume `useShareLinks(noteId, open)`, `useCreateShareLink(noteId)`, `useRevokeShareLink(noteId)`
  - [ ] Filter link list: `links.filter((l) => l.revokedAt === null)` before render
  - [ ] Implement `getLinkStatus(link)` helper: returns `"expired"` when `expiresAt` is non-null and in the past, else `"active"`
  - [ ] Implement `toEndOfDayISO(date: Date): string` helper: `setHours(23, 59, 59, 0)` then `.toISOString()`
  - [ ] Generate handler: build `TCreateShareLinkInput` body — include `expiresAt` only when `selectedDate` is set; reset `selectedDate` on success
  - [ ] Copy handler: write `${window.location.origin}/shared/${link.token}` to `navigator.clipboard`; set `copied` to `link.id`; clear after 2 s; fire `toast.success("Copied to clipboard")`
  - [ ] Revoke handler: call `revokeLink.mutate(link.id)` immediately — no confirmation dialog
  - [ ] Date picker: `Calendar` inside `Popover`; disable past dates and today with `disabled={(date) => date <= new Date()}`; show "No expiry" label when no date selected; show a Clear button when a date is selected
  - [ ] Link list row: truncated token (`token.slice(0, 12) + "…"`), status badge ("Active"/"Expired"), formatted expiry or "No expiry", copy icon button (checkmark when `copied === link.id`), revoke icon button (disabled while `revokeLink.isPending`)
  - [ ] Loading state: skeleton rows while `isLoading`
  - [ ] Empty state: `"No links yet."` when list is empty after load
  - [ ] Use shadcn `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `Button`, `Badge`, `Skeleton`, `Calendar`, `Popover`, `PopoverTrigger`, `PopoverContent`
  - [ ] Icons from `lucide-react`: `Copy`, `Check`, `Trash2`, `CalendarIcon`
  - [ ] `format` from `date-fns` for display dates (`"PPP"` for picker label, `"PP"` for list dates)

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`

---

## Phase 4 — NoteEditorPage + SharedNotePage + App.tsx

### 4a — NoteEditorPage.tsx

- [ ] Add `import { Share2 } from "lucide-react"` to existing imports
- [ ] Add `import { ShareModal } from "@/components/ShareModal"`
- [ ] Add `const [shareOpen, setShareOpen] = useState(false)` state
- [ ] Insert Share button in top bar to the right of the title input, before the `statusLabel` span:
  ```tsx
  <Button variant="ghost" size="sm" onClick={() => setShareOpen(true)} className="shrink-0">
    <Share2 className="mr-1.5 h-4 w-4" />
    Share
  </Button>
  ```
- [ ] Render `<ShareModal noteId={id!} open={shareOpen} onOpenChange={setShareOpen} />` inside the component return (below the main div, sibling to the existing markup)

### 4b — SharedNotePage.tsx

- [ ] Create `apps/frontend/src/pages/SharedNotePage.tsx`
- [ ] Extract `token` from `useParams<{ token: string }>()`
- [ ] Consume `usePublicNote(token!)`
- [ ] Extract error code: `(error as AxiosError<IErrorResponse>)?.response?.data?.error?.code`
- [ ] Define error message map:
  - `SHARE_EXPIRED` → `"This link has expired."`
  - `SHARE_REVOKED` → `"This link has been revoked by the owner."`
  - `SHARE_NOT_FOUND` → `"This link could not be found."`
  - fallback → `"Something went wrong."`
- [ ] Loading state: `Skeleton` for title (h-8 w-64) + three content-line skeletons; no Navbar
- [ ] Error state: centered card with the mapped message; no Navbar
- [ ] Success state: `h1` with note title, tag badges (styled with `tag.color`), read-only `EditorContent`; no Navbar
- [ ] Read-only TipTap: `useEditor({ extensions: [StarterKit], editable: false, immediatelyRender: false })`; `useEffect` to call `editor.commands.setContent(note.content, false)` when `note` and `editor` are both available
- [ ] No `Navbar` rendered anywhere in this page — bare layout only

### 4c — App.tsx

- [ ] Add `import { SharedNotePage } from "./pages/SharedNotePage.js"` to existing imports
- [ ] Insert `<Route path="/shared/:token" element={<SharedNotePage />} />` **before** the existing `<Route path="*" …>` catch-all
- [ ] Verify `SharedNotePage` route has no `ProtectedRoute` or `GuestRoute` wrapper

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green (existing tests must not regress)

---

## Phase 5 — Tests

Delegate to test-writer agent. Every scenario row from spec.md must have at least one test.

**Hook tests** (`apps/frontend/src/__tests__/hooks/`):

- [ ] `useShareLinks.test.ts`
  - [ ] AC-S1: Open modal — no links yet — returns empty array
  - [ ] AC-S2: Open modal — links exist — returns populated array
  - [ ] AC-S9: Revoke returns 404 — query refetches after error

- [ ] `useCreateShareLink.test.ts`
  - [ ] AC-S3: Generate link — no expiry — POSTs empty body, returns new link
  - [ ] AC-S4: Generate link — with expiry — POSTs `{ expiresAt }`, returns new link with expiresAt set
  - [ ] AC-S10: Note not found — API returns 404 `NOTE_NOT_FOUND` — onError fires toast

- [ ] `useRevokeShareLink.test.ts`
  - [ ] AC-S8: Revoke active link — POSTs to revoke endpoint, invalidates `["shares", noteId]`
  - [ ] AC-S9: Link already gone — API returns 404 `SHARE_NOT_FOUND` — onError fires toast

- [ ] `usePublicNote.test.ts`
  - [ ] AC-S11: Valid token loading state — query is pending before response
  - [ ] AC-S12: Valid active token — returns `INoteResponse`
  - [ ] AC-S13: Expired token — `isError` true, error code `SHARE_EXPIRED`
  - [ ] AC-S14: Soft-deleted note — API returns `SHARE_EXPIRED` (410), `isError` true
  - [ ] AC-S15: Revoked token — `isError` true, error code `SHARE_REVOKED`
  - [ ] AC-S16: Token not found — `isError` true, error code `SHARE_NOT_FOUND`

**Component tests** (`apps/frontend/src/__tests__/components/`):

- [ ] `ShareModal.test.tsx`
  - [ ] AC-S1: Modal open — no links — renders empty state text "No links yet."
  - [ ] AC-S2: Modal open — links exist — renders link rows with token, badge, copy button, revoke button
  - [ ] AC-S3: Generate link — no expiry — calls mutation with empty body; new link appears
  - [ ] AC-S4: Generate link — with expiry — calls mutation with `expiresAt`; new link appears with expiry
  - [ ] AC-S5: Date picker — past dates disabled — calendar `disabled` prop blocks selection of today/past
  - [ ] AC-S6: Copy link — writes full URL to clipboard; copy icon becomes checkmark; toast fires
  - [ ] AC-S7: Expired link — `revokedAt` null, `expiresAt` in past — renders "Expired" badge
  - [ ] AC-S8: Revoke link — clicks revoke; mutation fires; link removed from list after invalidation

**Page tests** (`apps/frontend/src/__tests__/pages/`):

- [ ] `SharedNotePage.test.tsx`
  - [ ] AC-S11: Loading state — skeletons rendered; no Navbar
  - [ ] AC-S12: Valid token — note title, content, and tags rendered read-only; no edit controls
  - [ ] AC-S13: Expired token (410 SHARE_EXPIRED) — renders "This link has expired."
  - [ ] AC-S14: Soft-deleted note (410 SHARE_EXPIRED) — renders "This link has expired."
  - [ ] AC-S15: Revoked token (403 SHARE_REVOKED) — renders "This link has been revoked by the owner."
  - [ ] AC-S16: Token not found (404 SHARE_NOT_FOUND) — renders "This link could not be found."

**Checkpoint 5 (final):**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint --max-warnings 0`
- [ ] `pnpm test` — all green
- [ ] `pnpm test --coverage` — ≥ 80% on all new files
