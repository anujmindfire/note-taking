import axios from "axios";
import { useAuthStore } from "../stores/authStore.js";

export const api = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Exclude auth endpoints — a 401 from /auth/login means wrong credentials,
    // not an expired session; redirecting would reload the page and wipe the toast.
    const url: string = err.config?.url ?? "";
    if (err.response?.status === 401 && !url.startsWith("/auth/")) {
      useAuthStore.getState().clearAuth();
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
