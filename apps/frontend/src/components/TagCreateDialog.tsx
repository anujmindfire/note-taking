import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateTag } from "@/hooks/useCreateTag";
import { getErrorMessage } from "@/lib/errorUtils";

interface TagCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TagCreateDialog({ open, onOpenChange }: TagCreateDialogProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const createTag = useCreateTag();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    createTag.mutate(
      { name: trimmed, color },
      {
        onSuccess: () => {
          toast.success(`Tag "${trimmed}" created`);
          setName("");
          setColor("#6366f1");
          onOpenChange(false);
        },
        onError: (err) => {
          toast.error(getErrorMessage(err));
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New tag</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tag-name">Tag name</Label>
            <Input
              id="tag-name"
              aria-label="Tag name"
              placeholder="e.g. Work"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tag-color">Color</Label>
            <div className="flex items-center gap-2">
              <Input
                id="tag-color"
                aria-label="Color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer p-1"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!name.trim() || createTag.isPending}
            >
              {createTag.isPending ? "Creating…" : "Create tag"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
