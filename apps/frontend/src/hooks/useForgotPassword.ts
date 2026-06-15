import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import type { IMessageResponse, TForgotPasswordInput } from "@noteapp/shared";

export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: TForgotPasswordInput) =>
      api
        .post<{ data: IMessageResponse }>("/auth/forgot-password", data)
        .then((r) => r.data.data),
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
