# Plan — AB-1015: Frontend — Version history drawer + restore

**Based on spec:** openspec/changes/AB-1015 Frontend — Version history drawer + restore/spec.md
**Spec status:** Approved

---

## Overview

Frontend-only ticket. No shared package, database, backend route, service, or repository changes required — all three version endpoints and `INoteVersion`/`VERSION_NOT_FOUND` already exist.

Four implementation phases:

1. `sheet.tsx` — shadcn/ui Sheet component (written manually; `@radix-ui/react-dialog` already installed)
2. Two new hooks — `useVersions` + `useRestoreVersion`
3. `VersionHistoryDrawer` component
4. `NoteEditorPage` integration — History button + `handleRestore`

---

## Phase 1 — Sheet UI Component

### Files

| Action | File | What changes |
|--------|------|-------------|
| CREATE | `apps/frontend/src/components/ui/sheet.tsx` | Right-side sliding sheet built on `@radix-ui/react-dialog` |

### No new packages

`@radix-ui/react-dialog` is already installed as a dependency of the existing Dialog component. `sheet.tsx` imports from it directly — no `pnpm add` required.

### Exact component shape

```typescript
import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;
const SheetPortal = SheetPrimitive.Portal;

// Overlay — same dim backdrop as Dialog
const SheetOverlay = React.forwardRef<...>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
    ref={ref}
  />
));

// Content — slides from the right
const SheetContent = React.forwardRef<...>(({ className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <SheetPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-50 h-full w-3/4 max-w-sm border-l bg-background p-6 shadow-lg",
        "transition ease-in-out",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        "duration-300",
        className
      )}
      {...props}
    >
      {children}
      <SheetClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </SheetClose>
    </SheetPrimitive.Content>
  </SheetPortal>
));

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5", className)} {...props} />
);

const SheetTitle = React.forwardRef<...>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));

export { Sheet, SheetPortal, SheetOverlay, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetTitle };
```

### Checkpoint 1

```bash
pnpm build          # 0 errors
pnpm lint
```

---

## Phase 2 — Hooks

### Files

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `apps/frontend/src/hooks/useVersions.ts` | Fetch version list for a note |
| CREATE | `apps/frontend/src/hooks/useRestoreVersion.ts` | Restore note to a version snapshot |

---

### `useVersions.ts` — exact shape

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { INoteVersion } from "@noteapp/shared";

export function useVersions(noteId: string, enabled: boolean) {
  return useQuery<INoteVersion[]>({
    queryKey: ["versions", noteId],
    queryFn: () =>
      api
        .get<{ data: INoteVersion[] }>(`/notes/${noteId}/versions`)
        .then((r) => r.data.data),
    enabled,
    throwOnError: false,
    // No meta.onError — VersionHistoryDrawer renders inline error state via isError
  });
}
```

- Query key: `["versions", noteId]`
- Called with `enabled = open` so fetch is lazy (only when drawer is open)
- No `toast.error` in hook — S8 requires the error to render inside the drawer, not as a toast

---

### `useRestoreVersion.ts` — exact shape

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { INoteResponse } from "@noteapp/shared";

export function useRestoreVersion(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation<INoteResponse, Error, string>({
    mutationFn: (versionId: string) =>
      api
        .post<{ data: INoteResponse }>(`/notes/${noteId}/versions/${versionId}/restore`)
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["versions", noteId] });
      // toast.success is NOT here — the component knows the version number and fires it
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
```

- Mutation variable type: `string` (versionId)
- Return type: `INoteResponse` (the updated note after restore)
- `onSuccess`: invalidates `["versions", noteId]` only — success toast is the component's responsibility
- `onError`: `toast.error` with server message (S6, S7)

### Checkpoint 2

```bash
pnpm build
pnpm lint
```

---

## Phase 3 — VersionHistoryDrawer Component

### Files

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `apps/frontend/src/components/VersionHistoryDrawer.tsx` | Sheet with version list + restore |

### Props interface

```typescript
interface IVersionHistoryDrawerProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (note: INoteResponse) => void;
}
```

### Rendering logic

**Version row format:** `v{version.version} · {format(new Date(version.createdAt), "MMM d, h:mm a")}`

**Current version detection:** `versions[0]` is "Current" (API returns newest first). First row gets a "Current" badge; its Restore button is `disabled`.

**Restore click handler (per row):**
```typescript
restoreVersion.mutate(version.id, {
  onSuccess: (note) => {
    toast.success(`Restored to v${version.version}`);
    onRestore(note);       // parent updates editor
    onOpenChange(false);   // close drawer
  },
});
```

**States to render:**

