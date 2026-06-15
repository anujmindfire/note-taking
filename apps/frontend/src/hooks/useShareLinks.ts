import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { ISharedLinkResponse } from "@noteapp/shared";

export function useShareLinks(noteId: string, enabled: boolean) {
  return useQuery<ISharedLinkResponse[]>({
    queryKey: ["shares", noteId],
    queryFn: () =>
      api
        .get<{ data: ISharedLinkResponse[] }>(`/notes/${noteId}/shares`)
        .then((r) => r.data.data),
    enabled,
    throwOnError: false,
    meta: {
      onError: (err: unknown) => toast.error(getErrorMessage(err)),
    },
  });
}
