import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useShareLinks } from "../../hooks/useShareLinks";
import { toast } from "sonner";
import type { ISharedLinkResponse } from "@noteapp/shared";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const mockShareLink: ISharedLinkResponse = {
  id: "share-1",
  noteId: "note-1",
  token: "abc123token456",
  expiresAt: null,
  revokedAt: null,
  viewCount: 0,
  createdAt: "2024-01-01T00:00:00.000Z",
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

describe("useShareLinks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S1: empty list — returns empty array when note has no share links", async () => {
    server.use(
      http.get("/api/notes/:noteId/shares", () =>
        HttpResponse.json({ data: [] }, { status: 200 })
      )
    );

    const { result } = renderHook(() => useShareLinks("note-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
    expect(result.current.data).toHaveLength(0);
  });

  it("AC-S2: populated list — returns array with existing share links", async () => {
    server.use(
      http.get("/api/notes/:noteId/shares", () =>
        HttpResponse.json({ data: [mockShareLink] }, { status: 200 })
      )
    );

    const { result } = renderHook(() => useShareLinks("note-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0]).toMatchObject({
      id: "share-1",
      noteId: "note-1",
      token: "abc123token456",
      expiresAt: null,
      revokedAt: null,
    });
  });

  it("AC-S9: API error — isError set and toast.error called with server message", async () => {
    server.use(
      http.get("/api/notes/:noteId/shares", () =>
        HttpResponse.json(
          { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        )
      )
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

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, children)
      );

    const { result } = renderHook(() => useShareLinks("note-1", true), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("Note not found");
  });

  it("AC-S1 (enabled: false) — query does not fire when enabled is false", async () => {
    const requestSpy = vi.fn();

    server.use(
      http.get("/api/notes/:noteId/shares", () => {
        requestSpy();
        return HttpResponse.json({ data: [] }, { status: 200 });
      })
    );

    const { result } = renderHook(() => useShareLinks("note-1", false), {
      wrapper: createWrapper(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(requestSpy).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });
});
