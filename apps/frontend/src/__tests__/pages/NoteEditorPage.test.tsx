import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";
import * as useAutosaveModule from "../../hooks/useAutosave";

// Mock useNavigate so we can assert navigation calls
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

// TipTap does not work in jsdom — replace with a stub
vi.mock("@tiptap/react", () => ({
  useEditor: vi.fn(() => ({
    commands: { setContent: vi.fn() },
    getHTML: vi.fn(() => "<p>Test content</p>"),
    destroy: vi.fn(),
  })),
  EditorContent: ({ editor }: { editor: unknown }) =>
    editor ? React.createElement("div", { "data-testid": "editor-content" }, "editor") : null,
}));

vi.mock("@tiptap/starter-kit", () => ({ default: {} }));

import { NoteEditorPage } from "../../pages/NoteEditorPage";
import { toast } from "sonner";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
});
afterAll(() => server.close());

function renderEditorPage(noteId = "note-1") {
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
        <MemoryRouter initialEntries={[`/notes/${noteId}`]}>
          <Routes>
            <Route path="/notes/:id" element={<NoteEditorPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe("NoteEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  it("AC-S1: Load note — happy path renders title input and editor, shows Saved status", async () => {
    renderEditorPage("note-1");

    // Wait for the note data to load and populate the title input
    await waitFor(() => {
      const titleInput = screen.getByRole("textbox", { name: /note title/i });
      expect(titleInput).toHaveValue("Test Note");
    });

    // Editor content area should be rendered
    expect(screen.getByTestId("editor-content")).toBeInTheDocument();

    // Save status should show "Saved" after initLastSaved is called
    await waitFor(() => {
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  it("AC-S2: Note not found — navigates to /notes and shows toast.error", async () => {
    renderEditorPage("not-found");

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/notes");
    });

    expect(toast.error).toHaveBeenCalledWith("Note not found");
  });

  it("AC-S3: Loading state — skeletons rendered while note is pending", async () => {
    server.use(
      http.get("/api/notes/:id", async () => {
        await new Promise(() => {
          // Never resolves — keeps loading state
        });
        return HttpResponse.json({ data: {} });
      })
    );

    renderEditorPage("note-1");

    // While loading, skeleton elements should be present
    await waitFor(() => {
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    // Title input should NOT be visible (replaced by skeleton)
    expect(screen.queryByRole("textbox", { name: /note title/i })).not.toBeInTheDocument();
  });

  it("AC-S14: Back navigation — clicking Notes button navigates to /notes", async () => {
    renderEditorPage("note-1");

    // Wait for the page to load
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /notes/i })).toBeInTheDocument();
    });

    const backButton = screen.getByRole("button", { name: /notes/i });
    fireEvent.click(backButton);

    expect(mockNavigate).toHaveBeenCalledWith("/notes");
  });

  it("AC-S21: Unauthenticated — 401 response clears auth and redirects to /login", async () => {
    // Return 401 for the note fetch
    server.use(
      http.get("/api/notes/:id", () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401 }
        )
      )
    );

    // The api.ts interceptor calls window.location.href = '/login' on 401
    // We verify that clearAuth was called (auth store cleared)
    const clearAuthSpy = vi.spyOn(useAuthStore.getState(), "clearAuth");

    renderEditorPage("note-1");

    await waitFor(() => {
      expect(clearAuthSpy).toHaveBeenCalled();
    });

    // Auth should be cleared
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("AC-S1b: Load note — tag chips rendered for attached tags", async () => {
    // Override GET /api/notes/:id to return a note that already has one tag attached
    server.use(
      http.get("/api/notes/:id", () =>
        HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "Test Note",
              content: "Test content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [{ id: "tag-1", name: "Work", color: "#3b82f6" }],
            },
          },
          { status: 200 }
        )
      )
    );

    renderEditorPage("note-1");

    // Wait for the note to load — title input appears
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: /note title/i })).toHaveValue("Test Note");
    });

    // Badge with tag name should be visible
    expect(screen.getByText("Work")).toBeInTheDocument();

    // Remove button for the tag should be visible
    expect(screen.getByRole("button", { name: "Remove tag Work" })).toBeInTheDocument();
  });

  it("AC-S15b: Tag panel — clicking remove tag calls DELETE detach endpoint", async () => {
    // Stateful flag: once the DELETE fires, the subsequent GET returns empty tags
    let detached = false;

    server.use(
      http.get("/api/notes/:id", () =>
        HttpResponse.json(
          {
            data: {
              id: "note-1",
              userId: "user-1",
              title: "Test Note",
              content: "Test content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: detached ? [] : [{ id: "tag-1", name: "Work", color: "#3b82f6" }],
            },
          },
          { status: 200 }
        )
      ),
      http.delete("/api/notes/:noteId/tags/:tagId", ({ params }) => {
        detached = true;
        return HttpResponse.json(
          {
            data: {
              id: String(params.noteId),
              userId: "user-1",
              title: "Test Note",
              content: "Test content",
              deletedAt: null,
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
              tags: [],
            },
          },
          { status: 200 }
        );
      })
    );

    renderEditorPage("note-1");

    // Wait for note and tag chip to appear
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Remove tag Work" })).toBeInTheDocument();
    });

    // Click the remove button — DELETE fires and subsequent GET refetch returns empty tags
    fireEvent.click(screen.getByRole("button", { name: "Remove tag Work" }));

    // After detach mutation resolves and refetch completes, the tag chip should be gone
    await waitFor(() => {
      expect(screen.queryByText("Work")).not.toBeInTheDocument();
    });
  });

  it("AC-S12b: Save failed status — shows 'Save failed' with destructive styling", async () => {
    // Spy on useAutosave so this single test receives saveStatus "error"
    const spy = vi
      .spyOn(useAutosaveModule, "useAutosave")
      .mockReturnValue({ saveStatus: "error", initLastSaved: vi.fn() });

    renderEditorPage("note-1");

    // Wait for page to mount — "Save failed" label must appear
    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });

    // The status span must carry the destructive text colour class
    const statusSpan = screen.getByText("Save failed");
    expect(statusSpan.className).toContain("text-destructive");

    spy.mockRestore();
  });
}, 15000);
