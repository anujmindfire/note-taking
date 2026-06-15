import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { INoteResponse } from "@noteapp/shared";

export function useNote(id: string) {
  return useQuery<INoteResponse>({
    queryKey: ["note", id],
    queryFn: async () => {
      const res = await api.get<{ data: INoteResponse }>(`/notes/${id}`);
      return res.data.data;
    },
    retry: false,
  });
}
