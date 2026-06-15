import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { INoteResponse } from "@noteapp/shared";

export function useRestoreVersion(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation<INoteResponse, Error, string>({
    mutationFn: (versionId: string) =>
      api
        .post<{ data: INoteResponse }>(`/notes/${noteId}/versions/${versionId}/restore`)
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["versions", noteId] });
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
