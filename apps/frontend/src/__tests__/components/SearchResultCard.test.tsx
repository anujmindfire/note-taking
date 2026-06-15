import { describe, it, expect, vi, beforeAll, afterEach, afterAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

import { server } from "../../mocks/server";
import { SearchResultCard } from "../../components/SearchResultCard";
import type { ISearchResult } from "@noteapp/shared";

// Mock useNavigate used inside SearchResultCard
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());

const mockResult: ISearchResult = {
  id: "note-1",
  userId: "user-1",
  title: "React Testing",
  content: "Full note content here",
  highlight: "The <mark>react</mark> appears in this note",
  deletedAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-02T00:00:00.000Z",
  tags: [],
};

function renderCard(
  result: ISearchResult = mockResult,
  onDelete: (id: string) => void = vi.fn()
) {
  return render(
    <MemoryRouter>
      <SearchResultCard result={result} onDelete={onDelete} />
    </MemoryRouter>
  );
}

describe("SearchResultCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("AC-S2: <mark> tags rendered as HTML via dangerouslySetInnerHTML", () => {
    const { container } = renderCard();

    const markEl = container.querySelector("mark");
    expect(markEl).not.toBeNull();
    expect(markEl?.textContent).toBe("react");
  });

  it("AC-S2: <mark> element has bg-yellow-200 class applied (amber highlight)", () => {
    const { container } = renderCard();

    // The <mark> lives inside a <p> with Tailwind arbitrary-variant selectors
    // that target the child mark element. We assert the parent <p> contains
    // the class string that targets [&_mark]:bg-yellow-200
    const markParent = container.querySelector("p");
    expect(markParent).not.toBeNull();
    expect(markParent?.className).toContain("bg-yellow-200");
  });

  it("AC-S2: highlight snippet visible in rendered SearchResultCard", () => {
    renderCard();

    // The text content around the mark should be visible
    expect(screen.getByText(/appears in this note/i)).toBeInTheDocument();
  });

  it("AC-S12: SearchResultCard card click — navigates to /notes/:id", () => {
    renderCard();

    const card = screen.getByRole("button", { name: /react testing/i });
    fireEvent.click(card);

    expect(mockNavigate).toHaveBeenCalledWith("/notes/note-1");
  });

  it("AC-S12: SearchResultCard delete button — calls onDelete; does NOT navigate", () => {
    const onDelete = vi.fn();
    renderCard(mockResult, onDelete);

    const deleteButton = screen.getByRole("button", { name: /delete note/i });
    fireEvent.click(deleteButton);

    expect(onDelete).toHaveBeenCalledWith("note-1");
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("renders title and tags correctly", () => {
    const resultWithTag: ISearchResult = {
      ...mockResult,
      tags: [
        {
          id: "tag-1",
          userId: "user-1",
          name: "Work",
          color: "#3b82f6",
          noteCount: 1,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    };
    renderCard(resultWithTag);

    expect(screen.getByText("React Testing")).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });

  it("renders 'Untitled' when title is empty", () => {
    renderCard({ ...mockResult, title: "" });

    expect(screen.getByText("Untitled")).toBeInTheDocument();
  });

  it("does not render highlight section when highlight is empty string", () => {
    const { container } = renderCard({ ...mockResult, highlight: "" });

    const markEl = container.querySelector("mark");
    expect(markEl).toBeNull();
  });
});
