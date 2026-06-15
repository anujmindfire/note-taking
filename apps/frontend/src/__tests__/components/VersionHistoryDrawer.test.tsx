import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { VersionHistoryDrawer } from "../../components/VersionHistoryDrawer";
import { toast } from "sonner";
import type { INoteResponse, INoteVersion } from "@noteapp/shared";

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

interface IRenderDrawerOptions {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRestore?: (note: INoteResponse) => void;
  noteId?: string;
}

function renderDrawer(options: IRenderDrawerOptions = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onOpenChange = options.onOpenChange ?? vi.fn();
  const onRestore = options.onRestore ?? vi.fn();

  const utils = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <VersionHistoryDrawer
          noteId={options.noteId ?? "note-1"}
          open={options.open ?? true}
          onOpenChange={onOpenChange}
          onRestore={onRestore}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { ...utils, queryClient, onOpenChange, onRestore };
}

describe("VersionHistoryDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("S1 — drawer open, versions exist", () => {
    it("AC-S1: drawer open, versions exist — renders two version rows with v{N} · {date} text; Restore button present on non-current row", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () =>
          HttpResponse.json({ data: mockVersions }, { status: 200 })
        )
      );

      renderDrawer({ open: true });

      expect(screen.getByText("Version history")).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText(/v3 ·/)).toBeInTheDocument();
      });

      expect(screen.getByText(/v2 ·/)).toBeInTheDocument();

      // Two Restore buttons total (one disabled for current, one enabled for v2)
      const restoreButtons = screen.getAllByRole("button", { name: /restore/i });
      expect(restoreButtons).toHaveLength(2);

      // The non-current row (v2) has an enabled Restore button
      expect(restoreButtons[1]).not.toBeDisabled();
    });
  });

  describe("S2 — drawer open, no versions", () => {
    it("AC-S2: drawer open, no versions — renders 'No versions yet.'", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () =>
          HttpResponse.json({ data: [] }, { status: 200 })
        )
      );

      renderDrawer({ open: true });

      await waitFor(() => {
        expect(screen.getByText("No versions yet.")).toBeInTheDocument();
      });
    });
  });

  describe("S3 — drawer open, loading skeleton", () => {
    it("AC-S3: drawer open, loading — renders skeleton elements while fetch is in-flight", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () => new Promise(() => {}))
      );

      renderDrawer({ open: true });

      // Drawer title must be visible
      expect(screen.getByText("Version history")).toBeInTheDocument();

      // Skeleton rows ARE rendered — Sheet portals render into document.body, not container
      const skeletons = document.body.querySelectorAll('[class*="animate-pulse"]');
      expect(skeletons.length).toBeGreaterThan(0);

      // While loading, version rows and empty/error states must not be present
      expect(screen.queryByText(/v\d+ ·/)).not.toBeInTheDocument();
      expect(screen.queryByText("No versions yet.")).not.toBeInTheDocument();
      expect(screen.queryByText("Failed to load versions.")).not.toBeInTheDocument();
    });
  });

  describe("S4 — restore success", () => {
    it("AC-S4: restore success — clicking Restore calls POST; onRestore callback called with INoteResponse; onOpenChange(false) called; toast.success('Restored to v2')", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () =>
          HttpResponse.json({ data: mockVersions }, { status: 200 })
        ),
        http.post("/api/notes/:noteId/versions/:versionId/restore", () =>
          HttpResponse.json({ data: mockRestoredNote }, { status: 200 })
        )
      );

      const onRestore = vi.fn();
      const onOpenChange = vi.fn();

      renderDrawer({ open: true, onRestore, onOpenChange });

      await waitFor(() => {
        expect(screen.getByText(/v2 ·/)).toBeInTheDocument();
      });

      // The second Restore button corresponds to v2 (non-current)
      const restoreButtons = screen.getAllByRole("button", { name: /restore/i });
      fireEvent.click(restoreButtons[1]);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Restored to v2");
      });

      expect(onRestore).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          title: expect.any(String),
        })
      );
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe("S5 — current version Restore disabled", () => {
    it("AC-S5: current version Restore disabled — first version row's Restore button has disabled attribute", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () =>
          HttpResponse.json({ data: mockVersions }, { status: 200 })
        )
      );

      renderDrawer({ open: true });

      await waitFor(() => {
        expect(screen.getByText(/v3 ·/)).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole("button", { name: /restore/i });
      // First button belongs to the current (newest) version
      expect(restoreButtons[0]).toBeDisabled();
    });
  });

  describe("S6 — restore VERSION_NOT_FOUND", () => {
    it("AC-S6: restore VERSION_NOT_FOUND — toast.error shown with server message; drawer stays open", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () =>
          HttpResponse.json({ data: mockVersions }, { status: 200 })
        ),
        http.post("/api/notes/:noteId/versions/:versionId/restore", () =>
          HttpResponse.json(
            { error: { code: "VERSION_NOT_FOUND", message: "Version not found" } },
            { status: 404 }
          )
        )
      );

      const onOpenChange = vi.fn();

      renderDrawer({ open: true, onOpenChange });

      await waitFor(() => {
        expect(screen.getByText(/v2 ·/)).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole("button", { name: /restore/i });
      fireEvent.click(restoreButtons[1]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Version not found");
      });

      // Drawer stays open — onOpenChange(false) must NOT have been called
      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("S7 — restore NOTE_NOT_FOUND", () => {
    it("AC-S7: restore NOTE_NOT_FOUND — toast.error shown with server message; drawer stays open", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () =>
          HttpResponse.json({ data: mockVersions }, { status: 200 })
        ),
        http.post("/api/notes/:noteId/versions/:versionId/restore", () =>
          HttpResponse.json(
            { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
            { status: 404 }
          )
        )
      );

      const onOpenChange = vi.fn();

      renderDrawer({ open: true, onOpenChange });

      await waitFor(() => {
        expect(screen.getByText(/v2 ·/)).toBeInTheDocument();
      });

      const restoreButtons = screen.getAllByRole("button", { name: /restore/i });
      fireEvent.click(restoreButtons[1]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Note not found");
      });

      expect(onOpenChange).not.toHaveBeenCalledWith(false);
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("S8 — versions fetch error", () => {
    it("AC-S8: versions fetch error — renders 'Failed to load versions.'", async () => {
      server.use(
        http.get("/api/notes/:noteId/versions", () =>
          HttpResponse.json(
            { error: { code: "INTERNAL_SERVER_ERROR", message: "Server error" } },
            { status: 500 }
          )
        )
      );

      renderDrawer({ open: true });

      await waitFor(() => {
        expect(screen.getByText("Failed to load versions.")).toBeInTheDocument();
      });

      expect(screen.queryByText("No versions yet.")).not.toBeInTheDocument();
    });
  });
});
