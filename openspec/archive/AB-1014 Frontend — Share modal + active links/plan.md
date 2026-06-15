# Plan — AB-1014: Frontend — Share Modal + Active Links

**Based on spec:** openspec/changes/AB-1014 Frontend — Share modal + active links/spec.md
**Spec status:** Approved

---

## Phase 1 — shadcn UI Components

Install two new shadcn primitives that the date picker requires. Run these commands from the repo root before touching any source files.

```bash
pnpm dlx shadcn@latest add calendar --cwd apps/frontend
pnpm dlx shadcn@latest add popover  --cwd apps/frontend
```

Files generated:

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `apps/frontend/src/components/ui/calendar.tsx` | Month calendar grid backed by `react-day-picker` |
| CREATE | `apps/frontend/src/components/ui/popover.tsx` | Radix popover primitive wrapper |

`react-day-picker` is a peer dependency pulled in automatically by shadcn; no manual `pnpm add` needed.

**Checkpoint:**
```bash
pnpm build          # 0 errors, 0 warnings
pnpm lint --max-warnings 0
```

---

## Phase 2 — TanStack Query Hooks

Four new hooks. All follow the existing pattern in `hooks/useNotes.ts` and `hooks/useDeleteNote.ts`: import `api` from `@/lib/api`, import types from `@noteapp/shared`, use `getErrorMessage` from `@/lib/errorUtils`, surface errors via `toast.error`.

### Files to create

| File | Hook | Method |
|------|------|--------|
| `apps/frontend/src/hooks/useShareLinks.ts` | `useShareLinks` | `useQuery` |
| `apps/frontend/src/hooks/useCreateShareLink.ts` | `useCreateShareLink` | `useMutation` |
| `apps/frontend/src/hooks/useRevokeShareLink.ts` | `useRevokeShareLink` | `useMutation` |
| `apps/frontend/src/hooks/usePublicNote.ts` | `usePublicNote` | `useQuery` |

---

### `useShareLinks(noteId: string, enabled: boolean)`

```typescript
// Query key: ["shares", noteId]
// Endpoint:  GET /api/notes/:noteId/shares
// Returns:   ISharedLinkResponse[]
// enabled:   passed in so the ShareModal only fetches when open
queryFn: () =>
  api
    .get<{ data: ISharedLinkResponse[] }>(`/notes/${noteId}/shares`)
    .then((r) => r.data.data)
```

- `throwOnError: false`
- `meta.onError`: `toast.error(getErrorMessage(err))`

---

### `useCreateShareLink(noteId: string)`

```typescript
// Endpoint: POST /api/notes/:noteId/shares
// Body:     { expiresAt?: string }   (expiresAt omitted when no expiry)
// Returns:  ISharedLinkResponse (201)
mutationFn: (data: TCreateShareLinkInput) =>
  api
    .post<{ data: ISharedLinkResponse }>(`/notes/${noteId}/shares`, data)
    .then((r) => r.data.data)
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ["shares", noteId] });
  toast.success("Link created");
}
onError: (err) => toast.error(getErrorMessage(err))
```

---

### `useRevokeShareLink(noteId: string)`

```typescript
// Endpoint: POST /api/shares/:shareId/revoke
// Body:     none
// Returns:  ISharedLinkResponse (200)
mutationFn: (shareId: string) =>
  api
    .post<{ data: ISharedLinkResponse }>(`/shares/${shareId}/revoke`)
    .then((r) => r.data.data)
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ["shares", noteId] });
  toast.success("Link revoked");
}
onError: (err) => toast.error(getErrorMessage(err))
```

---

### `usePublicNote(token: string)`

```typescript
// Query key: ["public-note", token]
// Endpoint:  GET /api/share/:token   (no auth required)
// Returns:   INoteResponse
// Uses:      same `api` axios instance — the request interceptor only
//            adds Authorization when a token exists in the auth store,
//            so unauthenticated visitors send no header and the route
//            has no requireAuth middleware.
queryFn: () =>
  api
    .get<{ data: INoteResponse }>(`/share/${token}`)
    .then((r) => r.data.data)
throwOnError: false
// Do NOT use meta.onError here — SharedNotePage handles error display
// directly via isError + error, not via toasts.
```

