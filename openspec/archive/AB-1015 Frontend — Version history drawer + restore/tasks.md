# Tasks — AB-1015: Frontend — Version history drawer + restore

Work through phases in order. Run the quality gate checkpoint after each phase.
Do NOT begin the next phase until all checkpoints pass.

---

## Phase 1 — Sheet UI Component

- [ ] Create `apps/frontend/src/components/ui/sheet.tsx`
  - [ ] Export: `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetTitle`
  - [ ] Build on `@radix-ui/react-dialog` (already installed — no `pnpm add` required)
  - [ ] `SheetContent` slides from right: `inset-y-0 right-0 … slide-in-from-right duration-300`
  - [ ] `SheetOverlay` uses same dim backdrop as Dialog (`bg-black/80`)
  - [ ] `SheetClose` absolute-positioned top-right with `X` icon and `sr-only "Close"` label

**Checkpoint 1:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`

---

## Phase 2 — Hooks

- [ ] Create `apps/frontend/src/hooks/useVersions.ts`
  - [ ] `useQuery<INoteVersion[]>` with key `["versions", noteId]`
  - [ ] `GET /api/notes/:noteId/versions` via `api` instance
  - [ ] Accepts `enabled: boolean` parameter — lazy fetch; pass `open` from drawer
  - [ ] `throwOnError: false`; no `meta.onError` toast — drawer renders inline error state (S8)

- [ ] Create `apps/frontend/src/hooks/useRestoreVersion.ts`
  - [ ] `useMutation<INoteResponse, Error, string>` — variable type is `versionId: string`
  - [ ] `POST /api/notes/:noteId/versions/:versionId/restore` via `api` instance
  - [ ] Returns `INoteResponse` (updated note after restore)
  - [ ] `onSuccess`: invalidate `["versions", noteId]` only — success toast is the component's responsibility
  - [ ] `onError`: `toast.error(getErrorMessage(err))` — covers S6 (VERSION_NOT_FOUND) and S7 (NOTE_NOT_FOUND)

**Checkpoint 2:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`

---

## Phase 3 — VersionHistoryDrawer Component

- [ ] Create `apps/frontend/src/components/VersionHistoryDrawer.tsx`
  - [ ] Props: `{ noteId: string; open: boolean; onOpenChange: (open: boolean) => void; onRestore: (note: INoteResponse) => void }`
  - [ ] Consume `useVersions(noteId, open)` and `useRestoreVersion(noteId)`
  - [ ] Loading state: 3× `<Skeleton className="h-10 w-full" />` rows while `isLoading`
  - [ ] Error state: `<p>Failed to load versions.</p>` when `isError`
  - [ ] Empty state: `<p>No versions yet.</p>` when `data.length === 0`
  - [ ] Version rows: `v{version.version} · {format(new Date(version.createdAt), "MMM d, h:mm a")}`
  - [ ] First row (`versions[0]`) gets "Current" badge (`<Badge variant="secondary">Current</Badge>`)
  - [ ] Restore button disabled on first row and when `restoreVersion.isPending`
  - [ ] Restore click handler per row:
    ```ts
    restoreVersion.mutate(version.id, {
      onSuccess: (note) => {
        toast.success(`Restored to v${version.version}`);
        onRestore(note);
        onOpenChange(false);
      },
    });
    ```
  - [ ] Use `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`

**Checkpoint 3:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`

---

## Phase 4 — NoteEditorPage Integration

- [ ] Modify `apps/frontend/src/pages/NoteEditorPage.tsx`
  - [ ] Add `import { Clock } from "lucide-react"`
  - [ ] Add `import { VersionHistoryDrawer } from "@/components/VersionHistoryDrawer"`
  - [ ] Add `import type { INoteResponse } from "@noteapp/shared"` (if not already present)
  - [ ] Add `const [historyOpen, setHistoryOpen] = useState(false)` state
  - [ ] Add `handleRestore(note: INoteResponse)` function:
    ```ts
    function handleRestore(note: INoteResponse) {
      setTitle(note.title);
      editor?.commands.setContent(note.content, false);
      initLastSaved(note.title, note.content);
    }
    ```
  - [ ] Add History button in top bar between Share button and statusLabel span:
    ```tsx
    <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)} className="shrink-0">
      <Clock className="mr-1.5 h-4 w-4" />
      History
    </Button>
    ```
  - [ ] Add `<VersionHistoryDrawer>` inside `{id && ...}` guard alongside existing `<ShareModal>`:
    ```tsx
    <VersionHistoryDrawer
      noteId={id}
      open={historyOpen}
      onOpenChange={setHistoryOpen}
      onRestore={handleRestore}
    />
    ```

**Checkpoint 4:**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`

---

## Phase 5 — Tests

Delegate to test-writer agent. Every scenario row from spec.md must have at least one test.

**Hook tests** (`apps/frontend/src/__tests__/hooks/`):

- [ ] `useVersions.test.ts`
  - [ ] AC-S1: Versions exist — `useVersions` returns populated `INoteVersion[]`
  - [ ] AC-S2: No versions — returns empty array `[]`
  - [ ] AC-S8: Fetch fails — `isError` true; no toast fired (error handled inline)

- [ ] `useRestoreVersion.test.ts`
  - [ ] AC-S4: Success — mutation returns `INoteResponse`; `["versions", noteId]` invalidated
  - [ ] AC-S6: VERSION_NOT_FOUND — `toast.error` fires with server message; drawer stays open
  - [ ] AC-S7: NOTE_NOT_FOUND — `toast.error` fires with server message; drawer stays open

**Component tests** (`apps/frontend/src/__tests__/components/`):

- [ ] `VersionHistoryDrawer.test.tsx`
  - [ ] AC-S1: Drawer open, versions exist — rows rendered newest-first with `v{N} · {date}` label; Restore buttons present on non-current rows
  - [ ] AC-S2: Drawer open, no versions — "No versions yet." shown
  - [ ] AC-S3: Loading skeleton — Skeleton rows visible while fetch is in-flight
  - [ ] AC-S4: Restore non-current version — mutation fires; `onRestore` called with `INoteResponse`; `toast.success("Restored to v{N}")` fires; drawer closes
  - [ ] AC-S5: Current version row — Restore button has `disabled` attribute; cannot be clicked
  - [ ] AC-S6: VERSION_NOT_FOUND on restore — `toast.error` shown; drawer remains open; editor unchanged
  - [ ] AC-S7: NOTE_NOT_FOUND on restore — `toast.error` shown; drawer remains open
  - [ ] AC-S8: Versions fetch fails — "Failed to load versions." shown

- [ ] `Sheet.test.tsx`
  - [ ] Basic render — Sheet opens and closes via trigger; SheetTitle renders; SheetClose button present

**Checkpoint 5 (final):**
- [ ] `pnpm build` — 0 errors, 0 warnings
- [ ] `pnpm lint`
- [ ] `pnpm test` — all green
- [ ] `pnpm test --coverage` — ≥ 80% on all new files
