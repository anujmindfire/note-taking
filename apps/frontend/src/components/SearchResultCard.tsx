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
          // highlight is server-generated via PostgreSQL ts_headline with a fixed <mark> template
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
