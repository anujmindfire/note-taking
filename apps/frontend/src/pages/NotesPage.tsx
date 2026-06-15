import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { TagSidebar } from "@/components/TagSidebar";
import { NoteCard } from "@/components/NoteCard";
import { DeleteNoteDialog } from "@/components/DeleteNoteDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNotes } from "@/hooks/useNotes";
import { useCreateNote } from "@/hooks/useCreateNote";

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

  const sortKey: SortKey = `${sortBy}-${sortDir}`;

  const query = { page, limit: 20, sortBy, sortDir, tagId: tagIds };
  const { data, isLoading } = useNotes(query);
  const createMutation = useCreateNote();

  const notes = data?.notes ?? [];
  const meta = data?.meta ?? { total: 0, page: 1, limit: 20, totalPages: 1 };

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
            <div className="flex items-center gap-3">
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
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => (
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
