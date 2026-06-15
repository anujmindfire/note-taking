import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useRestoreVersion } from "../../hooks/useRestoreVersion";
import { toast } from "sonner";
import type { INoteResponse } from "@noteapp/shared";
import type { AxiosError } from "axios";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const mockRestoredNote: INoteResponse = {
  id: "note-1",
  userId: "user-1",
  title: "Previous title",
  content: "<p>Previous</p>",
  deletedAt: null,
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-15T13:00:00.000Z",
  tags: [],
};

describe("useRestoreVersion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S4: restore success — POST /api/notes/:noteId/versions/:versionId/restore returns INoteResponse, queryClient.invalidateQueries called with [\"versions\", noteId], toast.success NOT called from hook", async () => {
    server.use(
      http.post("/api/notes/:noteId/versions/:versionId/restore", () =>
        HttpResponse.json({ data: mockRestoredNote }, { status: 200 })
      )
    );

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

    const { result } = renderHook(() => useRestoreVersion("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate("v2-id");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(result.current.data).toMatchObject({
      id: "note-1",
      title: "Previous title",
      content: "<p>Previous</p>",
    });
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["versions", "note-1"] })
    );
    // toast.success is NOT called by the hook — the component fires it
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("AC-S6: VERSION_NOT_FOUND — POST returns 404 with VERSION_NOT_FOUND code, toast.error called with server message", async () => {
    server.use(
      http.post("/api/notes/:noteId/versions/:versionId/restore", () =>
        HttpResponse.json(
          { error: { code: "VERSION_NOT_FOUND", message: "Version not found" } },
          { status: 404 }
        )
      )
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, children)
      );

    const { result } = renderHook(() => useRestoreVersion("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate("v2-id");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Version not found");
    expect(toast.success).not.toHaveBeenCalled();
    const axiosError = result.current.error as AxiosError<{ error: { code: string } }>;
    expect(axiosError?.response?.data?.error?.code).toBe("VERSION_NOT_FOUND");
  });

  it("AC-S7: NOTE_NOT_FOUND — POST returns 404 with NOTE_NOT_FOUND code, toast.error called with server message", async () => {
    server.use(
      http.post("/api/notes/:noteId/versions/:versionId/restore", () =>
        HttpResponse.json(
          { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
          { status: 404 }
        )
      )
    );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, children)
      );

    const { result } = renderHook(() => useRestoreVersion("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate("v2-id");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Note not found");
    expect(toast.success).not.toHaveBeenCalled();
    const axiosError = result.current.error as AxiosError<{ error: { code: string } }>;
    expect(axiosError?.response?.data?.error?.code).toBe("NOTE_NOT_FOUND");
  });
});
