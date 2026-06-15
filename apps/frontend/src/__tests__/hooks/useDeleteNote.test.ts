import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useDeleteNote } from "../../hooks/useDeleteNote";
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

describe("useDeleteNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S10: delete note success — DELETE called, toast.success shown, query invalidated", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, children)
      );

    const { result } = renderHook(() => useDeleteNote(), { wrapper });

    await act(async () => {
      result.current.mutate("note-1");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Note deleted");
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["notes"] })
    );
  });

  it("AC-S12: delete note API error — toast.error shown, mutation enters error state", async () => {
    server.use(
      http.delete("/api/notes/:id", () =>
        HttpResponse.json(
          { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() => useDeleteNote(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      result.current.mutate("note-999");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Note not found");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
