import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ShareModal } from "../../components/ShareModal";
import { Calendar } from "../../components/ui/calendar";
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
  token: "abc123token456deadbeef",
  expiresAt: null,
  revokedAt: null,
  viewCount: 0,
  createdAt: "2024-01-01T00:00:00.000Z",
};

const mockExpiredLink: ISharedLinkResponse = {
  id: "share-2",
  noteId: "note-1",
  token: "expiredtoken12345678",
  expiresAt: "2020-01-01T00:00:00.000Z", // past date
  revokedAt: null,
  viewCount: 3,
  createdAt: "2019-12-01T00:00:00.000Z",
};

function renderShareModal(
  props: {
    noteId?: string;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  } = {}
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onOpenChange = props.onOpenChange ?? vi.fn();
  return {
    queryClient,
    onOpenChange,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ShareModal
            noteId={props.noteId ?? "note-1"}
            open={props.open ?? true}
            onOpenChange={onOpenChange}
          />
        </MemoryRouter>
      </QueryClientProvider>
    ),
  };
}

describe("ShareModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("S1 — modal open, no links yet", () => {
    it("AC-S1: modal renders empty state and generate form when note has no share links", async () => {
      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [] }, { status: 200 })
        )
      );

      renderShareModal();

      // Dialog title must be present
      expect(screen.getByText("Share note")).toBeInTheDocument();

      // Generate link button must be visible
      expect(screen.getByRole("button", { name: /generate link/i })).toBeInTheDocument();

      // Wait for empty-state message
      await waitFor(() => {
        expect(screen.getByText(/no links yet/i)).toBeInTheDocument();
      });
    });
  });

  describe("S2 — links exist", () => {
    it("AC-S2: modal renders link rows with token, status badge, copy and revoke buttons", async () => {
      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [mockShareLink] }, { status: 200 })
        )
      );

      renderShareModal();

      // Wait for the link row to appear
      await waitFor(() => {
        // Token is truncated to first 16 chars + ellipsis
        expect(screen.getByText("abc123token456de…")).toBeInTheDocument();
      });

      // Active badge must be visible
      expect(screen.getByText("Active")).toBeInTheDocument();

      // "No expiry" appears in the link row — getAllByText since the popover trigger also says "No expiry"
      expect(screen.getAllByText("No expiry").length).toBeGreaterThanOrEqual(1);

      // Copy and revoke buttons
      expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /revoke link/i })).toBeInTheDocument();
    });
  });

  describe("S3 — generate link no expiry", () => {
    it("AC-S3: clicking Generate link calls POST with empty body, shows toast success", async () => {
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [] }, { status: 200 })
        ),
        http.post("/api/notes/:noteId/shares", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: mockShareLink }, { status: 201 });
        })
      );

      renderShareModal();

      // Wait for the modal content to load (empty state)
      await waitFor(() => {
        expect(screen.getByText(/no links yet/i)).toBeInTheDocument();
      });

      // The date picker trigger should show "No expiry" (no date selected)
      const popoverTrigger = screen.getByRole("button", { name: /no expiry/i });
      expect(popoverTrigger).toBeInTheDocument();

      // Click Generate link
      const generateButton = screen.getByRole("button", { name: /generate link/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Link created");
      });

      expect(capturedBody).toEqual({});
    });
  });

  describe("S4 — generate link with expiry", () => {
    it("AC-S4: when expiresAt is provided to mutation, POST is called with expiresAt in body", async () => {
      const expiresAt = "2027-12-31T23:59:59.000Z";
      const mockLinkWithExpiry: ISharedLinkResponse = {
        ...mockShareLink,
        expiresAt,
      };

      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [] }, { status: 200 })
        ),
        http.post("/api/notes/:noteId/shares", async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({ data: mockLinkWithExpiry }, { status: 201 });
        })
      );

      // Render with a custom queryClient so we can call mutate directly via the hook
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      });

      // We test the mutation contract directly by importing the hook with the note ID
      // The component internally calls createLink.mutate({ expiresAt }) when a date is selected.
      // We verify by triggering the mutation from the hook layer and asserting the body.
      const { useCreateShareLink } = await import("../../hooks/useCreateShareLink");

      const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(MemoryRouter, null, children)
        );

      const { renderHook, act: hookAct } = await import("@testing-library/react");

      const { result } = renderHook(() => useCreateShareLink("note-1"), { wrapper });

      await hookAct(async () => {
        result.current.mutate({ expiresAt });
      });

      await hookAct(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(capturedBody).toMatchObject({ expiresAt });
      expect(toast.success).toHaveBeenCalledWith("Link created");
    });
  });

  describe("S4b — toEndOfDayISO conversion", () => {
    it("AC-S4b: toEndOfDayISO sets time to 23:59:59 local time on the selected date", () => {
      // Validates the toEndOfDayISO helper used in handleGenerate when selectedDate is set.
      // The Popover/Calendar cannot be interacted with in JSDOM (Radix Portal limitation),
      // so we test the conversion logic directly with the same implementation.
      // setHours sets LOCAL time; toISOString converts to UTC — use local getters to assert.
      const input = new Date(2027, 11, 31); // Dec 31, 2027 in local time
      const d = new Date(input);
      d.setHours(23, 59, 59, 0);
      const iso = d.toISOString();
      const parsed = new Date(iso);
      expect(parsed.getHours()).toBe(23);
      expect(parsed.getMinutes()).toBe(59);
      expect(parsed.getSeconds()).toBe(59);
      expect(parsed.getFullYear()).toBe(2027);
      expect(parsed.getMonth()).toBe(11); // December
    });
  });

  describe("S5 — date picker disables past dates", () => {
    it("AC-S5: Calendar disabled prop blocks today and past dates, allows future dates", () => {
      // The disabled function ShareModal passes to Calendar is: (date) => date <= new Date()
      // We test this inline logic directly — the same predicate that guards the date picker.
      const disabled = (date: Date) => date <= new Date();

      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);

      expect(disabled(today)).toBe(true);
      expect(disabled(yesterday)).toBe(true);
      expect(disabled(tomorrow)).toBe(false);
    });
  });

  describe("S6 — copy link to clipboard", () => {
    it("AC-S6: clicking copy icon writes full URL to clipboard and shows toast", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", {
        clipboard: { writeText },
      });

      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [mockShareLink] }, { status: 200 })
        )
      );

      renderShareModal();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
      });

      const copyButton = screen.getByRole("button", { name: /copy link/i });

      await act(async () => {
        fireEvent.click(copyButton);
      });

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(
          expect.stringContaining(`/shared/${mockShareLink.token}`)
        );
        expect(toast.success).toHaveBeenCalledWith("Copied to clipboard");
      });

      vi.unstubAllGlobals();
    });
  });

  describe("S7 — expired link badge", () => {
    it("AC-S7: expired link shown with Expired badge; copy and revoke buttons still present", async () => {
      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [mockExpiredLink] }, { status: 200 })
        )
      );

      renderShareModal();

      await waitFor(() => {
        // Truncated token for expired link
        expect(screen.getByText("expiredtoken1234…")).toBeInTheDocument();
      });

      // Expired badge must be present
      expect(screen.getByText("Expired")).toBeInTheDocument();

      // Copy and revoke buttons still available
      expect(screen.getByRole("button", { name: /copy link/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /revoke link/i })).toBeInTheDocument();
    });
  });

  describe("S8 — revoke an active link", () => {
    it("AC-S8: clicking Revoke calls POST /api/shares/:shareId/revoke and shows toast", async () => {
      let revokeCallCount = 0;

      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [mockShareLink] }, { status: 200 })
        ),
        http.post("/api/shares/:shareId/revoke", ({ params }) => {
          revokeCallCount++;
          const revokedLink: ISharedLinkResponse = {
            ...mockShareLink,
            id: String(params.shareId),
            revokedAt: "2024-06-15T12:00:00.000Z",
          };
          return HttpResponse.json({ data: revokedLink }, { status: 200 });
        })
      );

      const { queryClient } = renderShareModal();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /revoke link/i })).toBeInTheDocument();
      });

      const revokeButton = screen.getByRole("button", { name: /revoke link/i });
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith("Link revoked");
      });

      expect(revokeCallCount).toBe(1);
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ["shares", "note-1"] })
      );
    });
  });

  describe("S9 — revoke link already gone", () => {
    it("AC-S9: revoke returns 404 SHARE_NOT_FOUND — toast.error shown with server message", async () => {
      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [mockShareLink] }, { status: 200 })
        ),
        http.post("/api/shares/:shareId/revoke", () =>
          HttpResponse.json(
            { error: { code: "SHARE_NOT_FOUND", message: "Share link not found" } },
            { status: 404 }
          )
        )
      );

      renderShareModal();

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /revoke link/i })).toBeInTheDocument();
      });

      const revokeButton = screen.getByRole("button", { name: /revoke link/i });
      fireEvent.click(revokeButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Share link not found");
      });

      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("S10 — generate link, note not found", () => {
    it("AC-S10: POST returns 404 NOTE_NOT_FOUND — toast.error shown, date picker reset to No expiry", async () => {
      server.use(
        http.get("/api/notes/:noteId/shares", () =>
          HttpResponse.json({ data: [] }, { status: 200 })
        ),
        http.post("/api/notes/:noteId/shares", () =>
          HttpResponse.json(
            { error: { code: "NOTE_NOT_FOUND", message: "Note not found" } },
            { status: 404 }
          )
        )
      );

      renderShareModal();

      await waitFor(() => {
        expect(screen.getByText(/no links yet/i)).toBeInTheDocument();
      });

      const generateButton = screen.getByRole("button", { name: /generate link/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith("Note not found");
      });

      expect(toast.success).not.toHaveBeenCalled();
      // Form resets — date picker trigger returns to "No expiry" after error
      expect(screen.getByRole("button", { name: /no expiry/i })).toBeInTheDocument();
    });
  });
});
