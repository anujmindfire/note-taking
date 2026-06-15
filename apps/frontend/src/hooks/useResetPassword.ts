import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { IMessageResponse, TResetPasswordInput } from "@noteapp/shared";

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: TResetPasswordInput) =>
      api
        .post<{ data: IMessageResponse }>("/auth/reset-password", data)
        .then((r) => r.data.data),
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
