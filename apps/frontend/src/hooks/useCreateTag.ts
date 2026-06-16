import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ITagResponse, TCreateTagInput } from "@noteapp/shared";

export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TCreateTagInput) =>
      api
        .post<{ data: ITagResponse }>("/api/tags", data)
        .then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tags"] }),
  });
}
