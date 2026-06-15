# Plan — AB-1013: Frontend — Search UI with highlights

**Based on spec:** openspec/changes/AB-1013 Frontend — Search UI with highlights/spec.md
**Spec status:** Approved

---

## Overview

Frontend-only ticket. No shared package, backend, or database changes. The work is entirely in `apps/frontend/`:

| Phase | What |
|-------|------|
| 1 | MSW mock handler for `GET /api/search` |
| 2 | `useSearch` hook |
| 3 | `SearchResultCard` component |
| 4 | `NotesPage` — debounced input + search/list branching |
| 5 | `useDeleteNote` — invalidate search cache on delete |
| 6 | Tests |

---

## Phase 1 — MSW Mock Handler

**File to modify:** `apps/frontend/src/mocks/handlers.ts`

Add one handler after the existing `GET /api/tags` handler:

```typescript
http.get("/api/search", ({ request }) => {
  const url = new URL(request.url);
  const q = url.searchParams.get("q");
  if (!q || q.trim() === "") {
    return HttpResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Search query is required" } },
      { status: 400 }
    );
  }
  return HttpResponse.json(
    {
      data: [
        {
          ...mockNote,
          highlight: `The <mark>${q}</mark> appears in this note`,
        },
      ],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    },
    { status: 200 }
  );
}),
```

The `mockNote` object already defined in `handlers.ts` is reused. No new mock data needed.

**Checkpoint 1:**
- `pnpm build` — 0 errors, 0 warnings
- `pnpm lint --max-warnings 0`

---

## Phase 2 — `useSearch` Hook

**File to create:** `apps/frontend/src/hooks/useSearch.ts`

Mirrors the shape of `useNotes.ts` exactly. Uses `queryKey: ["search", query]` so `invalidateQueries({ queryKey: ["search"] })` can bust all search results at once.

```typescript
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { ISearchResult, INotesPageMeta, TSearchQuery } from "@noteapp/shared";

interface ISearchPageResult {
  results: ISearchResult[];
  meta: INotesPageMeta;
}

export function useSearch(query: TSearchQuery) {
  return useQuery<ISearchPageResult>({
    queryKey: ["search", query],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", query.q);
      params.set("page", String(query.page ?? 1));
      params.set("limit", String(query.limit ?? 20));
      for (const id of query.tagId ?? []) {
        params.append("tagId[]", id);
      }
      const res = await api.get<{ data: ISearchResult[]; meta: INotesPageMeta }>(
        `/search?${params.toString()}`
      );
      return { results: res.data.data, meta: res.data.meta };
    },
    enabled: query.q.trim().length > 0,
    throwOnError: false,
    meta: {
      onError: (err: unknown) => toast.error(getErrorMessage(err)),
    },
  });
}
```

Key decisions:
- `enabled: query.q.trim().length > 0` — no request fires for empty/whitespace queries (satisfies S10)
- Same `throwOnError: false` + `meta.onError` toast pattern as `useNotes`
- `queryKey` includes full `query` object so page/tagId changes produce distinct cache entries

**Checkpoint 2:**
- `pnpm build` — 0 errors, 0 warnings
- `pnpm lint --max-warnings 0`

---

## Phase 3 — `SearchResultCard` Component

**File to create:** `apps/frontend/src/components/SearchResultCard.tsx`

Same structure as `NoteCard.tsx` but accepts `ISearchResult` and renders the `highlight` field instead of a plain content preview.

```typescript
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ISearchResult } from "@noteapp/shared";

interface SearchResultCardProps {
  result: ISearchResult;
  onDelete: (id: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SearchResultCard({ result, onDelete }: SearchResultCardProps) {
  const navigate = useNavigate();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/notes/${result.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate(`/notes/${result.id}`);
      }}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 text-sm font-semibold leading-snug">
          {result.title || "Untitled"}
        </h3>
        <button
          type="button"
          aria-label="Delete note"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(result.id);
          }}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {result.highlight && (
        <p
          className="line-clamp-2 text-xs text-muted-foreground [&_mark]:rounded [&_mark]:bg-yellow-200 [&_mark]:px-0.5 [&_mark]:text-yellow-900 dark:[&_mark]:bg-yellow-800 dark:[&_mark]:text-yellow-100"
          // highlight is server-generated via PostgreSQL ts_headline with fixed <mark> template
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: result.highlight }}
        />
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {result.tags.map((tag) => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="text-xs"
            style={tag.color ? { backgroundColor: tag.color + "33", color: tag.color } : undefined}
          >
            {tag.name}
          </Badge>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {formatDate(result.updatedAt)}
        </span>
      </div>
    </div>
  );
}
```

