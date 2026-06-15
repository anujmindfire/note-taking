import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useVersions } from "../../hooks/useVersions";
import type { INoteVersion } from "@noteapp/shared";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const mockVersions: INoteVersion[] = [
  {
    id: "v3-id",
    noteId: "note-1",
    version: 3,
    title: "Latest title",
    content: "<p>Latest</p>",
    createdAt: "2026-06-15T12:00:00.000Z",
  },
  {
    id: "v2-id",
    noteId: "note-1",
    version: 2,
    title: "Previous title",
    content: "<p>Previous</p>",
    createdAt: "2026-06-14T10:00:00.000Z",
  },
];

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

describe("useVersions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S1: versions exist — GET /api/notes/:noteId/versions returns array, data matches", async () => {
    server.use(
      http.get("/api/notes/:noteId/versions", () =>
        HttpResponse.json({ data: mockVersions }, { status: 200 })
      )
    );

    const { result } = renderHook(() => useVersions("note-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]).toMatchObject({
      id: "v3-id",
      noteId: "note-1",
      version: 3,
      title: "Latest title",
    });
    expect(result.current.data?.[1]).toMatchObject({
      id: "v2-id",
      noteId: "note-1",
      version: 2,
      title: "Previous title",
    });
  });

  it("AC-S2: no versions — GET returns empty array, data is empty", async () => {
    server.use(
      http.get("/api/notes/:noteId/versions", () =>
        HttpResponse.json({ data: [] }, { status: 200 })
      )
    );

    const { result } = renderHook(() => useVersions("note-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([]);
    expect(result.current.data).toHaveLength(0);
  });

  it("AC-S8: fetch error — GET returns 500, isError is true, data remains empty", async () => {
    server.use(
      http.get("/api/notes/:noteId/versions", () =>
        HttpResponse.json(
          { error: { code: "INTERNAL_SERVER_ERROR", message: "Server error" } },
          { status: 500 }
        )
      )
    );

    const { result } = renderHook(() => useVersions("note-1", true), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.data).toBeUndefined();
  });
});
