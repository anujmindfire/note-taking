import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import React from "react";
import { http, HttpResponse } from "msw";

import { server } from "../../mocks/server";
import { NoteCard } from "../../components/NoteCard";
import { DeleteNoteDialog } from "../../components/DeleteNoteDialog";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "sonner";
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
  content: "Test content",
  deletedAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
  tags: [],
};

function renderWithDialog(onDeleteClick: (id: string) => void = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <NoteCard note={mockNote} onDelete={onDeleteClick} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderWithDeleteDialog(noteId: string | null, open: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const onOpenChange = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DeleteNoteDialog
          open={open}
          onOpenChange={onOpenChange}
          noteId={noteId}
          noteTitle="Test Note"
        />
      </MemoryRouter>
    </QueryClientProvider>
  );

  return { onOpenChange };
}

describe("NoteCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("content preview truncates to 150 chars with ellipsis when content is longer", () => {
    const longContent = "a".repeat(160);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <NoteCard note={{ ...mockNote, content: longContent }} onDelete={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const preview = screen.getByText(/^a+…$/);
    expect(preview.textContent).toHaveLength(151); // 150 chars + "…"
  });

  it("AC-S10: clicking Delete button calls onDelete with the note id", () => {
    const onDelete = vi.fn();
    renderWithDialog(onDelete);

    const deleteButton = screen.getByRole("button", { name: /delete note/i });
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith("note-1");
  });

  it("AC-S11: clicking Cancel in the confirm dialog does not call the DELETE API", async () => {
    let apiCalled = false;
    server.use(
      http.delete("/api/notes/:id", () => {
        apiCalled = true;
        return new HttpResponse(null, { status: 204 });
      })
    );

    renderWithDeleteDialog("note-1", true);

    const cancelButton = await screen.findByRole("button", { name: /cancel/i });
    fireEvent.click(cancelButton);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(apiCalled).toBe(false);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("AC-S10: clicking Delete in the confirm dialog calls the DELETE API and shows toast.success", async () => {
    renderWithDeleteDialog("note-1", true);

    const deleteButton = await screen.findByRole("button", { name: /^delete$/i });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Note deleted");
    });
  });
});