Key decisions:
- `[&_mark]:bg-yellow-200` — scoped Tailwind variant targets `<mark>` inside the paragraph without a global CSS rule
- Dark mode variant included via `dark:[&_mark]:bg-yellow-800`
- `dangerouslySetInnerHTML` is on `<p>`, not the outer card, so XSS surface is limited to the snippet text only
- Identical click-to-edit and delete affordances as `NoteCard` (satisfies S2, spec assumption A8)

**Checkpoint 3:**
- `pnpm build` — 0 errors, 0 warnings
- `pnpm lint --max-warnings 0`

---

## Phase 4 — `NotesPage` Search Integration

**File to modify:** `apps/frontend/src/pages/NotesPage.tsx`

### New imports
```typescript
import { useSearch } from "@/hooks/useSearch";
import { SearchResultCard } from "@/components/SearchResultCard";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
```

### New state and URL reading
Add alongside existing `searchParams` destructuring:

```typescript
// Raw input value — local state, drives debounce
const [rawQuery, setRawQuery] = useState<string>(searchParams.get("q") ?? "");

// Debounced URL write — 400ms
useEffect(() => {
  const trimmed = rawQuery.trim();
  const timer = setTimeout(() => {
    const params = new URLSearchParams(searchParams);
    if (trimmed === "") {
      params.delete("q");
    } else {
      params.set("q", trimmed);
      params.set("page", "1");
    }
    setSearchParams(params, { replace: true });
  }, 400);
  return () => clearTimeout(timer);
}, [rawQuery]); // searchParams intentionally excluded — only rawQuery drives the timer

// URL-driven search mode
const q = searchParams.get("q") ?? "";
const isSearchMode = q.trim().length > 0;
```

URL persistence (S9): `useState` initialized from `searchParams.get("q")` so a direct visit to `/notes?q=foo` pre-fills the input.

### Conditional data fetching
```typescript
const notesQuery = useNotes(query);          // always registered
const searchQuery = useSearch({              // enabled only when isSearchMode
  q,
  page,
  limit: 20,
  tagId: tagIds,
});

const notes = isSearchMode
  ? (searchQuery.data?.results ?? [])
  : (notesQuery.data?.notes ?? []);
const meta = isSearchMode
  ? (searchQuery.data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 })
  : (notesQuery.data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 });
const isLoading = isSearchMode ? searchQuery.isLoading : notesQuery.isLoading;
```

Both hooks are always called (hooks cannot be conditional). `useSearch` is a no-op when `enabled: false`.

### Toolbar JSX changes
Replace the existing toolbar `<div className="mb-4 flex items-center justify-between gap-4">` section:

```tsx
<div className="mb-4 flex items-center justify-between gap-4">
  <h1 className="text-xl font-semibold">Notes</h1>
  <div className="flex flex-1 items-center gap-3">
    {/* Search input — always visible */}
    <div className="relative flex-1 max-w-sm">
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={rawQuery}
        onChange={(e) => setRawQuery(e.target.value)}
        placeholder="Search notes…"
        className="pl-8 pr-8"
        aria-label="Search notes"
      />
      {rawQuery && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => setRawQuery("")}
          className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>

    {/* Sort — only when not in search mode */}
    {!isSearchMode && (
      <Select value={sortKey} onValueChange={handleSortChange}>
        ...existing Select JSX...
      </Select>
    )}

    {/* New note — always visible */}
    <Button onClick={...} disabled={...}>
      ...existing Button JSX...
    </Button>
  </div>
</div>
```

### Grid JSX changes
In the notes grid section, replace `<NoteCard ... />` with a conditional render:

```tsx
{isSearchMode ? (
  <SearchResultCard
    key={note.id}
    result={note as ISearchResult}
    onDelete={(id) => handleDeleteClick(id, note.title)}
  />
) : (
  <NoteCard
    key={note.id}
    note={note}
    onDelete={(id) => handleDeleteClick(id, note.title)}
  />
)}
```

### Empty state change
When `isSearchMode && notes.length === 0` show search-specific empty state:

```tsx
<p className="text-muted-foreground">
  No notes match "{q}".{" "}
  <button
    type="button"
    className="underline"
    onClick={() => setRawQuery("")}
  >
    Clear search
  </button>
</p>
```

**Checkpoint 4:**
- `pnpm build` — 0 errors, 0 warnings
- `pnpm lint --max-warnings 0`

---

## Phase 5 — `useDeleteNote` Cache Invalidation

**File to modify:** `apps/frontend/src/hooks/useDeleteNote.ts`

Add one `invalidateQueries` call in `onSuccess`:

```typescript
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ["notes"] });
  void queryClient.invalidateQueries({ queryKey: ["search"] });  // ← ADD
  toast.success("Note deleted");
},
```

The prefix `["search"]` matches all search cache entries regardless of query params (satisfies S12).

**Checkpoint 5:**
- `pnpm build` — 0 errors, 0 warnings
- `pnpm lint --max-warnings 0`

---

## Phase 6 — Tests

