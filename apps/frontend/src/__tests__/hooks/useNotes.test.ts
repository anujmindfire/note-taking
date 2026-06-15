import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useNotes } from "../../hooks/useNotes";
import { toast } from "sonner";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
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

describe("useNotes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S1: notes exist — returns notes array and meta from API", async () => {
    const { result } = renderHook(
      () => useNotes({ page: 1, limit: 20, sortBy: "updatedAt", sortDir: "desc", tagId: [] }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.notes).toHaveLength(1);
    expect(result.current.data?.notes[0]).toMatchObject({
      id: "note-1",
      title: "Test Note",
      content: "Test content",
    });
    expect(result.current.data?.meta).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it("AC-S2: empty state — returns empty notes array", async () => {
    server.use(
      http.get("/api/notes", () =>
        HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        )
      )
    );

    const { result } = renderHook(
      () => useNotes({ page: 1, limit: 20, sortBy: "updatedAt", sortDir: "desc", tagId: [] }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.notes).toHaveLength(0);
    expect(result.current.data?.meta.total).toBe(0);
  });

  it("AC-S15: notes fetch error — query enters error state", async () => {
    server.use(
      http.get("/api/notes", () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401 }
        )
      )
    );

    // Wire a queryCache observer so meta.onError fires (matches App.tsx pattern)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.getQueryCache().config.onError = (error, query) => {
      const meta = query.meta as { onError?: (err: unknown) => void } | undefined;
      if (typeof meta?.onError === "function") {
        meta.onError(error);
      }
    };

    const { result } = renderHook(
      () => useNotes({ page: 1, limit: 20, sortBy: "updatedAt", sortDir: "desc", tagId: [] }),
      { wrapper: createWrapper(queryClient) }
    );

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("Unauthorized");
  });
});
