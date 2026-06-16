import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { useAuthStore } from "../../stores/authStore";
import { NotesPage } from "../../pages/NotesPage";

// Mock useNavigate (used by useCreateNote and useLogout)
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
  useAuthStore.getState().clearAuth();
});
afterAll(() => server.close());

function renderNotesPage(initialEntry = "/notes") {
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
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/notes" element={<NotesPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe("NotesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set up a logged-in user so Navbar renders correctly
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  // S1: notes exist — cards rendered, pagination shown, sidebar populated
  it("AC-S1: notes exist — cards rendered, sidebar shows tag, pagination hidden for single page", async () => {
    renderNotesPage();

    // Wait for note card to appear
    await waitFor(() => {
      expect(screen.getByText("Test Note")).toBeInTheDocument();
    });

    // Sidebar shows the tag from useTags
    await waitFor(() => {
      expect(screen.getByText("Work")).toBeInTheDocument();
    });

    // Pagination is hidden when totalPages === 1
    expect(screen.queryByRole("button", { name: /prev/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /next/i })).not.toBeInTheDocument();
  });

  // S2: empty state — "No notes yet" message + New Note button
  it("AC-S2: empty state — shows no-notes message and New Note button", async () => {
    server.use(
      http.get("/api/notes", () =>
        HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        )
      )
    );

    renderNotesPage();

    await waitFor(() => {
      expect(
        screen.getByText(/no notes yet/i)
      ).toBeInTheDocument();
    });

    // The empty-state New Note button should be present
    const newNoteButtons = screen.getAllByRole("button", { name: /new note/i });
    expect(newNoteButtons.length).toBeGreaterThanOrEqual(1);
  });

  // S3: filter by one tag → URL updated, sidebar tag becomes selected
  it("AC-S3: filter by one tag — tag button toggled, query refetches with tagId", async () => {
    let capturedTagParam: string | null = null;

    server.use(
      http.get("/api/notes", ({ request }) => {
        const url = new URL(request.url);
        capturedTagParam = url.searchParams.get("tagId");
        return HttpResponse.json(
          {
            data: [],
            meta: { total: 0, page: 1, limit: 20, totalPages: 1 },
          },
          { status: 200 }
        );
      })
    );

    renderNotesPage();

    // Wait for tag sidebar to load
    const tagButton = await screen.findByRole("button", { name: /work/i });
    fireEvent.click(tagButton);

    await waitFor(() => {
      expect(capturedTagParam).toBe("tag-1");
    });
  });

  // S4: filter by multiple tags → URL has both tagId params
  it("AC-S4: filter by multiple tags — URL contains both tagId params", async () => {
    const capturedTagParams: string[] = [];

    server.use(
      http.get("/api/tags", () =>
        HttpResponse.json(
          {
            data: [
              {
                id: "tag-1",
                userId: "user-1",
                name: "Work",
                color: "#3b82f6",
                noteCount: 1,
                createdAt: "2024-01-01T00:00:00.000Z",
              },
              {
                id: "tag-2",
                userId: "user-1",
                name: "Personal",
                color: "#22c55e",
                noteCount: 2,
                createdAt: "2024-01-01T00:00:00.000Z",
              },
            ],
          },
          { status: 200 }
        )
      ),
      http.get("/api/notes", ({ request }) => {
        const url = new URL(request.url);
        capturedTagParams.length = 0;
        capturedTagParams.push(...url.searchParams.getAll("tagId"));
        return HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        );
      })
    );

    renderNotesPage();

    const workButton = await screen.findByRole("button", { name: /work/i });
    fireEvent.click(workButton);

    const personalButton = await screen.findByRole("button", { name: /personal/i });
    fireEvent.click(personalButton);

    await waitFor(() => {
      expect(capturedTagParams).toContain("tag-1");
      expect(capturedTagParams).toContain("tag-2");
    });
  });

  // S5: clear tag filter → tag removed from URL, page resets to 1
  it("AC-S5: clear tag filter — clicking active tag removes it, page resets to 1", async () => {
    const capturedParams: { tagIds: string[]; page: string | null }[] = [];

    server.use(
      http.get("/api/notes", ({ request }) => {
        const url = new URL(request.url);
        capturedParams.push({
          tagIds: url.searchParams.getAll("tagId"),
          page: url.searchParams.get("page"),
        });
        return HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        );
      })
    );

    renderNotesPage("/notes?tagId=tag-1&page=2");

    // Tag should be pre-selected; click it to deselect
    const tagButton = await screen.findByRole("button", { name: /work/i });
    fireEvent.click(tagButton);

    await waitFor(() => {
      const last = capturedParams[capturedParams.length - 1];
      expect(last.tagIds).toHaveLength(0);
      expect(last.page).toBe("1");
    });
  });

  // S6: change sort → URL updated with sortBy/sortDir, page resets to 1
  it("AC-S6: change sort — URL updated with new sortBy/sortDir and page resets to 1", async () => {
    const capturedParams: { sortBy: string | null; sortDir: string | null; page: string | null }[] =
      [];

    server.use(
      http.get("/api/notes", ({ request }) => {
        const url = new URL(request.url);
        capturedParams.push({
          sortBy: url.searchParams.get("sortBy"),
          sortDir: url.searchParams.get("sortDir"),
          page: url.searchParams.get("page"),
        });
        return HttpResponse.json(
          { data: [], meta: { total: 0, page: 2, limit: 20, totalPages: 3 } },
          { status: 200 }
        );
      })
    );

    renderNotesPage("/notes?page=2");

    // Open the sort select using Radix — use fireEvent to avoid pointer-events issues
    const trigger = screen.getByRole("combobox", { name: /sort notes/i });
    fireEvent.click(trigger);

    // Select "Oldest created" which maps to createdAt-asc
    const option = await screen.findByRole("option", { name: /oldest created/i });
    fireEvent.click(option);

    await waitFor(() => {
      const last = capturedParams[capturedParams.length - 1];
      expect(last.sortBy).toBe("createdAt");
      expect(last.sortDir).toBe("asc");
      expect(last.page).toBe("1");
    });
  });

  // S7: paginate forward → URL page=2
  it("AC-S7: paginate forward — clicking Next sets page=2 in query", async () => {
    const capturedPages: string[] = [];

    server.use(
      http.get("/api/notes", ({ request }) => {
        const url = new URL(request.url);
        capturedPages.push(url.searchParams.get("page") ?? "1");
        return HttpResponse.json(
          {
            data: [
              {
                id: "note-1",
                userId: "user-1",
                title: "Test Note",
                content: "Test content",
                deletedAt: null,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                tags: [],
              },
            ],
            meta: { total: 40, page: 1, limit: 20, totalPages: 2 },
          },
          { status: 200 }
        );
      })
    );

    renderNotesPage();

    const nextButton = await screen.findByRole("button", { name: /next/i });
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(capturedPages).toContain("2");
    });
  });

  // S8: paginate backward → URL page=1; Prev disabled on page 1
  it("AC-S8: paginate backward — clicking Prev returns to page 1; Prev disabled on page 1", async () => {
    const capturedPages: string[] = [];

    server.use(
      http.get("/api/notes", ({ request }) => {
        const url = new URL(request.url);
        capturedPages.push(url.searchParams.get("page") ?? "1");
        return HttpResponse.json(
          {
            data: [
              {
                id: "note-2",
                userId: "user-1",
                title: "Second Page Note",
                content: "content",
                deletedAt: null,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                tags: [],
              },
            ],
            meta: { total: 40, page: 2, limit: 20, totalPages: 2 },
          },
          { status: 200 }
        );
      })
    );

    renderNotesPage("/notes?page=2");

    // Prev should be enabled on page 2
    const prevButton = await screen.findByRole("button", { name: /prev/i });
    expect(prevButton).not.toBeDisabled();

    fireEvent.click(prevButton);

    await waitFor(() => {
      expect(capturedPages).toContain("1");
    });
  });

  it("AC-S8: Prev button is disabled when on page 1", async () => {
    server.use(
      http.get("/api/notes", () =>
        HttpResponse.json(
          {
            data: [
              {
                id: "note-1",
                userId: "user-1",
                title: "Test Note",
                content: "content",
                deletedAt: null,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                tags: [],
              },
            ],
            meta: { total: 40, page: 1, limit: 20, totalPages: 2 },
          },
          { status: 200 }
        )
      )
    );

    renderNotesPage();

    const prevButton = await screen.findByRole("button", { name: /prev/i });
    expect(prevButton).toBeDisabled();
  });

  // S9: create new note → POST /api/notes, navigate to /notes/:id
  it("AC-S9: clicking New Note — POST /api/notes called and navigate to /notes/note-1", async () => {
    renderNotesPage();

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText("Notes")).toBeInTheDocument();
    });

    // Click the New Note button in the header area
    const newNoteButton = screen.getByRole("button", { name: /new note/i });
    fireEvent.click(newNoteButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1");
    });
  });

  // S14: loading state → skeleton placeholders shown
  it("AC-S14: loading state — skeleton placeholders shown while notes are pending", async () => {
    // Use a handler that never resolves to keep the loading state
    server.use(
      http.get("/api/notes", async () => {
        await new Promise(() => {
          // Never resolves — keeps isLoading true
        });
        return HttpResponse.json({ data: [], meta: {} });
      })
    );

    renderNotesPage();

    // Skeletons should appear immediately while loading
    // The NotesPage renders 6 Skeleton components when isLoading is true
    // We check for the skeleton class presence in the DOM
    await waitFor(() => {
      // The skeleton elements have class "animate-pulse" from shadcn/ui Skeleton
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    // No note cards should be visible
    expect(screen.queryByText("Test Note")).not.toBeInTheDocument();
  });
}, 15000);