| State | Content |
|-------|---------|
| `isLoading` | 3× `<Skeleton className="h-10 w-full" />` rows |
| `isError` | `<p>Failed to load versions.</p>` |
| `data.length === 0` | `<p>No versions yet.</p>` |
| `data.length >= 1` | Version rows |

**Restore button disabled when:** `index === 0` (Current) or `restoreVersion.isPending`

### Checkpoint 3

```bash
pnpm build
pnpm lint
```

---

## Phase 4 — NoteEditorPage Integration

### Files

| Action | File | What changes |
|--------|------|-------------|
| MODIFY | `apps/frontend/src/pages/NoteEditorPage.tsx` | History button + handleRestore + VersionHistoryDrawer |

### Exact changes

**New imports (add alongside existing imports):**
```typescript
import { Clock } from "lucide-react";
import { VersionHistoryDrawer } from "@/components/VersionHistoryDrawer";
import type { INoteResponse } from "@noteapp/shared";
```

**New state (after existing `shareOpen`):**
```typescript
const [historyOpen, setHistoryOpen] = useState(false);
```

**New handler (after `handleDetach`):**
```typescript
function handleRestore(note: INoteResponse) {
  setTitle(note.title);
  editor?.commands.setContent(note.content, false);
  initLastSaved(note.title, note.content);
}
```

**History button in top bar** — insert between the Share button and the `{statusLabel &&` span:
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => setHistoryOpen(true)}
  className="shrink-0"
>
  <Clock className="mr-1.5 h-4 w-4" />
  History
</Button>
```

**VersionHistoryDrawer** — add alongside the existing ShareModal (both guarded by `{id && ...}`):
```tsx
{id && (
  <VersionHistoryDrawer
    noteId={id}
    open={historyOpen}
    onOpenChange={setHistoryOpen}
    onRestore={handleRestore}
  />
)}
```

### Checkpoint 4

```bash
pnpm build
pnpm lint
```

---

## Phase 5 — Tests

Delegate to test-writer agent. Pass it:
- `openspec/changes/AB-1015 Frontend — Version history drawer + restore/spec.md`
- All four implementation files

### Files to create

| File | Scenarios |
|------|-----------|
| `apps/frontend/src/__tests__/hooks/useVersions.test.ts` | S1 (versions returned), S2 (empty array), S8 (fetch error — isError true) |
| `apps/frontend/src/__tests__/hooks/useRestoreVersion.test.ts` | S4 (success — returns INoteResponse, invalidates query), S6 (VERSION_NOT_FOUND — toast.error), S7 (NOTE_NOT_FOUND — toast.error) |
| `apps/frontend/src/__tests__/components/VersionHistoryDrawer.test.tsx` | S1, S2, S3, S4, S5, S6, S7, S8 |
| `apps/frontend/src/__tests__/components/Sheet.test.tsx` | Basic render — open/close, title renders, close button present |

### Notes for test-writer

- `useVersions` and `useRestoreVersion` follow same MSW + QueryClient pattern as `useShareLinks` / `useRevokeShareLink`
- `VersionHistoryDrawer` follows same wrapper pattern as `ShareModal.test.tsx` (QueryClient + MemoryRouter)
- Sheet portals render in JSDOM (same as Dialog) — no Popover-style limitation
- S5 (Current row disabled): assert `getByRole("button", { name: /restore/i })` is disabled on the first row
- S4 success: assert `onRestore` callback was called with the restored `INoteResponse`
- Mock `sonner` toast via `vi.mock("sonner", ...)`

### Checkpoint 5 (final)

```bash
pnpm build
pnpm lint
pnpm test              # all green
pnpm test --coverage   # ≥ 80% on new files
```

---

## Risks & Assumptions

| # | Risk / Assumption | Mitigation |
|---|------------------|-----------|
| R1 | `@radix-ui/react-dialog` version must export `Root`, `Trigger`, `Portal`, `Overlay`, `Content`, `Close`, `Title` — same as Dialog uses | Already confirmed by reading `dialog.tsx` |
| R2 | Sheet slide animation uses Tailwind `animate-in`/`animate-out` + `slide-in-from-right` utilities — these must be in the Tailwind config | Already present (Dialog uses `slide-in-from-left`/`slide-out-to-left`; right variants are in the same plugin) |
| R3 | `initLastSaved` must accept `(title: string, content: string)` — if signature differs, `handleRestore` must adapt | Confirmed by reading `NoteEditorPage.tsx` line 67: `initLastSaved(note.title, initialHtml)` |
| R4 | `editor?.commands.setContent` may be called before editor is ready on first render | Guard with `editor?.commands.setContent(...)` (optional chaining) — editor is always initialized by the time restore is triggered |
| R5 | Restoring a version creates a new snapshot server-side; query invalidation on success ensures re-opened drawer shows the new snapshot | Confirmed by `VersionService.restoreVersion` implementation |
