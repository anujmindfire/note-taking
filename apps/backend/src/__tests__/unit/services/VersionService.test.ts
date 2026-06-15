import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("../../../repositories/VersionRepository.js", () => ({
  VersionRepository: {
    getMaxVersion: vi.fn(),
    create: vi.fn(),
    findAllByNoteId: vi.fn(),
    findByIdAndNoteId: vi.fn(),
    purgeOldVersions: vi.fn(),
  },
}));

vi.mock("../../../repositories/NoteRepository.js", () => ({
  NoteRepository: {
    findAllByUserId: vi.fn(),
    findByIdAndUserId: vi.fn(),
    findByIdAndUserIdIncludeDeleted: vi.fn(),
    restore: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findPaginated: vi.fn(),
  },
}));

import { VersionRepository } from "../../../repositories/VersionRepository.js";
import type { INoteVersionRecord } from "../../../repositories/VersionRepository.js";
import { NoteRepository } from "../../../repositories/NoteRepository.js";
import { VersionService } from "../../../services/VersionService.js";
import { ErrorCode } from "@noteapp/shared";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date("2026-06-15T10:00:00.000Z");
const earlier = new Date("2026-06-14T09:00:00.000Z");
const earliest = new Date("2026-06-13T08:00:00.000Z");

function makeNoteRecord(overrides: Partial<{
  id: string;
  userId: string;
  title: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Array<{
    id: string;
    userId: string;
    name: string;
    color: string | null;
    noteCount: number;
    createdAt: Date;
  }>;
}> = {}) {
  return {
    id: "note-uuid-1",
    userId: "user-uuid-1",
    title: "My Note",
    content: "Hello world",
    deletedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
    tags: [] as Array<{
      id: string;
      userId: string;
      name: string;
      color: string | null;
      noteCount: number;
      createdAt: Date;
    }>,
    ...overrides,
  };
}

function makeVersionRecord(overrides: Partial<INoteVersionRecord> = {}): INoteVersionRecord {
  return {
    id: "version-uuid-1",
    noteId: "note-uuid-1",
    version: 1,
    title: "My Note",
    content: "Hello world",
    createdAt: now,
    ...overrides,
  };
}

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// VersionService.listVersions
// ---------------------------------------------------------------------------

