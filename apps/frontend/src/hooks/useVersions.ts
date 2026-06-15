import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { INoteVersion } from "@noteapp/shared";

export function useVersions(noteId: string, enabled: boolean) {
  return useQuery<INoteVersion[]>({
    queryKey: ["versions", noteId],
    queryFn: () =>
      api
        .get<{ data: INoteVersion[] }>(`/notes/${noteId}/versions`)
        .then((r) => r.data.data),
    enabled,
    throwOnError: false,
  });
}
