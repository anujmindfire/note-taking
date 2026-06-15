import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import { useAuthStore } from "@/stores/authStore";
import type { IAuthResponse, TLoginInput } from "@noteapp/shared";

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (data: TLoginInput) =>
      api
        .post<{ data: IAuthResponse }>("/auth/login", data)
        .then((r) => r.data.data),
    onSuccess: (data) => {
      setAuth(data.accessToken, data.user);
      navigate("/notes");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
    },
  });
}
