import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getContentPreview } from "@/lib/noteUtils";
import type { INoteResponse } from "@noteapp/shared";

interface NoteCardProps {
  note: INoteResponse;
  onDelete: (id: string) => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function NoteCard({ note, onDelete }: NoteCardProps) {
  const navigate = useNavigate();
  const preview = getContentPreview(note.content);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/notes/${note.id}`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate(`/notes/${note.id}`);
      }}
      className="group relative flex cursor-pointer flex-col gap-2 rounded-lg border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 text-sm font-semibold leading-snug">
          {note.title || "Untitled"}
        </h3>
        <button
          type="button"
          aria-label="Delete note"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(note.id);
          }}
          className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {preview && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{preview}</p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        {note.tags.map((tag) => (
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
          {formatDate(note.updatedAt)}
        </span>
      </div>
    </div>
  );
}
