import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { usePublicNote } from "../../hooks/usePublicNote";
import type { INoteResponse } from "@noteapp/shared";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const mockNote: INoteResponse = {
  id: "note-1",
  userId: "user-1",
  title: "Test Note",
  content: "<p>Test content</p>",
  deletedAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
  tags: [],
};

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

describe("usePublicNote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S11: loading state — isLoading is true before API responds", async () => {
    server.use(
      http.get("/api/share/:token", async () => {
        await new Promise(() => {
          // Never resolves — keeps loading state permanently
        });
        return HttpResponse.json({ data: mockNote });
      })
    );

    const { result } = renderHook(() => usePublicNote("test-token"), {
      wrapper: createWrapper(),
    });

    // While the request is pending, isLoading should be true
    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });

  it("AC-S12: success with note data — returns note title, content, and tags", async () => {
    const noteWithTags: INoteResponse = {
      ...mockNote,
      tags: [
        {
          id: "tag-1",
          userId: "user-1",
          name: "research",
          color: "#3b82f6",
          noteCount: 3,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    };

    server.use(
      http.get("/api/share/:token", () =>
        HttpResponse.json({ data: noteWithTags }, { status: 200 })
      )
    );

    const { result } = renderHook(() => usePublicNote("valid-token"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      id: "note-1",
      title: "Test Note",
      content: "<p>Test content</p>",
    });
    expect(result.current.data?.tags).toHaveLength(1);
    expect(result.current.data?.tags[0].name).toBe("research");
  });

  it("AC-S13: SHARE_EXPIRED 410 — isError true, error contains SHARE_EXPIRED code", async () => {
    server.use(
      http.get("/api/share/:token", () =>
        HttpResponse.json(
          { error: { code: "SHARE_EXPIRED", message: "This link has expired" } },
          { status: 410 }
        )
      )
    );

    const { result } = renderHook(() => usePublicNote("expired-token"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
    // The error object is an AxiosError; verify the response data contains the code
    const axiosErr = result.current.error as {
      response?: { data?: { error?: { code?: string } }; status?: number };
    };
    expect(axiosErr?.response?.data?.error?.code).toBe("SHARE_EXPIRED");
    expect(axiosErr?.response?.status).toBe(410);
  });

  it("AC-S14: note soft-deleted — backend returns 410 SHARE_EXPIRED, same error as expired token", async () => {
    server.use(
      http.get("/api/share/:token", () =>
        HttpResponse.json(
          {
            error: {
              code: "SHARE_EXPIRED",
              message: "This link has expired",
            },
          },
          { status: 410 }
        )
      )
    );

    const { result } = renderHook(() => usePublicNote("deleted-note-token"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const axiosErr = result.current.error as {
      response?: { data?: { error?: { code?: string } }; status?: number };
    };
    expect(axiosErr?.response?.data?.error?.code).toBe("SHARE_EXPIRED");
    expect(axiosErr?.response?.status).toBe(410);
  });

  it("AC-S15: SHARE_REVOKED 403 — isError true, error contains SHARE_REVOKED code", async () => {
    server.use(
      http.get("/api/share/:token", () =>
        HttpResponse.json(
          {
            error: {
              code: "SHARE_REVOKED",
              message: "This link has been revoked by the owner",
            },
          },
          { status: 403 }
        )
      )
    );

    const { result } = renderHook(() => usePublicNote("revoked-token"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const axiosErr = result.current.error as {
      response?: { data?: { error?: { code?: string } }; status?: number };
    };
    expect(axiosErr?.response?.data?.error?.code).toBe("SHARE_REVOKED");
    expect(axiosErr?.response?.status).toBe(403);
  });

  it("AC-S16: SHARE_NOT_FOUND 404 — isError true, error contains SHARE_NOT_FOUND code", async () => {
    server.use(
      http.get("/api/share/:token", () =>
        HttpResponse.json(
          {
            error: {
              code: "SHARE_NOT_FOUND",
              message: "This link could not be found",
            },
          },
          { status: 404 }
        )
      )
    );

    const { result } = renderHook(() => usePublicNote("nonexistent-token"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const axiosErr = result.current.error as {
      response?: { data?: { error?: { code?: string } }; status?: number };
    };
    expect(axiosErr?.response?.data?.error?.code).toBe("SHARE_NOT_FOUND");
    expect(axiosErr?.response?.status).toBe(404);
  });
});
