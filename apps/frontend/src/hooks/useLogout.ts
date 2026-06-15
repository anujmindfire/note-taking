import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getErrorMessage } from "@/lib/errorUtils";
import { useAuthStore } from "@/stores/authStore";
import { toast } from "sonner";

export function useLogout() {
  const { clearAuth } = useAuthStore();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => api.post("/auth/logout").then(() => undefined),
    onSuccess: () => {
      clearAuth();
      navigate("/login");
    },
    onError: (err) => {
      toast.error(getErrorMessage(err));
      clearAuth();
      navigate("/login");
    },
  });
}
