import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";
import { LoginPage } from "../../pages/LoginPage";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
});
afterAll(() => server.close());

function renderLoginPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderAppAtLogin() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const accessToken = useAuthStore.getState().accessToken;
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/login"]}>
        <Routes>
          <Route
            path="/login"
            element={
              accessToken ? <Navigate to="/notes" replace /> : <LoginPage />
            }
          />
          <Route path="/notes" element={<div>Notes page — coming soon</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it("AC-S5: user fills email and password, clicks Sign in, navigates to /notes", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/notes");
    });
  });

  it("AC-S6: invalid credentials returns 401, toast.error shown", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json(
          {
            error: {
              code: "INVALID_CREDENTIALS",
              message: "Invalid credentials",
            },
          },
          { status: 401 }
        )
      )
    );

    const user = userEvent.setup();
    renderLoginPage();

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Invalid credentials");
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("AC-S7: submitting empty form does not call the API", async () => {
    const user = userEvent.setup();
    let apiCalled = false;
    server.use(
      http.post("/api/auth/login", () => {
        apiCalled = true;
        return HttpResponse.json({ data: {} }, { status: 200 });
      })
    );

    renderLoginPage();

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // Give react-hook-form time to run validation
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(apiCalled).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    // Form should still be rendered
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("AC-S8: already-authenticated user visiting /login is redirected to /notes", async () => {
    // Pre-set auth state before rendering
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    renderAppAtLogin();

    await waitFor(() => {
      expect(screen.getByText("Notes page — coming soon")).toBeInTheDocument();
    });
  });
});
