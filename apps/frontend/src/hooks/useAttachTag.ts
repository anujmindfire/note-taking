import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { INoteResponse } from "@noteapp/shared";

type AttachTagVars = { noteId: string; tagId: string };

export function useAttachTag() {
  const queryClient = useQueryClient();

  return useMutation<INoteResponse, Error, AttachTagVars>({
    mutationFn: ({ noteId, tagId }) =>
      api
        .post<{ data: INoteResponse }>(`/notes/${noteId}/tags/${tagId}`)
        .then((r) => r.data.data),
    onSuccess: (_, { noteId }) => {
      void queryClient.invalidateQueries({ queryKey: ["note", noteId] });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
