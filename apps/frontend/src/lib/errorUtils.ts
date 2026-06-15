import type { AxiosError } from "axios";

export function getErrorMessage(err: unknown): string {
  const axiosErr = err as AxiosError<{ error?: { message?: string } }>;
  return axiosErr.response?.data?.error?.message ?? "Something went wrong";
}
