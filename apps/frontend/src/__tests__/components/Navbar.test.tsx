import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";
import { Navbar } from "../../components/Navbar";

// Must mock react-router-dom before importing any component that uses useNavigate
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
});
afterAll(() => server.close());

function renderNavbar() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Navbar />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Navbar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().clearAuth();
  });

  it("AC-S13: logout button click — useLogout called, navigates to /login", async () => {
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });

    renderNavbar();

    // User email should appear in the navbar
    expect(screen.getByText("test@example.com")).toBeInTheDocument();

    const logoutButton = screen.getByRole("button", { name: /logout/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });

    // Auth store should be cleared after logout
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
