import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

// Must mock react-router-dom before importing the hook
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useCreateNote } from "../../hooks/useCreateNote";
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

describe("useCreateNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S9: create note success — POST /api/notes called and navigate to /notes/:id", async () => {
    const { result } = renderHook(() => useCreateNote(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ title: "Untitled", content: "" });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("AC-S9: create note API error — toast.error shown and navigate not called", async () => {
    server.use(
      http.post("/api/notes", () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401 }
        )
      )
    );

    const { result } = renderHook(() => useCreateNote(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ title: "Untitled", content: "" });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Unauthorized");
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
