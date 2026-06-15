import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// TipTap does not work in jsdom — replace with a stub
vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn().mockReturnValue(null),
  EditorContent: () => null,
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));

import { SharedNotePage } from "../../pages/SharedNotePage";
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

function renderSharedNotePage(token = "test-token") {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/shared/${token}`]}>
          <Routes>
            <Route path="/shared/:token" element={<SharedNotePage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe("SharedNotePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S11: loading state — skeleton placeholders shown for title and content while API call is in-flight", async () => {
    server.use(
      http.get("/api/share/:token", async () => {
        await new Promise(() => {
          // Never resolves — keeps loading state permanently
        });
        return HttpResponse.json({ data: mockNote });
      })
    );

    renderSharedNotePage("loading-token");

    // Skeletons should be present during loading
    await waitFor(() => {
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    // Note title should NOT be visible yet
    expect(screen.queryByText("Test Note")).not.toBeInTheDocument();
  });

  it("AC-S12: valid token — note title, content placeholder, and tags rendered read-only with no navbar", async () => {
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

    renderSharedNotePage("valid-token");

    // Note title must render
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Test Note");
    });

    // Tag badge must render
    expect(screen.getByText("research")).toBeInTheDocument();

    // No navbar — the page uses bare layout with no navigation links
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("AC-S13: SHARE_EXPIRED 410 — page shows 'This link has expired.' error message", async () => {
    server.use(
      http.get("/api/share/:token", () =>
        HttpResponse.json(
          { error: { code: "SHARE_EXPIRED", message: "This link has expired" } },
          { status: 410 }
        )
      )
    );

    renderSharedNotePage("expired-token");

    await waitFor(() => {
      expect(screen.getByText("This link has expired.")).toBeInTheDocument();
    });

    // Note title must not be present
    expect(screen.queryByText("Test Note")).not.toBeInTheDocument();
  });

  it("AC-S14: note soft-deleted — backend returns 410 SHARE_EXPIRED; page shows 'This link has expired.'", async () => {
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

    renderSharedNotePage("soft-deleted-token");

    await waitFor(() => {
      expect(screen.getByText("This link has expired.")).toBeInTheDocument();
    });
  });

  it("AC-S15: SHARE_REVOKED 403 — page shows 'This link has been revoked by the owner.'", async () => {
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

    renderSharedNotePage("revoked-token");

    await waitFor(() => {
      expect(
        screen.getByText("This link has been revoked by the owner.")
      ).toBeInTheDocument();
    });
  });

  it("AC-S16: SHARE_NOT_FOUND 404 — page shows 'This link could not be found.'", async () => {
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

    renderSharedNotePage("nonexistent-token");

    await waitFor(() => {
      expect(screen.getByText("This link could not be found.")).toBeInTheDocument();
    });
  });
});
