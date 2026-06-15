import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowLeft, Clock, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNote } from "@/hooks/useNote";
import { useAutosave } from "@/hooks/useAutosave";
import { useAttachTag } from "@/hooks/useAttachTag";
import { useDetachTag } from "@/hooks/useDetachTag";
import { useTags } from "@/hooks/useTags";
import { getErrorMessage } from "@/lib/errorUtils";
import { ShareModal } from "@/components/ShareModal";
import { VersionHistoryDrawer } from "@/components/VersionHistoryDrawer";
import type { INoteResponse } from "@noteapp/shared";

export function NoteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // id! is safe: this component is only mounted under the /notes/:id route,
  // so useParams always resolves a non-empty string here
  const { data: note, isLoading, isError, error } = useNote(id!);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const initializedRef = useRef(false);

  const { saveStatus, initLastSaved } = useAutosave(id!, title, content);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const attachTag = useAttachTag();
  const detachTag = useDetachTag();
  const { data: allTags = [] } = useTags();

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      setContent(e.getHTML());
    },
  });

  useEffect(() => {
    if (isError) {
      toast.error(getErrorMessage(error));
      navigate("/notes");
    }
  }, [isError, error, navigate]);

  useEffect(() => {
    if (note && editor && !initializedRef.current) {
      initializedRef.current = true;
      editor.commands.setContent(note.content, false);
      const initialHtml = editor.getHTML();
      setTitle(note.title);
      setContent(initialHtml);
      initLastSaved(note.title, initialHtml);
    }
  }, [note, editor, initLastSaved]);

  const attachedTagIds = new Set(note?.tags.map((t) => t.id) ?? []);
  const unattachedTags = allTags.filter((t) => !attachedTagIds.has(t.id));

  function handleAttach(tagId: string) {
    if (!id) return;
    attachTag.mutate({ noteId: id, tagId });
  }

  function handleRestore(note: INoteResponse) {
    setTitle(note.title);
    editor?.commands.setContent(note.content, false);
    initLastSaved(note.title, note.content);
  }

  function handleDetach(tagId: string) {
    if (!id) return;
    detachTag.mutate({ noteId: id, tagId });
  }

  const statusLabel =
    saveStatus === "saving"
      ? "Saving…"
      : saveStatus === "saved"
        ? "Saved"
        : saveStatus === "error"
          ? "Save failed"
          : null;

  return (
    <div className="flex h-screen flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/notes")}
          className="shrink-0"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Notes
        </Button>

        {isLoading ? (
          <Skeleton className="h-6 w-48" />
        ) : (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled"
            className="flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground"
            aria-label="Note title"
          />
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShareOpen(true)}
          className="shrink-0"
        >
          <Share2 className="mr-1.5 h-4 w-4" />
          Share
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setHistoryOpen(true)}
          className="shrink-0"
        >
          <Clock className="mr-1.5 h-4 w-4" />
          History
        </Button>

        {statusLabel && (
          <span
            className={
              saveStatus === "error"
                ? "shrink-0 text-xs text-destructive"
                : "shrink-0 text-xs text-muted-foreground"
            }
          >
            {statusLabel}
          </span>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </div>
        ) : (
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none focus:outline-none [&_.ProseMirror]:min-h-[60vh] [&_.ProseMirror]:outline-none"
          />
        )}
      </div>

      {id && (
        <ShareModal noteId={id} open={shareOpen} onOpenChange={setShareOpen} />
      )}

      {id && (
        <VersionHistoryDrawer
          noteId={id}
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          onRestore={handleRestore}
        />
      )}

      {/* Tag panel */}
      <div className="border-t px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {note?.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="flex items-center gap-1 text-xs"
              style={
                tag.color
                  ? { backgroundColor: tag.color + "33", color: tag.color }
                  : undefined
              }
            >
              {tag.name}
              <button
                type="button"
                aria-label={`Remove tag ${tag.name}`}
                onClick={() => handleDetach(tag.id)}
                className="ml-0.5 rounded hover:opacity-70"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}

          {unattachedTags.length > 0 && (
            <Select onValueChange={handleAttach} value="">
              <SelectTrigger className="h-7 w-36 text-xs">
                <SelectValue placeholder="Add tag…" />
              </SelectTrigger>
              <SelectContent>
                {unattachedTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id} className="text-xs">
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>
    </div>
  );
}
