import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { ISharedLinkResponse, TCreateShareLinkInput } from "@noteapp/shared";

export function useCreateShareLink(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation<ISharedLinkResponse, Error, TCreateShareLinkInput>({
    mutationFn: (data: TCreateShareLinkInput) =>
      api
        .post<{ data: ISharedLinkResponse }>(`/notes/${noteId}/shares`, data)
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shares", noteId] });
      toast.success("Link created");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