// ---------------------------------------------------------------------------
// AB-1013 — Search UI with highlights
// ---------------------------------------------------------------------------

/**
 * Advance fake timers and flush all pending promises/microtasks.
 * waitFor() uses setInterval internally so must NOT be used while fake
 * timers are active. Use this helper to advance time, then call
 * vi.useRealTimers() before any waitFor() assertion.
 */
async function advanceAndFlush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("NotesPage — Search (AB-1013)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth("token-123", {
      id: "user-1",
      email: "test@example.com",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // S1 — Search mode renders SearchResultCard grid
  it("AC-S1: search mode renders SearchResultCard grid in NotesPage", async () => {
    vi.useFakeTimers();
    renderNotesPage("/notes?q=react");

    // The initial URL already has q=react, so the debounce fires on mount
    // Advance past debounce (400ms) and let the search fetch settle
    await advanceAndFlush(500);

    // Switch to real timers so waitFor can poll
    vi.useRealTimers();

    await waitFor(() => {
      // SearchResultCard renders a role="button" with the note title
      expect(screen.getByRole("button", { name: /test note/i })).toBeInTheDocument();
    });
  }, 15000);

  // S2 — Highlight snippet visible in page
  it("AC-S2: highlight snippet visible in rendered SearchResultCard in page", async () => {
    vi.useFakeTimers();
    renderNotesPage("/notes?q=react");

    await advanceAndFlush(500);

    vi.useRealTimers();

    await waitFor(() => {
      // The MSW handler returns: The <mark>react</mark> appears in this note
      expect(screen.getByText(/appears in this note/i)).toBeInTheDocument();
    });
  }, 15000);

  // S3 — No results empty state
  it("AC-S3: no results — 'No notes match' empty state shown", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        )
      )
    );

    vi.useFakeTimers();
    renderNotesPage("/notes?q=nonexistent");

    await advanceAndFlush(500);

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText(/no notes match/i)).toBeInTheDocument();
    });
  }, 15000);

  // S4 — Only items returned by API are rendered (soft-deleted excluded by backend)
  it("AC-S4: only items returned by API are rendered (soft-deleted excluded by backend)", async () => {
    server.use(
      http.get("/api/search", () =>
        HttpResponse.json(
          {
            data: [
              {
                id: "note-live",
                userId: "user-1",
                title: "Live Note",
                content: "live content",
                highlight: "This is the <mark>react</mark> live note",
                deletedAt: null,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                tags: [],
              },
            ],
            meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
          },
          { status: 200 }
        )
      )
    );

    vi.useFakeTimers();
    renderNotesPage("/notes?q=react");

    await advanceAndFlush(500);

    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByText("Live Note")).toBeInTheDocument();
    });

    // A soft-deleted note with a different id must NOT appear
    expect(screen.queryByText("Deleted Note")).not.toBeInTheDocument();
  }, 15000);

  // S7 — Changing query resets ?page= to 1
  it("AC-S7: changing query resets ?page= to 1", async () => {
    let capturedPage: string | null = null;

    server.use(
      http.get("/api/search", ({ request }) => {
        const url = new URL(request.url);
        capturedPage = url.searchParams.get("page");
        return HttpResponse.json(
          {
            data: [
              {
                id: "note-1",
                userId: "user-1",
                title: "Test Note",
                content: "content",
                highlight: "The <mark>new</mark> query",
                deletedAt: null,
                createdAt: "2024-01-01T00:00:00.000Z",
                updatedAt: "2024-01-02T00:00:00.000Z",
                tags: [],
              },
            ],
            meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
          },
          { status: 200 }
        );
      })
    );

    vi.useFakeTimers();
    renderNotesPage("/notes?q=old&page=3");

    // Advance past initial debounce for "old" query
    await advanceAndFlush(500);

    const input = screen.getByRole("textbox", { name: /search notes/i });
    // Change the query — triggers a new 400ms debounce that resets page to 1
    fireEvent.change(input, { target: { value: "new" } });

    // Advance past the new debounce
    await advanceAndFlush(500);

    vi.useRealTimers();

    await waitFor(() => {
      expect(capturedPage).toBe("1");
    });
  }, 15000);

  // S8 — Clearing input removes ?q= from URL; NoteCard grid restored
  it("AC-S8: clearing input removes ?q= from URL; NoteCard grid restored", async () => {
    vi.useFakeTimers();
    renderNotesPage("/notes?q=react");

    // Advance past debounce so search results load
    await advanceAndFlush(500);

    vi.useRealTimers();

    // Wait for search result and clear button to appear
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /clear search/i })).toBeInTheDocument();
    });

    vi.useFakeTimers();

    // Clear the search using the X button
    const clearButton = screen.getByRole("button", { name: /clear search/i });
    fireEvent.click(clearButton);

    // Advance past the new debounce (rawQuery becomes "")
    await advanceAndFlush(500);

    vi.useRealTimers();

    // Sort select should reappear now that we are out of search mode
    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: /sort notes/i })).toBeInTheDocument();
    });

    // NoteCard (regular list) should be visible
    await waitFor(() => {
      expect(screen.getByText("Test Note")).toBeInTheDocument();
    });
  }, 20000);

  // S9 — Initial URL ?q=foo pre-fills input and renders search results on load
  it("AC-S9: initial URL ?q=foo — input pre-filled and search results render on load", async () => {
    vi.useFakeTimers();
    renderNotesPage("/notes?q=react");

    // Input should be pre-filled immediately from URL (no timer needed)
    const input = screen.getByRole("textbox", { name: /search notes/i });
    expect((input as HTMLInputElement).value).toBe("react");

    await advanceAndFlush(500);

    vi.useRealTimers();

    // Search results should appear
    await waitFor(() => {
      expect(screen.getByText(/appears in this note/i)).toBeInTheDocument();
    });
  }, 15000);

  // S10 — Whitespace input in page — ?q= not set; notes list remains
  it("AC-S10: whitespace input in page — ?q= not set; notes list remains", async () => {
    const searchRequestSpy = vi.fn();

    server.use(
      http.get("/api/search", () => {
        searchRequestSpy();
        return HttpResponse.json(
          { data: [], meta: { total: 0, page: 1, limit: 20, totalPages: 1 } },
          { status: 200 }
        );
      })
    );

    vi.useFakeTimers();
    renderNotesPage("/notes");

    const input = screen.getByRole("textbox", { name: /search notes/i });
    fireEvent.change(input, { target: { value: "   " } });

    // Advance past debounce — the effect fires but trimmed === "" so q param
    // is NOT set; useSearch stays disabled (enabled: q.trim().length > 0)
    await advanceAndFlush(500);

    // Search API must NOT be called
    expect(searchRequestSpy).not.toHaveBeenCalled();

    // Sort select must still be in the DOM (not in search mode)
    expect(screen.getByRole("combobox", { name: /sort notes/i })).toBeInTheDocument();

    vi.useRealTimers();

    // Regular notes list must still be visible
    await waitFor(() => {
      expect(screen.getByText("Test Note")).toBeInTheDocument();
    });
  }, 15000);

  // S11 — Search pending — skeleton placeholders shown
  it("AC-S11: search pending — skeleton placeholders shown while isLoading", async () => {
    server.use(
      http.get("/api/search", async () => {
        await new Promise(() => {
          // Never resolves — keeps search isLoading true
        });
        return HttpResponse.json({ data: [], meta: {} });
      })
    );

    vi.useFakeTimers();
    renderNotesPage("/notes?q=react");

    // Advance past debounce — search starts loading but never resolves
    await advanceAndFlush(500);

    // Check skeletons are present (fake timers still active — direct DOM query)
    const skeletons = document.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);

    expect(screen.queryByRole("button", { name: /test note/i })).not.toBeInTheDocument();
  }, 15000);

  // S12 — Delete note from search results — ["search"] cache invalidated
  it("AC-S12: delete note from search results — ['search'] cache invalidated", async () => {
    vi.useFakeTimers();
    const { queryClient } = renderNotesPage("/notes?q=react");

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await advanceAndFlush(500);

    vi.useRealTimers();

    // Wait for search result card's delete button to appear
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /delete note/i })).toBeInTheDocument();
    });

    // Click delete on the SearchResultCard
    const deleteButton = screen.getByRole("button", { name: /delete note/i });
    fireEvent.click(deleteButton);

    // The DeleteNoteDialog opens — click the confirm Delete button
    const confirmButton = await screen.findByRole("button", { name: /^delete$/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["search"] })
      );
    });
  }, 15000);

  // S14 — Sort <Select> not in DOM when ?q= is set
  it("AC-S1: sort <Select> not in DOM when ?q= is set (search mode active)", async () => {
    // isSearchMode is true immediately when q is in the URL;
    // the Select is conditionally rendered based on isSearchMode
    renderNotesPage("/notes?q=react");

    // Sort select must be absent in search mode immediately
    expect(screen.queryByRole("combobox", { name: /sort notes/i })).not.toBeInTheDocument();
  });

  // S14 — 401 on GET /api/search triggers auth clear + redirect to /login
  it("AC-S14: 401 on GET /api/search triggers auth clear + redirect to /login", async () => {
    // The api.ts interceptor calls window.location.href = '/login' on 401
    // (not useNavigate), so we assert that clearAuth was invoked on the store
    const clearAuthSpy = vi.spyOn(useAuthStore.getState(), "clearAuth");

    server.use(
      http.get("/api/search", () =>
        HttpResponse.json(
          { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
          { status: 401 }
        )
      )
    );

    // Render with ?q= active so useSearch fires and hits the mocked 401
    renderNotesPage("/notes?q=react");

    await waitFor(() => {
      expect(clearAuthSpy).toHaveBeenCalled();
    });
  }, 15000);
}, 15000);
