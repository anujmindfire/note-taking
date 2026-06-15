import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useSearch } from "../../hooks/useSearch";
import { toast } from "sonner";
import type { TSearchQuery } from "@noteapp/shared";

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

const baseQuery: TSearchQuery = {
  q: "react",
  page: 1,
  limit: 20,
  tagId: [],
};

describe("useSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S1: search returns results — useSearch returns results with highlight field", async () => {
    const { result } = renderHook(() => useSearch(baseQuery), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(1);
    expect(result.current.data?.results[0]).toMatchObject({
      id: "note-1",
      title: "Test Note",
    });
    // highlight field must be present and contain a <mark> tag
    expect(result.current.data?.results[0].highlight).toContain("<mark>");
    expect(result.current.data?.meta).toMatchObject({
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
  });

  it("AC-S3: no results — useSearch returns empty array", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        )
      )
    );

    const { result } = renderHook(() => useSearch(baseQuery), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.results).toHaveLength(0);
    expect(result.current.data?.meta.total).toBe(0);
  });

  it("AC-S5: tag filter forwarded — tagId[] param present in request URL", async () => {
    let capturedTagIds: string[] = [];

    server.use(
      http.get("/api/search", ({ request }) => {
        const url = new URL(request.url);
        capturedTagIds = url.searchParams.getAll("tagId[]");
        return HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        );
      })
    );

    const query: TSearchQuery = { ...baseQuery, tagId: ["tag-1", "tag-2"] };
    const { result } = renderHook(() => useSearch(query), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedTagIds).toContain("tag-1");
    expect(capturedTagIds).toContain("tag-2");
  });

  it("AC-S6: pagination forwarded — page=2 present in request URL", async () => {
    let capturedPage: string | null = null;

    server.use(
      http.get("/api/search", ({ request }) => {
        const url = new URL(request.url);
        capturedPage = url.searchParams.get("page");
        return HttpResponse.json(
          { data: [], meta: { total: 40, page: 2, limit: 20, totalPages: 2 } },
          { status: 200 }
        );
      })
    );

    const query: TSearchQuery = { ...baseQuery, page: 2 };
    const { result } = renderHook(() => useSearch(query), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(capturedPage).toBe("2");
  });

  it("AC-S10: whitespace query — enabled false; no HTTP request fires", async () => {
    const requestSpy = vi.fn();

    server.use(
      http.get("/api/search", () => {
        requestSpy();
        return HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        );
      })
    );

    const whitespaceQuery: TSearchQuery = { ...baseQuery, q: "   " };
    const { result } = renderHook(() => useSearch(whitespaceQuery), {
      wrapper: createWrapper(),
    });

    // Give TanStack Query time to potentially fire
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(requestSpy).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("AC-S13: VALIDATION_ERROR — API returns 400 VALIDATION_ERROR; toast.error called with server message", async () => {
    let capturedErrorCode: string | undefined;

    server.use(
      http.get("/api/search", () => {
        const body = { error: { code: "VALIDATION_ERROR", message: "Search query is required" } };
        capturedErrorCode = body.error.code;
        return HttpResponse.json(body, { status: 400 });
      })
    );

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.getQueryCache().config.onError = (error, query) => {
      const meta = query.meta as { onError?: (err: unknown) => void } | undefined;
      if (typeof meta?.onError === "function") {
        meta.onError(error);
      }
    };

    const { result } = renderHook(() => useSearch(baseQuery), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(capturedErrorCode).toBe("VALIDATION_ERROR");
    expect(toast.error).toHaveBeenCalledWith("Search query is required");
  });
});
