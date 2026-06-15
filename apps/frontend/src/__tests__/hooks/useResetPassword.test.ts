import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useResetPassword } from "../../hooks/useResetPassword";
import { toast } from "sonner";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MemoryRouter, null, children)
    );
  };
}

describe("useResetPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S12: reset password happy path resolves successfully", async () => {
    const { result } = renderHook(() => useResetPassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: "test@example.com",
        otp: "123456",
        newPassword: "NewPassword1",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toEqual({ message: "Password reset" });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("AC-S13: reset password OTP expired calls toast.error", async () => {
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json(
          {
            error: {
              code: "OTP_EXPIRED",
              message: "OTP expired",
            },
          },
          { status: 410 }
        )
      )
    );

    const { result } = renderHook(() => useResetPassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: "test@example.com",
        otp: "123456",
        newPassword: "NewPassword1",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("OTP expired");
  });

  it("AC-S14: reset password OTP invalid calls toast.error", async () => {
    server.use(
      http.post("/api/auth/reset-password", () =>
        HttpResponse.json(
          {
            error: {
              code: "OTP_INVALID",
              message: "OTP invalid",
            },
          },
          { status: 400 }
        )
      )
    );

    const { result } = renderHook(() => useResetPassword(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        email: "test@example.com",
        otp: "000000",
        newPassword: "NewPassword1",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("OTP invalid");
  });
});
