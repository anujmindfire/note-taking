import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useAttachTag } from "../../hooks/useAttachTag";
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

describe("useAttachTag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("AC-S15: Attach tag — POST fires and query is invalidated on success", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useAttachTag(), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      result.current.mutate({ noteId: "note-1", tagId: "tag-1" });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toMatchObject({
      id: "note-1",
      tags: [{ id: "tag-1" }],
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["note", "note-1"] })
    );
  });

  it("AC-S17: Attach already-attached tag — POST fires and is idempotent (200 returned)", async () => {
    // The handler returns 200 with the note including the tag — idempotent
    const { result } = renderHook(() => useAttachTag(), {
      wrapper: createWrapper(),
    });

    // First attach
    await act(async () => {
      result.current.mutate({ noteId: "note-1", tagId: "tag-1" });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(result.current.isSuccess).toBe(true);

    // Second attach of the same tag — should also succeed (idempotent)
    await act(async () => {
      result.current.mutate({ noteId: "note-1", tagId: "tag-1" });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("AC-S18: Tag not found on attach — toast.error shown", async () => {
    server.use(
      http.post("/api/notes/:noteId/tags/:tagId", () =>
        HttpResponse.json(
          { error: { code: "TAG_NOT_FOUND", message: "Tag not found" } },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() => useAttachTag(), {
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
