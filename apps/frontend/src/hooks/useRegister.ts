import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { IRegisterResponse, TRegisterInput } from "@noteapp/shared";

export function useRegister() {
  return useMutation({
    mutationFn: (data: TRegisterInput) =>
      api
        .post<{ data: IRegisterResponse }>("/auth/register", data)
        .then((r) => r.data.data),
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
