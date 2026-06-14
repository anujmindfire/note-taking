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
import type { TListNotesQuery } from "@noteapp/shared";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date("2024-06-01T10:00:00.000Z");

const makeNoteRecord = (overrides: Partial<{
  id: string;
  userId: string;
  title: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Array<{ id: string; userId: string; name: string; color: string | null; noteCount: number; createdAt: Date }>;
}> = {}) => ({
  id: "note-uuid-1",
  userId: "user-uuid-1",
  title: "Test Note",
  content: "Test content",
  deletedAt: null as Date | null,
  createdAt: now,
  updatedAt: now,
  tags: [] as Array<{ id: string; userId: string; name: string; color: string | null; noteCount: number; createdAt: Date }>,
  ...overrides,
});

const defaultQuery: TListNotesQuery = {
  page: 1,
  limit: 20,
  sortBy: "createdAt",
  sortDir: "desc",
  tagId: [],
};

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// NoteService.listNotes — pagination unit tests
// ---------------------------------------------------------------------------

describe("NoteService.listNotes — pagination", () => {
  it("AC-P1: default params — calls findPaginated with defaults and returns correct notes and meta", async () => {
    const noteRecord = makeNoteRecord();
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [noteRecord], total: 1 });

    const result = await NoteService.listNotes("user-uuid-1", defaultQuery);

    expect(NoteRepository.findPaginated).toHaveBeenCalledWith("user-uuid-1", {
      page: 1,
      limit: 20,
      sortBy: "createdAt",
      sortDir: "desc",
      tagIds: [],
    });
    expect(result.notes).toHaveLength(1);
    expect(result.meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it("AC-P2: page=2,limit=2 — forwards correct pagination args to findPaginated", async () => {
    const noteRecord = makeNoteRecord({ id: "note-uuid-3", title: "Third Note" });
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [noteRecord], total: 3 });

    const query: TListNotesQuery = { ...defaultQuery, page: 2, limit: 2 };
    const result = await NoteService.listNotes("user-uuid-1", query);

    expect(NoteRepository.findPaginated).toHaveBeenCalledWith("user-uuid-1", {
      page: 2,
      limit: 2,
      sortBy: "createdAt",
      sortDir: "desc",
      tagIds: [],
    });
    expect(result.meta.page).toBe(2);
    expect(result.meta.limit).toBe(2);
  });

  it("AC-P3: total=0 — meta.totalPages equals 0", async () => {
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [], total: 0 });

    const result = await NoteService.listNotes("user-uuid-1", defaultQuery);

    expect(result.notes).toHaveLength(0);
    expect(result.meta.total).toBe(0);
    expect(result.meta.totalPages).toBe(0);
  });

  it("AC-P4: total=5,limit=2 — meta.totalPages equals 3 (Math.ceil(5/2))", async () => {
    const records = [makeNoteRecord(), makeNoteRecord({ id: "note-uuid-2" })];
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: records, total: 5 });

    const query: TListNotesQuery = { ...defaultQuery, limit: 2 };
    const result = await NoteService.listNotes("user-uuid-1", query);

    expect(result.meta.total).toBe(5);
    expect(result.meta.limit).toBe(2);
    expect(result.meta.totalPages).toBe(3);
  });

  it("AC-P5: empty tagId array — passes tagIds: [] to findPaginated", async () => {
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [], total: 0 });

    const query: TListNotesQuery = { ...defaultQuery, tagId: [] };
    await NoteService.listNotes("user-uuid-1", query);

    expect(NoteRepository.findPaginated).toHaveBeenCalledWith("user-uuid-1", expect.objectContaining({
      tagIds: [],
    }));
  });

  it("AC-P6: tagId=[uuid1,uuid2] — passes both tag IDs as tagIds to findPaginated", async () => {
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [], total: 0 });

    const query: TListNotesQuery = {
      ...defaultQuery,
      tagId: ["tag-uuid-1", "tag-uuid-2"],
    };
    await NoteService.listNotes("user-uuid-1", query);

    expect(NoteRepository.findPaginated).toHaveBeenCalledWith("user-uuid-1", expect.objectContaining({
      tagIds: ["tag-uuid-1", "tag-uuid-2"],
    }));
  });

  it("AC-P7: mapToResponse converts Date fields to ISO strings", async () => {
    const tagDate = new Date("2024-05-01T08:00:00.000Z");
    const noteRecord = makeNoteRecord({
      tags: [{ id: "tag-uuid-1", userId: "user-uuid-1", name: "work", color: null, noteCount: 2, createdAt: tagDate }],
    });
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [noteRecord], total: 1 });

    const result = await NoteService.listNotes("user-uuid-1", defaultQuery);

    expect(typeof result.notes[0]!.createdAt).toBe("string");
    expect(result.notes[0]!.createdAt).toBe(now.toISOString());
    expect(typeof result.notes[0]!.updatedAt).toBe("string");
    expect(result.notes[0]!.updatedAt).toBe(now.toISOString());
    expect(typeof result.notes[0]!.tags[0]!.createdAt).toBe("string");
    expect(result.notes[0]!.tags[0]!.createdAt).toBe(tagDate.toISOString());
  });

  it("AC-P8: page and limit from params are returned unchanged in meta", async () => {
    vi.mocked(NoteRepository.findPaginated).mockResolvedValue({ notes: [], total: 0 });

    const query: TListNotesQuery = { ...defaultQuery, page: 5, limit: 10 };
    const result = await NoteService.listNotes("user-uuid-1", query);

    expect(result.meta.page).toBe(5);
    expect(result.meta.limit).toBe(10);
  });
});