Delegate to test-writer agent. Every scenario in spec.md must have at least one test.

**Hook tests** (`apps/frontend/src/__tests__/hooks/`):

- [ ] `useSearch.test.ts`
  - [ ] AC-S1: Happy path — results returned with highlight field
  - [ ] AC-S3: No results — returns empty array
  - [ ] AC-S5: Tag filter forwarded — `tagId[]` param included in request URL
  - [ ] AC-S6: Pagination — `page=2` forwarded in request URL
  - [ ] AC-S10: Whitespace query — `enabled: false`; no request fires
  - [ ] AC-S13: VALIDATION_ERROR — `toast.error` called with server message

**Component tests** (`apps/frontend/src/__tests__/components/`):

- [ ] `SearchResultCard.test.tsx`
  - [ ] AC-S2: `<mark>` tags rendered as HTML (dangerouslySetInnerHTML produces `<mark>` in DOM)
  - [ ] AC-S2: `<mark>` text has amber highlight style
  - [ ] AC-S12: Click body — navigates to `/notes/:id`
  - [ ] AC-S12: Click delete button — calls `onDelete`; does NOT navigate (stopPropagation)

**Page tests** (`apps/frontend/src/__tests__/pages/`):

- [ ] `NotesPage.test.tsx` (extend existing file)
  - [ ] AC-S1: Typing query → debounce fires → `SearchResultCard` grid renders
  - [ ] AC-S3: Search returns empty → "No notes match" empty state shown
  - [ ] AC-S7: Changing query → `?page=` resets to `1`
  - [ ] AC-S8: Clearing input → `?q=` removed; `NoteCard` grid restores
  - [ ] AC-S9: URL has `?q=foo` on load → input pre-filled; search results render
  - [ ] AC-S10: Whitespace-only input → no search; notes list shown
  - [ ] AC-S11: Search pending → skeleton placeholders shown
  - [ ] AC-S12: Delete from search result → `["search"]` query cache invalidated
  - [ ] AC-S14: Sort `<Select>` hidden when `?q=` is set
  - [ ] AC-S4: Soft-deleted notes — only items returned by API are rendered (backend enforces; render test confirms no extras)

**Checkpoint 6 (final):**
- `pnpm build` — 0 errors, 0 warnings
- `pnpm lint --max-warnings 0`
- `pnpm test` — all green
- Coverage ≥ 80% on all new files

---

## File Change Summary

| Action | File | Phase |
|--------|------|-------|
| MODIFY | `apps/frontend/src/mocks/handlers.ts` | 1 |
| CREATE | `apps/frontend/src/hooks/useSearch.ts` | 2 |
| CREATE | `apps/frontend/src/components/SearchResultCard.tsx` | 3 |
| MODIFY | `apps/frontend/src/pages/NotesPage.tsx` | 4 |
| MODIFY | `apps/frontend/src/hooks/useDeleteNote.ts` | 5 |
| CREATE | `apps/frontend/src/__tests__/hooks/useSearch.test.ts` | 6 |
| CREATE | `apps/frontend/src/__tests__/components/SearchResultCard.test.tsx` | 6 |
| MODIFY | `apps/frontend/src/__tests__/pages/NotesPage.test.tsx` | 6 |

No changes to `packages/shared/`, `apps/backend/`, or `App.tsx`.

---

## Risks & Assumptions

| # | Risk/Assumption | Mitigation |
|---|----------------|-----------|
| R1 | `searchParams` in the debounce `useEffect` dependency array would cause the effect to re-run on every URL change, creating a potential loop | Exclude `searchParams` from the dependency array; only `rawQuery` drives the timer; the `setSearchParams` call is guarded by the 400ms delay |
| R2 | Both `useNotes` and `useSearch` are always called (React hook rules prohibit conditional calls); `useNotes` fires an extra request while search is active | `useSearch` has `enabled: query.q.trim().length > 0`; `useNotes` still fires but its results are unused while `isSearchMode` is true — acceptable overhead given the 30s stale time |
| R3 | `dangerouslySetInnerHTML` introduces an XSS surface | HTML is produced exclusively by PostgreSQL `ts_headline` with a fixed `<mark>` template; users can only receive highlights from their own notes (server-enforced); risk is accepted per spec assumption A4 |
| R4 | `ISearchResult` from `@noteapp/shared` extends `INoteResponse` — the grid casts `note as ISearchResult` when in search mode | The cast is safe because `useSearch` returns `ISearchResult[]` typed correctly; the cast is needed only because the shared `notes` variable is typed as `INoteResponse[]` for the non-search branch |
| R5 | Clearing input while on page > 1 of search results would show the notes list at `?page=2`, which may be empty if the user has fewer than 21 notes | The debounce handler removes `?q=` but does not reset `?page=`; add `params.set("page", "1")` in the clear-path of the debounce effect |