**Checkpoint:**
```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 3 — ShareModal Component

### File to create

`apps/frontend/src/components/ShareModal.tsx`

### Component signature

```typescript
interface IShareModalProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}
export function ShareModal({ noteId, open, onOpenChange }: IShareModalProps)
```

### Internal state

```typescript
const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
const [copied, setCopied]             = useState<string | null>(null); // shareId of recently copied link
```

### Data

```typescript
const { data: links = [], isLoading } = useShareLinks(noteId, open);
const createLink  = useCreateShareLink(noteId);
const revokeLink  = useRevokeShareLink(noteId);
```

### Link status derivation (client-side, pure function)

```typescript
function getLinkStatus(link: ISharedLinkResponse): "active" | "expired" {
  // revokedAt links never appear in the list (filtered before render)
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return "expired";
  return "active";
}
```

Filter before render: `links.filter((l) => l.revokedAt === null)`

### Date → ISO conversion (end-of-day in local timezone)

```typescript
function toEndOfDayISO(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}
```

### Generate handler

```typescript
function handleGenerate() {
  const body: TCreateShareLinkInput = selectedDate
    ? { expiresAt: toEndOfDayISO(selectedDate) }
    : {};
  createLink.mutate(body, {
    onSuccess: () => setSelectedDate(undefined),
  });
}
```

### Copy handler

```typescript
async function handleCopy(link: ISharedLinkResponse) {
  const url = `${window.location.origin}/shared/${link.token}`;
  await navigator.clipboard.writeText(url);
  setCopied(link.id);
  toast.success("Copied to clipboard");
  setTimeout(() => setCopied(null), 2000);
}
```

### Layout structure (shadcn Dialog)

```
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Share note</DialogTitle>
    </DialogHeader>

    {/* Generate form */}
    <div>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline">
            {selectedDate ? format(selectedDate, "PPP") : "No expiry"}
          </Button>
        </PopoverTrigger>
        <PopoverContent>
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            disabled={(date) => date <= new Date()}  // past + today disabled
            initialFocus
          />
        </PopoverContent>
      </Popover>
      {selectedDate && (
        <Button variant="ghost" size="sm" onClick={() => setSelectedDate(undefined)}>
          Clear
        </Button>
      )}
      <Button onClick={handleGenerate} disabled={createLink.isPending}>
        Generate link
      </Button>
    </div>

    {/* Link list */}
    {isLoading ? (
      <Skeleton rows />
    ) : visibleLinks.length === 0 ? (
      <p className="text-sm text-muted-foreground">No links yet.</p>
    ) : (
      visibleLinks.map((link) => (
        <div key={link.id}>
          <span className="font-mono text-xs">{link.token.slice(0, 12)}…</span>
          <Badge variant={status === "expired" ? "secondary" : "default"}>
            {status === "expired" ? "Expired" : "Active"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {link.expiresAt ? `Expires ${format(new Date(link.expiresAt), "PP")}` : "No expiry"}
          </span>
          <Button size="icon" variant="ghost" onClick={() => handleCopy(link)}>
            {copied === link.id ? <Check /> : <Copy />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => revokeLink.mutate(link.id)}
            disabled={revokeLink.isPending}
          >
            <Trash2 />
          </Button>
        </div>
      ))
    )}
  </DialogContent>
</Dialog>
```

`format` is imported from `date-fns` (installed as a transitive dependency of `react-day-picker`).

**Checkpoint:**
```bash
pnpm build
pnpm lint --max-warnings 0
```

---

## Phase 4 — NoteEditorPage Update + App.tsx + SharedNotePage

### 4a — NoteEditorPage.tsx

Add Share button and modal state to the existing top bar. Minimal diff.

**New imports:**
```typescript
import { Share2 } from "lucide-react";
import { ShareModal } from "@/components/ShareModal";
```

**New state:**
```typescript
const [shareOpen, setShareOpen] = useState(false);
```

**Top bar change** — insert before the `{statusLabel && …}` span:
```typescript
<Button
  variant="ghost"
  size="sm"
  onClick={() => setShareOpen(true)}
  className="shrink-0"
>
  <Share2 className="mr-1.5 h-4 w-4" />
  Share
</Button>
```

**Below the return root div** — insert modal:
```typescript
{id && (
  <ShareModal
    noteId={id}
    open={shareOpen}
    onOpenChange={setShareOpen}
  />
)}
```

---

### 4b — SharedNotePage.tsx

**File to create:** `apps/frontend/src/pages/SharedNotePage.tsx`

```typescript
// Component signature
export function SharedNotePage()

// Extract token from useParams<{ token: string }>()

// Data
const { data: note, isLoading, isError, error } = usePublicNote(token!);

// Error code extraction (mirrors errorUtils but reads error.code)
const errorCode = (error as AxiosError<IErrorResponse>)
  ?.response?.data?.error?.code;
```

**Error message map:**
```typescript
const errorMessages: Record<string, string> = {
  SHARE_EXPIRED:   "This link has expired.",
  SHARE_REVOKED:   "This link has been revoked by the owner.",
  SHARE_NOT_FOUND: "This link could not be found.",
};
```

**Read-only TipTap editor:**
```typescript
const editor = useEditor({
  extensions: [StarterKit],
  content: note?.content ?? "",
  editable: false,
  immediatelyRender: false,
});

useEffect(() => {
  if (editor && note) editor.commands.setContent(note.content, false);
}, [note, editor]);
```

**Layout:**
- No `Navbar` — bare page
- Loading: skeleton for title (h-8 w-64) + three content skeletons
- Error: centered card with error message from `errorMessages[errorCode]` (fallback to `"Something went wrong."`)
- Success: note title (h1), tag badges, read-only `EditorContent`

---

### 4c — App.tsx

Add the public route **before** the `*` catch-all:

```typescript
import { SharedNotePage } from "./pages/SharedNotePage.js";

// Inside <Routes>, before <Route path="*" …>:
<Route path="/shared/:token" element={<SharedNotePage />} />
```

No `ProtectedRoute` or `GuestRoute` wrapper.

**Checkpoint:**
```bash
pnpm build
pnpm lint --max-warnings 0
pnpm test           # all green
```

---

## Phase 5 — Tests

Delegated to the test-writer agent. The agent reads the spec and this plan; it writes test files only and does not touch implementation.

### Files to create

| File | Type | Spec scenarios |
|------|------|---------------|
| `apps/frontend/src/__tests__/hooks/useShareLinks.test.ts` | Hook (MSW) | S1, S2, S9 |
| `apps/frontend/src/__tests__/hooks/useCreateShareLink.test.ts` | Hook (MSW) | S3, S4, S10 |
| `apps/frontend/src/__tests__/hooks/useRevokeShareLink.test.ts` | Hook (MSW) | S8, S9 |
| `apps/frontend/src/__tests__/hooks/usePublicNote.test.ts` | Hook (MSW) | S11, S12, S13, S14, S15, S16 |
| `apps/frontend/src/__tests__/components/ShareModal.test.tsx` | Component (RTL) | S1, S2, S3, S4, S5, S6, S7, S8 |
| `apps/frontend/src/__tests__/pages/SharedNotePage.test.tsx` | Page (RTL) | S11, S12, S13, S14, S15, S16 |

### Test naming convention (existing pattern)

```typescript
it("AC-S3: Generate link — no expiry — calls POST and shows new link", async () => { … });
```

### MSW handler pattern

Follow existing `apps/frontend/src/mocks/handlers.ts` — add share-related handlers there. Tests import `server` from `@/mocks/server` and use `server.use(…)` overrides for error scenarios.

**Final checkpoint:**
```bash
pnpm build
pnpm lint --max-warnings 0
pnpm test           # all green
pnpm test --coverage  # ≥80% overall
```

---

## Risks & Assumptions

| # | Risk / Assumption | Mitigation |
|---|------------------|-----------|
| R1 | `date-fns` may not be installed — it is a peer dependency of `react-day-picker` pulled in by shadcn's `calendar` component | Run `pnpm build` after Phase 1; if `date-fns` is missing, add it explicitly with `pnpm add date-fns --filter frontend` |
| R2 | The 401 response interceptor in `api.ts` redirects to `/login` — if `GET /api/share/:token` ever returns 401 for an unexpected reason, an anonymous visitor would be redirected | The backend's `publicShareRoutes` has no `requireAuth`, so this path is safe in practice; noted for awareness |
| R3 | The catch-all `<Route path="*" …>` in `App.tsx` currently redirects to `/notes` — if `/shared/:token` is registered after it, the route will never match | Plan explicitly places `/shared/:token` before `*`; verify order after edit |
| R4 | `navigator.clipboard.writeText` requires HTTPS or `localhost` — fails in plain HTTP dev proxies | Acceptable for dev; production runs HTTPS; no mitigation needed |
| R5 | shadcn `calendar` component imports `react-day-picker` styles — confirm Tailwind picks up class names from `node_modules/react-day-picker` via the `content` glob in `tailwind.config` | If calendar renders unstyled, add `"./node_modules/react-day-picker/**/*.js"` to tailwind content array |
