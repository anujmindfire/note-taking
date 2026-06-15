import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useRevokeShareLink } from "../../hooks/useRevokeShareLink";
import { toast } from "sonner";
import type { ISharedLinkResponse } from "@noteapp/shared";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const mockRevokedLink: ISharedLinkResponse = {
  id: "share-1",
  noteId: "note-1",
  token: "abc123token456",
  expiresAt: null,
  revokedAt: "2024-06-15T12:00:00.000Z",
  viewCount: 0,
  createdAt: "2024-01-01T00:00:00.000Z",
};

describe("useRevokeShareLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S8: revoke success — POST /api/shares/:shareId/revoke called, toast success, shares query invalidated", async () => {
    server.use(
      http.post("/api/shares/:shareId/revoke", () =>
        HttpResponse.json({ data: mockRevokedLink }, { status: 200 })
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

    const { result } = renderHook(() => useRevokeShareLink("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate("share-1");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Link revoked");
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["shares", "note-1"] })
    );
  });

  it("AC-S9: revoke — link already gone — API returns 404 SHARE_NOT_FOUND, toast.error shown, shares query refetched", async () => {
    server.use(
      http.post("/api/shares/:shareId/revoke", () =>
        HttpResponse.json(
          { error: { code: "SHARE_NOT_FOUND", message: "Share link not found" } },
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
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(MemoryRouter, null, children)
      );

    const { result } = renderHook(() => useRevokeShareLink("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate("share-999");
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Share link not found");
    expect(toast.success).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["shares", "note-1"] })
    );
  });
});
