import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";
import { RegisterPage } from "../../pages/RegisterPage";

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

function renderRegisterPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/register"]}>
        <RegisterPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderAppWithAuth(initialPath: string) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route
            path="/register"
            element={
              useAuthStore.getState().accessToken ? (
                <Navigate to="/notes" replace />
              ) : (
                <RegisterPage />
              )
            }
          />
          <Route path="/notes" element={<div>Notes page — coming soon</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it("AC-S1: valid registration calls register API then login API and navigates to /notes", async () => {
    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), "newuser@example.com");
    await user.type(screen.getByLabelText(/password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/notes");
    });
  });

  it("AC-S2: email already taken returns 422 EMAIL_TAKEN, toast.error shown", async () => {
    server.use(
      http.post("/api/auth/register", () =>
        HttpResponse.json(
          {
            error: {
              code: "EMAIL_TAKEN",
              message: "Email taken",
            },
          },
          { status: 422 }
        )
      )
    );

    const user = userEvent.setup();
    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), "taken@example.com");
    await user.type(screen.getByLabelText(/password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Email taken");
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("AC-S3: password without uppercase does not call the API", async () => {
    const user = userEvent.setup();
    let apiCalled = false;
    server.use(
      http.post("/api/auth/register", () => {
        apiCalled = true;
        return HttpResponse.json({ data: { userId: "user-1" } }, { status: 201 });
      })
    );

    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), "test@example.com");
    await user.type(screen.getByLabelText(/password/i), "nouppercase1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(apiCalled).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("AC-S4: invalid email format does not call the API", async () => {
    const user = userEvent.setup();
    let apiCalled = false;
    server.use(
      http.post("/api/auth/register", () => {
        apiCalled = true;
        return HttpResponse.json({ data: { userId: "user-1" } }, { status: 201 });
      })
    );

    renderRegisterPage();

    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/password/i), "Password1");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(apiCalled).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /create account/i })).toBeInTheDocument();
  });

  it("AC-S9: already-authenticated user visiting /register is redirected to /notes", async () => {
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    renderAppWithAuth("/register");

    await waitFor(() => {
      expect(screen.getByText("Notes page — coming soon")).toBeInTheDocument();
    });
  });
});
