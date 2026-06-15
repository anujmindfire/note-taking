import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useUpdateNote } from "../../hooks/useUpdateNote";

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

describe("useUpdateNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("AC-S5: Edit content — PATCH fires with updated content and returns updated note", async () => {
    const { result } = renderHook(() => useUpdateNote(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        id: "note-1",
        content: "<p>Updated content</p>",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toMatchObject({
      id: "note-1",
      content: "<p>Updated content</p>",
    });
  });

  it("AC-S5: Edit content — PATCH fires with updated title and returns updated note", async () => {
    const { result } = renderHook(() => useUpdateNote(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({
        id: "note-1",
        title: "Updated Title",
      });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toMatchObject({
      id: "note-1",
      title: "Updated Title",
    });
  });

  it("AC-S5: Edit content — PATCH failure enters error state", async () => {
    server.use(
      http.patch("/api/notes/:id", () =>
        HttpResponse.json(
          { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() => useUpdateNote(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ id: "note-999", title: "Title" });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
  });
});
