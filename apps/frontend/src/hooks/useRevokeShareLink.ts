import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { ISharedLinkResponse } from "@noteapp/shared";

export function useRevokeShareLink(noteId: string) {
  const queryClient = useQueryClient();

  return useMutation<ISharedLinkResponse, Error, string>({
    mutationFn: (shareId: string) =>
      api
        .post<{ data: ISharedLinkResponse }>(`/shares/${shareId}/revoke`)
        .then((r) => r.data.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shares", noteId] });
      toast.success("Link revoked");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
