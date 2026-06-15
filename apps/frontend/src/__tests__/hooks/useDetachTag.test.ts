import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useDetachTag } from "../../hooks/useDetachTag";
import { toast } from "sonner";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
});
afterAll(() => server.close());

function createWrapper(queryClient?: QueryClient) {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client },
      React.createElement(MemoryRouter, null, children)
    );
  };
}

describe("useDetachTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("AC-S16: Detach tag — DELETE fires and query is invalidated on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useDetachTag(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ noteId: "note-1", tagId: "tag-1" });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    // After detach, note returned with empty tags array
    expect(result.current.data).toMatchObject({
      id: "note-1",
      tags: [],
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["note", "note-1"] })
    );
  });

  it("AC-S16: Detach tag error — toast.error shown when API fails", async () => {
    server.use(
      http.delete("/api/notes/:noteId/tags/:tagId", () =>
        HttpResponse.json(
          { error: { code: "TAG_NOT_FOUND", message: "Tag not found" } },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() => useDetachTag(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate({ noteId: "note-1", tagId: "nonexistent-tag" });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Tag not found");
  });
});
