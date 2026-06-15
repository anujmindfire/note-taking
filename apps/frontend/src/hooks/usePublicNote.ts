import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { INoteResponse } from "@noteapp/shared";

export function usePublicNote(token: string) {
  return useQuery<INoteResponse>({
    queryKey: ["public-note", token],
    queryFn: () =>
      api
        .get<{ data: INoteResponse }>(`/share/${token}`)
        .then((r) => r.data.data),
    throwOnError: false,
    // No meta.onError — SharedNotePage handles errors directly via isError + error
  });
}
