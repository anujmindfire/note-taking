import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Check, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useShareLinks } from "@/hooks/useShareLinks";
import { useCreateShareLink } from "@/hooks/useCreateShareLink";
import { useRevokeShareLink } from "@/hooks/useRevokeShareLink";
import type { ISharedLinkResponse, TCreateShareLinkInput } from "@noteapp/shared";

interface IShareModalProps {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getLinkStatus(link: ISharedLinkResponse): "active" | "expired" {
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return "expired";
  return "active";
}

function toEndOfDayISO(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

export function ShareModal({ noteId, open, onOpenChange }: IShareModalProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [copied, setCopied] = useState<string | null>(null);

  const { data: links = [], isLoading } = useShareLinks(noteId, open);
  const createLink = useCreateShareLink(noteId);
  const revokeLink = useRevokeShareLink(noteId);

  const visibleLinks = links.filter((l) => l.revokedAt === null);

  function handleGenerate() {
    const body: TCreateShareLinkInput = selectedDate
      ? { expiresAt: toEndOfDayISO(selectedDate) }
      : {};
    createLink.mutate(body, {
      onSuccess: () => setSelectedDate(undefined),
      onError: () => setSelectedDate(undefined),
    });
  }

  async function handleCopy(link: ISharedLinkResponse) {
    const url = `${window.location.origin}/shared/${link.token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Copied to clipboard");
    setCopied(link.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg flex flex-col overflow-hidden max-h-[85vh]">
        <DialogHeader className="shrink-0">
          <DialogTitle>Share note</DialogTitle>
        </DialogHeader>

        {/* Generate form */}
        <div className="flex shrink-0 items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-44 justify-start text-left font-normal text-sm">
                <CalendarIcon className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                {selectedDate ? format(selectedDate, "PP") : "No expiry"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                disabled={(date) => date <= new Date()}
              />
            </PopoverContent>
          </Popover>

          {selectedDate && (
            <Button
              variant="ghost"
              size="sm"
              className="px-2 text-xs"
              onClick={() => setSelectedDate(undefined)}
            >
              Clear
            </Button>
          )}

          <Button
            size="sm"
            className="ml-auto"
            onClick={handleGenerate}
            disabled={createLink.isPending}
          >
            Generate link
          </Button>
        </div>

        {/* Link list */}
        <div className="flex-1 min-h-0 space-y-2 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : visibleLinks.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No links yet.
            </p>
          ) : (
            visibleLinks.map((link) => {
              const status = getLinkStatus(link);
              return (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
                    {link.token.slice(0, 16)}…
                  </span>

                  <Badge
                    variant={status === "expired" ? "secondary" : "default"}
                    className="shrink-0 text-xs"
                  >
                    {status === "expired" ? "Expired" : "Active"}
                  </Badge>

                  <span className="shrink-0 text-xs text-muted-foreground">
                    {link.expiresAt
                      ? format(new Date(link.expiresAt), "PP")
                      : "No expiry"}
                  </span>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    aria-label="Copy link"
                    onClick={() => void handleCopy(link)}
                  >
                    {copied === link.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    aria-label="Revoke link"
                    onClick={() => revokeLink.mutate(link.id)}
                    disabled={revokeLink.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