describe("VersionService.listVersions", () => {
  it("AC-S3: List versions — happy path returns array sorted newest-first with all fields", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(makeNoteRecord());
    const records: INoteVersionRecord[] = [
      makeVersionRecord({ id: "v3", version: 3, createdAt: now }),
      makeVersionRecord({ id: "v2", version: 2, content: "Earlier content", createdAt: earlier }),
      makeVersionRecord({ id: "v1", version: 1, content: "Original content", createdAt: earliest }),
    ];
    vi.mocked(VersionRepository.findAllByNoteId).mockResolvedValue(records);

    const result = await VersionService.listVersions("note-uuid-1", "user-uuid-1");

    expect(result).toHaveLength(3);
    // Sorted newest-first: version 3, 2, 1
    expect(result[0].version).toBe(3);
    expect(result[1].version).toBe(2);
    expect(result[2].version).toBe(1);
    // Each item has required fields as ISO string
    expect(result[0]).toMatchObject({
      id: "v3",
      noteId: "note-uuid-1",
      version: 3,
      title: "My Note",
      content: "Hello world",
      createdAt: now.toISOString(),
    });
    expect(NoteRepository.findByIdAndUserIdIncludeDeleted).toHaveBeenCalledWith("note-uuid-1", "user-uuid-1");
    expect(VersionRepository.findAllByNoteId).toHaveBeenCalledWith("note-uuid-1");
  });

  it("AC-S4: List versions — single entry returns array with exactly one version", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(makeNoteRecord());
    vi.mocked(VersionRepository.findAllByNoteId).mockResolvedValue([
      makeVersionRecord({ id: "v1", version: 1 }),
    ]);

    const result = await VersionService.listVersions("note-uuid-1", "user-uuid-1");

    expect(result).toHaveLength(1);
    expect(result[0].version).toBe(1);
    expect(result[0].id).toBe("v1");
  });

  it("AC-S5: List versions — soft-deleted note uses findByIdAndUserIdIncludeDeleted (not findByIdAndUserId)", async () => {
    const softDeletedNote = makeNoteRecord({ deletedAt: new Date("2026-06-14T00:00:00.000Z") });
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(softDeletedNote);
    vi.mocked(VersionRepository.findAllByNoteId).mockResolvedValue([
      makeVersionRecord({ id: "v1", version: 1 }),
    ]);

    const result = await VersionService.listVersions("note-uuid-1", "user-uuid-1");

    expect(result).toHaveLength(1);
    // Must use findByIdAndUserIdIncludeDeleted, never findByIdAndUserId
    expect(NoteRepository.findByIdAndUserIdIncludeDeleted).toHaveBeenCalledWith("note-uuid-1", "user-uuid-1");
    expect(NoteRepository.findByIdAndUserId).not.toHaveBeenCalled();
  });

  it("AC-S6: List versions — note not found throws NOTE_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(null);

    await expect(
      VersionService.listVersions("nonexistent-note", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(VersionRepository.findAllByNoteId).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// VersionService.getVersion
// ---------------------------------------------------------------------------

describe("VersionService.getVersion", () => {
  it("AC-S8: View single version — happy path returns version object with all fields", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(makeNoteRecord());
    const record = makeVersionRecord({ id: "v2", version: 2, content: "Earlier content", createdAt: earlier });
    vi.mocked(VersionRepository.findByIdAndNoteId).mockResolvedValue(record);

    const result = await VersionService.getVersion("note-uuid-1", "v2", "user-uuid-1");

    expect(result).toMatchObject({
      id: "v2",
      noteId: "note-uuid-1",
      version: 2,
      title: "My Note",
      content: "Earlier content",
      createdAt: earlier.toISOString(),
    });
    expect(VersionRepository.findByIdAndNoteId).toHaveBeenCalledWith("v2", "note-uuid-1");
  });

  it("AC-S9: View single version — version not found on note throws VERSION_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(makeNoteRecord());
    vi.mocked(VersionRepository.findByIdAndNoteId).mockResolvedValue(null);

    await expect(
      VersionService.getVersion("note-uuid-1", "nonexistent-version-id", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.VERSION_NOT_FOUND });
  });

  it("AC-S10: View single version — cross-note access throws VERSION_NOT_FOUND (noteId filter rejects)", async () => {
    // User owns both noteA and noteB; version belongs to noteB, but request uses noteA's id
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(
      makeNoteRecord({ id: "note-A" })
    );
    // findByIdAndNoteId returns null because noteId filter ("note-A") doesn't match the version's noteId ("note-B")
    vi.mocked(VersionRepository.findByIdAndNoteId).mockResolvedValue(null);

    await expect(
      VersionService.getVersion("note-A", "version-from-note-B", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.VERSION_NOT_FOUND });

    expect(VersionRepository.findByIdAndNoteId).toHaveBeenCalledWith("version-from-note-B", "note-A");
  });

  it("AC-S11: View single version — note not found throws NOTE_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(null);

    await expect(
      VersionService.getVersion("nonexistent-note", "version-uuid-1", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(VersionRepository.findByIdAndNoteId).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// VersionService.restoreVersion
// ---------------------------------------------------------------------------

describe("VersionService.restoreVersion", () => {
  it("AC-S13: Restore version — happy path calls NoteRepository.restore and snapshots; returns INoteResponse", async () => {
    const activeNote = makeNoteRecord({ id: "note-uuid-1", deletedAt: null });
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(activeNote);

    const targetVersion = makeVersionRecord({
      id: "v1",
      version: 1,
      title: "Original Title",
      content: "Original content",
    });
    vi.mocked(VersionRepository.findByIdAndNoteId).mockResolvedValue(targetVersion);

    const restoredNote = makeNoteRecord({
      title: "Original Title",
      content: "Original content",
      deletedAt: null,
      updatedAt: new Date("2026-06-15T11:00:00.000Z"),
    });
    vi.mocked(NoteRepository.restore).mockResolvedValue(restoredNote);
    // snapshot internals
    vi.mocked(VersionRepository.getMaxVersion).mockResolvedValue(2);
    vi.mocked(VersionRepository.create).mockResolvedValue(
      makeVersionRecord({ id: "v3", version: 3, title: "Original Title", content: "Original content" })
    );

    const result = await VersionService.restoreVersion("note-uuid-1", "v1", "user-uuid-1");

    expect(NoteRepository.restore).toHaveBeenCalledWith("note-uuid-1", {
      title: "Original Title",
      content: "Original content",
    });
    expect(result.title).toBe("Original Title");
    expect(result.content).toBe("Original content");
    expect(result.id).toBe("note-uuid-1");
    // tags array present (INoteResponse shape)
    expect(result.tags).toBeInstanceOf(Array);
  });

  it("AC-S14: Restore version — history is immutable; no version records deleted", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(makeNoteRecord());
    const targetVersion = makeVersionRecord({ id: "v1", version: 1 });
    vi.mocked(VersionRepository.findByIdAndNoteId).mockResolvedValue(targetVersion);
    vi.mocked(NoteRepository.restore).mockResolvedValue(makeNoteRecord());
    vi.mocked(VersionRepository.getMaxVersion).mockResolvedValue(1);
    vi.mocked(VersionRepository.create).mockResolvedValue(makeVersionRecord({ id: "v2", version: 2 }));

    await VersionService.restoreVersion("note-uuid-1", "v1", "user-uuid-1");

    // findByIdAndNoteId called once to look up target version — not called to delete anything
    expect(VersionRepository.findByIdAndNoteId).toHaveBeenCalledTimes(1);
    // create called once (snapshot) — no delete operations
    expect(VersionRepository.create).toHaveBeenCalledTimes(1);
  });

  it("AC-S15: Restore version — un-deletes soft-deleted note; returned note has deletedAt null", async () => {
    const softDeletedNote = makeNoteRecord({ deletedAt: new Date("2026-06-14T00:00:00.000Z") });
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(softDeletedNote);

    const targetVersion = makeVersionRecord({ id: "v1", version: 1 });
    vi.mocked(VersionRepository.findByIdAndNoteId).mockResolvedValue(targetVersion);

    // NoteRepository.restore sets deletedAt: null
    const reactivatedNote = makeNoteRecord({ deletedAt: null });
    vi.mocked(NoteRepository.restore).mockResolvedValue(reactivatedNote);
    vi.mocked(VersionRepository.getMaxVersion).mockResolvedValue(1);
    vi.mocked(VersionRepository.create).mockResolvedValue(makeVersionRecord({ id: "v2", version: 2 }));

    const result = await VersionService.restoreVersion("note-uuid-1", "v1", "user-uuid-1");

    expect(NoteRepository.restore).toHaveBeenCalledWith("note-uuid-1", {
      title: "My Note",
      content: "Hello world",
    });
    expect(result.deletedAt).toBeNull();
  });

  it("AC-S16: Restore version — note not found throws NOTE_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(null);

    await expect(
      VersionService.restoreVersion("nonexistent-note", "v1", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(NoteRepository.restore).not.toHaveBeenCalled();
  });

  it("AC-S17: Restore version — version not found throws VERSION_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserIdIncludeDeleted).mockResolvedValue(makeNoteRecord());
    vi.mocked(VersionRepository.findByIdAndNoteId).mockResolvedValue(null);

    await expect(
      VersionService.restoreVersion("note-uuid-1", "nonexistent-version", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.VERSION_NOT_FOUND });

    expect(NoteRepository.restore).not.toHaveBeenCalled();
  });
});
