import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { AxiosError } from "axios";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePublicNote } from "@/hooks/usePublicNote";
import type { IErrorResponse } from "@noteapp/shared";

const ERROR_MESSAGES: Record<string, string> = {
  SHARE_EXPIRED: "This link has expired.",
  SHARE_REVOKED: "This link has been revoked by the owner.",
  SHARE_NOT_FOUND: "This link could not be found.",
};

export function SharedNotePage() {
  const { token } = useParams<{ token: string }>();

  // token! is safe: this component is only mounted under /shared/:token
  const { data: note, isLoading, isError, error } = usePublicNote(token!);

  const errorCode = (error as AxiosError<IErrorResponse>)?.response?.data?.error
    ?.code;

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editable: false,
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor && note) {
      editor.commands.setContent(note.content, false);
    }
  }, [note, editor]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-8 py-12">
        <Skeleton className="mb-4 h-8 w-64" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      </div>
    );
  }

  if (isError) {
    const message =
      (errorCode && ERROR_MESSAGES[errorCode]) ?? "Something went wrong.";
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  if (!note) return null;

  return (
    <div className="mx-auto max-w-3xl px-8 py-12">
      <h1 className="mb-4 text-2xl font-bold">{note.title}</h1>

      {note.tags.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {note.tags.map((tag) => (
            <Badge
              key={tag.id}
              variant="secondary"
              className="text-xs"
              style={
                tag.color
                  ? { backgroundColor: tag.color + "33", color: tag.color }
                  : undefined
              }
            >
              {tag.name}
            </Badge>
          ))}
        </div>
      )}

      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none [&_.ProseMirror]:outline-none"
      />
    </div>
  );
}
