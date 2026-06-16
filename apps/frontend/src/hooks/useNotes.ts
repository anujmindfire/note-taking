import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { INoteResponse, INotesPageMeta, TListNotesQuery } from "@noteapp/shared";

interface INotesResult {
  notes: INoteResponse[];
  meta: INotesPageMeta;
}

export function useNotes(query: TListNotesQuery) {
  return useQuery<INotesResult>({
    queryKey: ["notes", query],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", String(query.page ?? 1));
      params.set("limit", String(query.limit ?? 20));
      params.set("sortBy", query.sortBy ?? "updatedAt");
      params.set("sortDir", query.sortDir ?? "desc");
      for (const id of query.tagId ?? []) {
        params.append("tagId", id);
      }
      const res = await api.get<{ data: INoteResponse[]; meta: INotesPageMeta }>(
        `/notes?${params.toString()}`
      );
      return { notes: res.data.data, meta: res.data.meta };
    },
    throwOnError: false,
    meta: {
      onError: (err: unknown) => toast.error(getErrorMessage(err)),
    },
  });
}
