import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { TagSidebar } from "@/components/TagSidebar";
import { NoteCard } from "@/components/NoteCard";
import { SearchResultCard } from "@/components/SearchResultCard";
import { DeleteNoteDialog } from "@/components/DeleteNoteDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotes } from "@/hooks/useNotes";
import { useSearch } from "@/hooks/useSearch";
import { useCreateNote } from "@/hooks/useCreateNote";
import type { ISearchResult } from "@noteapp/shared";

type SortKey = "updatedAt-desc" | "updatedAt-asc" | "createdAt-desc" | "createdAt-asc";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "updatedAt-desc", label: "Recently updated" },
  { value: "updatedAt-asc", label: "Least recently updated" },
  { value: "createdAt-desc", label: "Newest created" },
  { value: "createdAt-asc", label: "Oldest created" },
];

export function NotesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);
  const [deletingNoteTitle, setDeletingNoteTitle] = useState("");

  const page = Number(searchParams.get("page") ?? "1");
  const sortBy = (searchParams.get("sortBy") ?? "updatedAt") as "updatedAt" | "createdAt";
  const sortDir = (searchParams.get("sortDir") ?? "desc") as "asc" | "desc";
  const tagIds = searchParams.getAll("tagId[]");

  // URL-driven search query (debounced value)
  const q = searchParams.get("q") ?? "";
  const isSearchMode = q.trim().length > 0;

  // Raw input state — initialised from URL so direct visits to /notes?q=foo pre-fill the input
  const [rawQuery, setRawQuery] = useState<string>(q);

  // Debounce rawQuery → URL (400ms)
  useEffect(() => {
    const trimmed = rawQuery.trim();
    const timer = setTimeout(() => {
      const params = new URLSearchParams(searchParams);
      if (trimmed === "") {
        params.delete("q");
        params.set("page", "1");
      } else {
        params.set("q", trimmed);
        params.set("page", "1");
      }
      setSearchParams(params, { replace: true });
    }, 400);
    return () => clearTimeout(timer);
  }, [rawQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortKey: SortKey = `${sortBy}-${sortDir}`;

  const notesQuery = useNotes({ page, limit: 20, sortBy, sortDir, tagId: tagIds });
  const searchQuery = useSearch({ q, page, limit: 20, tagId: tagIds });

  const notes = isSearchMode
    ? (searchQuery.data?.results ?? [])
    : (notesQuery.data?.notes ?? []);
  const meta = isSearchMode
    ? (searchQuery.data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 })
    : (notesQuery.data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 });
  const isLoading = isSearchMode ? searchQuery.isLoading : notesQuery.isLoading;

  const createMutation = useCreateNote();

  function handleTagToggle(id: string) {
    const next = tagIds.includes(id)
      ? tagIds.filter((t) => t !== id)
      : [...tagIds, id];
    const params = new URLSearchParams(searchParams);
    params.delete("tagId[]");
    for (const t of next) params.append("tagId[]", t);
    params.set("page", "1");
    setSearchParams(params);
  }

  function handleSortChange(value: string) {
    const [newSortBy, newSortDir] = value.split("-") as ["updatedAt" | "createdAt", "asc" | "desc"];
    const params = new URLSearchParams(searchParams);
    params.set("sortBy", newSortBy);
    params.set("sortDir", newSortDir);
    params.set("page", "1");
    setSearchParams(params);
  }

  function handlePageChange(next: number) {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(next));
    setSearchParams(params);
  }

  function handleDeleteClick(id: string, title: string) {
    setDeletingNoteId(id);
    setDeletingNoteTitle(title);
  }

  return (
    <div className="flex h-screen flex-col">
      <Navbar />

      <div className="flex flex-1 overflow-hidden pt-14">
        <TagSidebar selectedTagIds={tagIds} onToggle={handleTagToggle} />

        <main className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h1 className="text-xl font-semibold">Notes</h1>
            <div className="flex flex-1 items-center gap-3">
              <div className="relative max-w-sm flex-1">
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

              {!isSearchMode && (
                <Select value={sortKey} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-52" aria-label="Sort notes">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                onClick={() =>
                  createMutation.mutate({ title: "Untitled", content: "" })
                }
                disabled={createMutation.isPending}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                {createMutation.isPending ? "Creating…" : "New Note"}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-36 w-full rounded-lg" />
              ))}
            </div>
          ) : notes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              {isSearchMode ? (
                <p className="text-muted-foreground">
                  No notes match &ldquo;{q}&rdquo;.{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => setRawQuery("")}
                  >
                    Clear search
                  </button>
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    No notes yet. Create your first note.
                  </p>
                  <Button
                    onClick={() =>
                      createMutation.mutate({ title: "Untitled", content: "" })
                    }
                    disabled={createMutation.isPending}
                  >
                    <Plus className="mr-1.5 h-4 w-4" />
                    New Note
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {isSearchMode
                ? (notes as ISearchResult[]).map((result) => (
                    <SearchResultCard
                      key={result.id}
                      result={result}
                      onDelete={(id) => handleDeleteClick(id, result.title)}
                    />
                  ))
                : notes.map((note) => (
                    <NoteCard
                      key={note.id}
                      note={note}
                      onDelete={(id) => handleDeleteClick(id, note.title)}
                    />
                  ))}
            </div>
          )}

          {meta.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
              >
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {meta.page} of {meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= meta.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </main>
      </div>

      <DeleteNoteDialog
        open={deletingNoteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingNoteId(null);
            setDeletingNoteTitle("");
          }
        }}
        noteId={deletingNoteId}
        noteTitle={deletingNoteTitle}
      />
    </div>
  );
}
