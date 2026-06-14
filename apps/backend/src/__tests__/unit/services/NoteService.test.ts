import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("../../../repositories/NoteRepository.js", () => ({
  NoteRepository: {
    findAllByUserId: vi.fn(),
    findByIdAndUserId: vi.fn(),
    findPaginated: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
}));

import { NoteRepository } from "../../../repositories/NoteRepository.js";
import { NoteService } from "../../../services/NoteService.js";
import { ErrorCode } from "@noteapp/shared";
import type { TListNotesQuery } from "@noteapp/shared";

const defaultQuery: TListNotesQuery = {
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortDir: "desc",
  tagId: [],
};

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date("2024-06-01T10:00:00.000Z");
const later = new Date("2024-06-01T11:00:00.000Z");

const mockNoteRecord = {
  id: "note-uuid-1",
  userId: "user-uuid-1",
  title: "My Note",
  content: "Hello world",
  deletedAt: null as Date | null,
  createdAt: now,
  updatedAt: now,
  tags: [] as Array<{ id: string; userId: string; name: string; color: string | null; noteCount: number; createdAt: Date }>,
};

const mockNoteResponse = {
  id: "note-uuid-1",
  userId: "user-uuid-1",
  title: "My Note",
  content: "Hello world",
  deletedAt: null,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  tags: [],
};

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// NoteService.listNotes
// ---------------------------------------------------------------------------

describe("NoteService.listNotes", () => {
  it("AC-N5: returns mapped notes and meta for user", async () => {
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [mockNoteRecord], total: 1 });

    const result = await NoteService.listNotes("user-uuid-1", defaultQuery);

    expect(result.notes).toHaveLength(1);
    expect(result.notes[0]).toMatchObject(mockNoteResponse);
    expect(result.meta).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(NoteRepository.findPaginated).toHaveBeenCalledWith("user-uuid-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortDir: "desc",
      tagIds: [],
    });
  });

  it("AC-N6: returns empty notes array and zero total when no active notes", async () => {
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [], total: 0 });

    const result = await NoteService.listNotes("user-uuid-1", defaultQuery);

    expect(result.notes).toEqual([]);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NoteService.getNote
// ---------------------------------------------------------------------------

describe("NoteService.getNote", () => {
  it("AC-N9: returns mapped note when it exists and is owned by user", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(mockNoteRecord);

    const result = await NoteService.getNote("note-uuid-1", "user-uuid-1");

    expect(result).toMatchObject(mockNoteResponse);
    expect(NoteRepository.findByIdAndUserId).toHaveBeenCalledWith("note-uuid-1", "user-uuid-1");
  });

  it("AC-N10: throws NOTE_NOT_FOUND when repository returns null (note does not exist)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.getNote("note-uuid-1", "user-uuid-1")).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });
  });

  it("AC-N11: throws NOTE_NOT_FOUND when note belongs to another user (repo returns null)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.getNote("note-uuid-1", "other-user-uuid")).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });
  });

  it("AC-N12: throws NOTE_NOT_FOUND when note is soft-deleted (repo returns null)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.getNote("note-uuid-1", "user-uuid-1")).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });
  });
});

// ---------------------------------------------------------------------------
// NoteService.createNote
// ---------------------------------------------------------------------------

