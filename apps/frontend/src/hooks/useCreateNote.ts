import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { INoteResponse, TCreateNoteInput } from "@noteapp/shared";

export function useCreateNote() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: TCreateNoteInput) =>
      api
        .post<{ data: INoteResponse }>("/notes", data)
        .then((r) => r.data.data),
    onSuccess: (note) => {
      navigate(`/notes/${note.id}`);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
