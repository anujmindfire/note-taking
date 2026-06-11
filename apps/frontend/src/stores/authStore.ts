import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { IUserResponse } from "@noteapp/shared";

interface AuthState {
  accessToken: string | null;
  user: IUserResponse | null;
  setAuth: (accessToken: string, user: IUserResponse) => void;
  setAccessToken: (accessToken: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      setAuth: (accessToken, user) => set({ accessToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clearAuth: () => set({ accessToken: null, user: null }),
    }),
    { name: "auth" }
  )
);
