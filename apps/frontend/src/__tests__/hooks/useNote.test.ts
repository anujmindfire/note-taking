import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useNote } from "../../hooks/useNote";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
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

describe("useNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("AC-S1: Load note — happy path returns note data with title and content", async () => {
    const { result } = renderHook(() => useNote("note-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      id: "note-1",
      title: "Test Note",
      content: "Test content",
    });
  });

  it("AC-S2: Note not found — query enters error state with NOTE_NOT_FOUND", async () => {
    const { result } = renderHook(() => useNote("not-found"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = result.current.error as any;
    expect(err?.response?.data?.error?.code).toBe("NOTE_NOT_FOUND");
  });

  it("AC-S3: Loading state — isLoading is true before data arrives", async () => {
    server.use(
      http.get("/api/notes/:id", async () => {
        await new Promise(() => {
          // Never resolves — keeps isLoading true
        });
        return HttpResponse.json({ data: {} });
      })
    );

    const { result } = renderHook(() => useNote("note-1"), {
      wrapper: createWrapper(),
    });

    // Immediately after render, the query should be in loading/pending state
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
