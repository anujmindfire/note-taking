import { format } from "date-fns";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useVersions } from "@/hooks/useVersions";
import { useRestoreVersion } from "@/hooks/useRestoreVersion";
import type { INoteResponse } from "@noteapp/shared";

interface IVersionHistoryDrawerProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (note: INoteResponse) => void;
}

export function VersionHistoryDrawer({
  noteId,
  open,
  onOpenChange,
  onRestore,
}: IVersionHistoryDrawerProps) {
  const { data: versions = [], isLoading, isError } = useVersions(noteId, open);
  const restoreVersion = useRestoreVersion(noteId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Version history</SheetTitle>
        </SheetHeader>

        <div className="space-y-2 overflow-y-auto max-h-[calc(100vh-6rem)] pr-1">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : isError ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Failed to load versions.
            </p>
          ) : versions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No versions yet.
            </p>
          ) : (
            versions.map((version, index) => {
              const isCurrent = index === 0;
              return (
                <div
                  key={version.id}
                  className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    v{version.version} · {format(new Date(version.createdAt), "MMM d, h:mm a")}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {isCurrent && (
                      <Badge variant="secondary" className="text-xs">
                        Current
                      </Badge>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={isCurrent || restoreVersion.isPending}
                      onClick={() => {
                        restoreVersion.mutate(version.id, {
                          onSuccess: (note) => {
                            toast.success(`Restored to v${version.version}`);
                            onRestore(note);
                            onOpenChange(false);
                          },
                        });
                      }}
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
