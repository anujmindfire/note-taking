import { useState } from "react";
import { Plus } from "lucide-react";
import { useTags } from "@/hooks/useTags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TagCreateDialog } from "@/components/TagCreateDialog";
import { cn } from "@/lib/utils";
import type { ITagResponse } from "@noteapp/shared";

interface TagSidebarProps {
  selectedTagIds: string[];
  onToggle: (id: string) => void;
}

export function TagSidebar({ selectedTagIds, onToggle }: TagSidebarProps) {
  const { data: tags, isLoading } = useTags();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <aside className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r px-3 py-4">
      <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Tags
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="mb-1 w-full justify-start text-xs"
        aria-label="New tag"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="mr-1.5 h-3 w-3" />
        New tag
      </Button>
      <TagCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      {isLoading
        ? Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded-md" />
          ))
        : (tags ?? []).map((tag: ITagResponse) => {
            const selected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggle(tag.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  selected && "bg-accent font-medium"
                )}
              >
                {tag.color && (
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {tag.noteCount}
                </Badge>
              </button>
            );
          })}
      {!isLoading && (tags ?? []).length === 0 && (
        <p className="px-1 text-xs text-muted-foreground">No tags yet.</p>
      )}
    </aside>
  );
}
