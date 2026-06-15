import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useCreateShareLink } from "../../hooks/useCreateShareLink";
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

describe("useCreateShareLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S3: generate link with no expiry — POST called with empty body, 201 response, toast success", async () => {
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post("/api/notes/:noteId/shares", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: mockShareLink }, { status: 201 });
      })
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

    const { result } = renderHook(() => useCreateShareLink("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate({});
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(capturedBody).toEqual({});
    expect(toast.success).toHaveBeenCalledWith("Link created");
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["shares", "note-1"] })
    );
  });

  it("AC-S4: generate link with expiry — POST called with expiresAt in body, 201 response, toast success", async () => {
    const expiresAt = "2027-12-31T23:59:59.000Z";
    const mockLinkWithExpiry: ISharedLinkResponse = {
      ...mockShareLink,
      expiresAt,
    };

    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post("/api/notes/:noteId/shares", async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: mockLinkWithExpiry }, { status: 201 });
      })
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

    const { result } = renderHook(() => useCreateShareLink("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate({ expiresAt });
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isSuccess).toBe(true);
    expect(capturedBody).toMatchObject({ expiresAt });
    expect(toast.success).toHaveBeenCalledWith("Link created");
    expect(result.current.data).toMatchObject({ expiresAt });
  });

  it("AC-S10: note not found — API returns 404 NOTE_NOT_FOUND, toast.error shown, mutation enters error state", async () => {
    server.use(
      http.post("/api/notes/:noteId/shares", () =>
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

    const { result } = renderHook(() => useCreateShareLink("note-1"), { wrapper });

    await act(async () => {
      result.current.mutate({});
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(result.current.isError).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Note not found");
    expect(toast.success).not.toHaveBeenCalled();
  });
});
