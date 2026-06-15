import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ITagResponse } from "@noteapp/shared";

export function useTags() {
  return useQuery<ITagResponse[]>({
    queryKey: ["tags"],
    queryFn: async () => {
      const res = await api.get<{ data: ITagResponse[] }>("/tags");
      return res.data.data;
    },
  });
}
