import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { ISearchResult, INotesPageMeta, TSearchQuery } from "@noteapp/shared";

interface ISearchPageResult {
  results: ISearchResult[];
  meta: INotesPageMeta;
}

export function useSearch(query: TSearchQuery) {
  return useQuery<ISearchPageResult>({
    queryKey: ["search", query],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("q", query.q);
      params.set("page", String(query.page ?? 1));
      params.set("limit", String(query.limit ?? 20));
      for (const id of query.tagId ?? []) {
        params.append("tagId", id);
      }
      const res = await api.get<{ data: ISearchResult[]; meta: INotesPageMeta }>(
        `/search?${params.toString()}`
      );
      return { results: res.data.data, meta: res.data.meta };
    },
    enabled: query.q.trim().length > 0,
    throwOnError: false,
    meta: {
      onError: (err: unknown) => toast.error(getErrorMessage(err)),
    },
  });
}