describe("NoteService.createNote", () => {
  it("AC-N1: calls repo.create with correct args and returns mapped note", async () => {
    vi.mocked(NoteRepository.create).mockResolvedValue(mockNoteRecord);

    const result = await NoteService.createNote("user-uuid-1", { title: "My Note", content: "Hello world" });

    expect(result).toMatchObject(mockNoteResponse);
    expect(NoteRepository.create).toHaveBeenCalledWith({
      userId: "user-uuid-1",
      title: "My Note",
      content: "Hello world",
    });
  });

  it("AC-N2: calls repo.create with default title and empty content when body omitted", async () => {
    const defaultNoteRecord = { ...mockNoteRecord, title: "Untitled", content: "" };
    vi.mocked(NoteRepository.create).mockResolvedValue(defaultNoteRecord);

    const result = await NoteService.createNote("user-uuid-1", { title: "Untitled", content: "" });

    expect(result.title).toBe("Untitled");
    expect(result.content).toBe("");
    expect(NoteRepository.create).toHaveBeenCalledWith({
      userId: "user-uuid-1",
      title: "Untitled",
      content: "",
    });
  });

  it("AC-N1: returned note has tags as empty array when no tags attached", async () => {
    vi.mocked(NoteRepository.create).mockResolvedValue({ ...mockNoteRecord, tags: [] });

    const result = await NoteService.createNote("user-uuid-1", { title: "My Note", content: "Hello world" });

    expect(result.tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// NoteService.updateNote
// ---------------------------------------------------------------------------

describe("NoteService.updateNote", () => {
  it("AC-N14: calls repo.update and returns mapped note when note exists and is owned", async () => {
    const updatedRecord = { ...mockNoteRecord, title: "Updated Title", updatedAt: later };
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(mockNoteRecord);
    vi.mocked(NoteRepository.update).mockResolvedValue(updatedRecord);

    const result = await NoteService.updateNote("note-uuid-1", "user-uuid-1", { title: "Updated Title" });

    expect(result.title).toBe("Updated Title");
    expect(NoteRepository.findByIdAndUserId).toHaveBeenCalledWith("note-uuid-1", "user-uuid-1");
    expect(NoteRepository.update).toHaveBeenCalledWith("note-uuid-1", { title: "Updated Title" });
  });

  it("AC-N15: update content only — calls repo.update with content field", async () => {
    const updatedRecord = { ...mockNoteRecord, content: "New content", updatedAt: later };
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(mockNoteRecord);
    vi.mocked(NoteRepository.update).mockResolvedValue(updatedRecord);

    const result = await NoteService.updateNote("note-uuid-1", "user-uuid-1", { content: "New content" });

    expect(result.content).toBe("New content");
    expect(NoteRepository.update).toHaveBeenCalledWith("note-uuid-1", { content: "New content" });
  });

  it("AC-N16: throws NOTE_NOT_FOUND when findByIdAndUserId returns null (note does not exist)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.updateNote("note-uuid-1", "user-uuid-1", { title: "X" })).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });

    expect(NoteRepository.update).not.toHaveBeenCalled();
  });

  it("AC-N17: throws NOTE_NOT_FOUND when note is soft-deleted (repo returns null)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.updateNote("note-uuid-1", "user-uuid-1", { title: "X" })).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });

    expect(NoteRepository.update).not.toHaveBeenCalled();
  });

  it("AC-N18: throws NOTE_NOT_FOUND when note belongs to another user (repo returns null)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.updateNote("note-uuid-1", "other-user-uuid", { title: "X" })).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });

    expect(NoteRepository.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// NoteService.deleteNote
// ---------------------------------------------------------------------------

describe("NoteService.deleteNote", () => {
  it("AC-N21: calls repo.softDelete when note exists and is owned by user", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(mockNoteRecord);
    vi.mocked(NoteRepository.softDelete).mockResolvedValue(undefined);

    await expect(NoteService.deleteNote("note-uuid-1", "user-uuid-1")).resolves.toBeUndefined();

    expect(NoteRepository.findByIdAndUserId).toHaveBeenCalledWith("note-uuid-1", "user-uuid-1");
    expect(NoteRepository.softDelete).toHaveBeenCalledWith("note-uuid-1");
  });

  it("AC-N22: throws NOTE_NOT_FOUND when findByIdAndUserId returns null (note does not exist)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.deleteNote("note-uuid-1", "user-uuid-1")).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });

    expect(NoteRepository.softDelete).not.toHaveBeenCalled();
  });

  it("AC-N23: throws NOTE_NOT_FOUND when note belongs to another user (repo returns null)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.deleteNote("note-uuid-1", "other-user-uuid")).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });

    expect(NoteRepository.softDelete).not.toHaveBeenCalled();
  });

  it("AC-N24: throws NOTE_NOT_FOUND when note is already soft-deleted (repo returns null)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(NoteService.deleteNote("note-uuid-1", "user-uuid-1")).rejects.toMatchObject({
      code: ErrorCode.NOTE_NOT_FOUND,
    });

    expect(NoteRepository.softDelete).not.toHaveBeenCalled();
  });
});
