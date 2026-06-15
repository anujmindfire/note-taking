import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { INoteResponse, TUpdateNoteInput } from "@noteapp/shared";

type UpdateNoteVars = { id: string } & TUpdateNoteInput;

export function useUpdateNote() {
  return useMutation<INoteResponse, Error, UpdateNoteVars>({
    mutationFn: ({ id, ...body }) =>
      api
        .patch<{ data: INoteResponse }>(`/notes/${id}`, body)
        .then((r) => r.data.data),
  });
}
