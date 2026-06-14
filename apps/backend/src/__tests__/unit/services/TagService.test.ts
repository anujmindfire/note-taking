import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("../../../repositories/TagRepository.js", () => ({
  TagRepository: {
    findAllByUserId: vi.fn(),
    findByIdAndUserId: vi.fn(),
    findByNormalizedName: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    attachTagToNote: vi.fn(),
    detachTagFromNote: vi.fn(),
  },
}));

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

import { TagRepository } from "../../../repositories/TagRepository.js";
import { NoteRepository } from "../../../repositories/NoteRepository.js";
import { TagService } from "../../../services/TagService.js";
import { ErrorCode } from "@noteapp/shared";
import type { ITagRecord } from "../../../repositories/TagRepository.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date("2024-06-01T10:00:00.000Z");

function makeTagRecord(overrides: Partial<ITagRecord> = {}): ITagRecord {
  return {
    id: "tag-uuid-1",
    userId: "user-uuid-1",
    name: "Work",
    normalizedName: "work",
    color: null,
    noteCount: 0,
    createdAt: now,
    ...overrides,
  };
}

function makeNoteRecord(overrides: Partial<{
  id: string;
  userId: string;
  title: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Array<{ id: string; userId: string; name: string; color: string | null; noteCount: number; createdAt: Date }>;
}> = {}) {
  return {
    id: "note-uuid-1",
    userId: "user-uuid-1",
    title: "My Note",
    content: "Hello world",
    deletedAt: null as Date | null,
    createdAt: now,
    updatedAt: now,
    tags: [] as Array<{ id: string; userId: string; name: string; color: string | null; noteCount: number; createdAt: Date }>,
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
// TagService.listTags
// ---------------------------------------------------------------------------

describe("TagService.listTags", () => {
  it("AC-T1: list tags — default sort returns tags ordered by name asc", async () => {
    const tags: ITagRecord[] = [
      makeTagRecord({ id: "tag-b", name: "Zebra", normalizedName: "zebra", noteCount: 2 }),
      makeTagRecord({ id: "tag-a", name: "Apple", normalizedName: "apple", noteCount: 5 }),
    ];
    vi.mocked(TagRepository.findAllByUserId).mockResolvedValue(tags);

    const result = await TagService.listTags("user-uuid-1", { sortBy: "name", sortDir: "asc" });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Apple");
    expect(result[1].name).toBe("Zebra");
    expect(TagRepository.findAllByUserId).toHaveBeenCalledWith("user-uuid-1");
  });

  it("AC-T3: list tags — sort by noteCount desc returns highest count first", async () => {
    const tags: ITagRecord[] = [
      makeTagRecord({ id: "tag-1", name: "Low", normalizedName: "low", noteCount: 1 }),
      makeTagRecord({ id: "tag-2", name: "High", normalizedName: "high", noteCount: 10 }),
      makeTagRecord({ id: "tag-3", name: "Mid", normalizedName: "mid", noteCount: 5 }),
    ];
    vi.mocked(TagRepository.findAllByUserId).mockResolvedValue(tags);

    const result = await TagService.listTags("user-uuid-1", { sortBy: "noteCount", sortDir: "desc" });

    expect(result[0].name).toBe("High");
    expect(result[1].name).toBe("Mid");
    expect(result[2].name).toBe("Low");
  });

  it("AC-T4: list tags — sort by name desc returns tags Z→A", async () => {
    const tags: ITagRecord[] = [
      makeTagRecord({ id: "tag-a", name: "Apple", normalizedName: "apple" }),
      makeTagRecord({ id: "tag-b", name: "Zebra", normalizedName: "zebra" }),
    ];
    vi.mocked(TagRepository.findAllByUserId).mockResolvedValue(tags);

    const result = await TagService.listTags("user-uuid-1", { sortBy: "name", sortDir: "desc" });

    expect(result[0].name).toBe("Zebra");
    expect(result[1].name).toBe("Apple");
  });

  it("AC-T7: list tags — noteCount excludes soft-deleted notes (repo returns noteCount=1)", async () => {
    // The repository already filters deletedAt: null when counting noteTags.
    // The service receives the pre-computed noteCount from the repository.
    const tags: ITagRecord[] = [
      makeTagRecord({ id: "tag-1", name: "Work", normalizedName: "work", noteCount: 1 }),
    ];
    vi.mocked(TagRepository.findAllByUserId).mockResolvedValue(tags);

    const result = await TagService.listTags("user-uuid-1", { sortBy: "name", sortDir: "asc" });

    expect(result).toHaveLength(1);
    expect(result[0].noteCount).toBe(1);
  });

  it("AC-T8: list tags — cross-user isolation (mock returns only this user's tags)", async () => {
    const userATags: ITagRecord[] = [
      makeTagRecord({ id: "tag-a1", userId: "user-uuid-1", name: "User A Tag", normalizedName: "user a tag" }),
    ];
    vi.mocked(TagRepository.findAllByUserId).mockResolvedValue(userATags);

    const result = await TagService.listTags("user-uuid-1", { sortBy: "name", sortDir: "asc" });

    expect(result).toHaveLength(1);
    expect(result[0].userId).toBe("user-uuid-1");
    expect(TagRepository.findAllByUserId).toHaveBeenCalledWith("user-uuid-1");
    // Confirm that user B's tags would not appear (called with user A's ID only)
    expect(TagRepository.findAllByUserId).not.toHaveBeenCalledWith("user-uuid-2");
  });
});

// ---------------------------------------------------------------------------
// TagService.createTag
// ---------------------------------------------------------------------------

describe("TagService.createTag", () => {
  it("AC-T12: duplicate name (exact) → throws TAG_NAME_TAKEN", async () => {
    vi.mocked(TagRepository.findByNormalizedName).mockResolvedValue(makeTagRecord());

    await expect(
      TagService.createTag("user-uuid-1", { name: "Work" })
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NAME_TAKEN });

    expect(TagRepository.create).not.toHaveBeenCalled();
  });

  it("AC-T13: duplicate name (case-insensitive) → throws TAG_NAME_TAKEN", async () => {
    // "work" already exists; creating "WORK" should be rejected
    vi.mocked(TagRepository.findByNormalizedName).mockResolvedValue(
      makeTagRecord({ normalizedName: "work" })
    );

    await expect(
      TagService.createTag("user-uuid-1", { name: "WORK" })
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NAME_TAKEN });

    expect(TagRepository.create).not.toHaveBeenCalled();
  });

  it("AC-T14: same name as another user — allowed, creates tag successfully", async () => {
    // No existing tag found for this user → null
    vi.mocked(TagRepository.findByNormalizedName).mockResolvedValue(null);
    const created = makeTagRecord({ userId: "user-uuid-2", name: "work", noteCount: 0 });
    vi.mocked(TagRepository.create).mockResolvedValue(created);

    const result = await TagService.createTag("user-uuid-2", { name: "work" });

    expect(result.name).toBe("work");
    expect(TagRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-uuid-2", normalizedName: "work" })
    );
  });
});

// ---------------------------------------------------------------------------
// TagService.updateTag
// ---------------------------------------------------------------------------

describe("TagService.updateTag", () => {
  it("AC-T24: rename — duplicate name (case-insensitive) → throws TAG_NAME_TAKEN", async () => {
    const ideasTag = makeTagRecord({ id: "tag-ideas", name: "Ideas", normalizedName: "ideas" });
    const workTag = makeTagRecord({ id: "tag-work", name: "Work", normalizedName: "work" });

    // findByIdAndUserId returns the "Ideas" tag (the one being updated)
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(ideasTag);
    // findByNormalizedName returns existing "work" tag (conflict)
    vi.mocked(TagRepository.findByNormalizedName).mockResolvedValue(workTag);

    await expect(
      TagService.updateTag("tag-ideas", "user-uuid-1", { name: "work" })
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NAME_TAKEN });

    expect(TagRepository.update).not.toHaveBeenCalled();
  });

  it("AC-T25: rename — same name as self → no conflict check, returns 200", async () => {
    const workTag = makeTagRecord({ id: "tag-work", name: "Work", normalizedName: "work" });
    // The service skips the uniqueness conflict check when normalizedName matches self,
    // but still calls update with the name payload (it is not a pure no-op at the DB level).
    const updatedTag = makeTagRecord({ id: "tag-work", name: "work", normalizedName: "work" });

    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(workTag);
    vi.mocked(TagRepository.update).mockResolvedValue(updatedTag);

    const result = await TagService.updateTag("tag-work", "user-uuid-1", { name: "work" });

    // No TAG_NAME_TAKEN error must be thrown
    expect(result).toBeDefined();
    // findByNormalizedName must NOT be called — self-collision skips conflict lookup
    expect(TagRepository.findByNormalizedName).not.toHaveBeenCalled();
    // update IS called because the payload is non-empty
    expect(TagRepository.update).toHaveBeenCalledWith(
      "tag-work",
      expect.objectContaining({ normalizedName: "work" })
    );
  });

  it("AC-T26: update tag — not found → throws TAG_NOT_FOUND", async () => {
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.updateTag("nonexistent-tag-id", "user-uuid-1", { name: "New Name" })
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NOT_FOUND });

    expect(TagRepository.update).not.toHaveBeenCalled();
  });

  it("AC-T27: update tag — other user's tag → throws TAG_NOT_FOUND", async () => {
    // Repository returns null when the tag doesn't belong to this user
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.updateTag("tag-uuid-1", "other-user-uuid", { name: "Hijacked" })
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NOT_FOUND });

    expect(TagRepository.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TagService.deleteTag
// ---------------------------------------------------------------------------

describe("TagService.deleteTag", () => {
  it("AC-T29: delete tag — happy path calls TagRepository.delete with correct id", async () => {
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(makeTagRecord());
    vi.mocked(TagRepository.delete).mockResolvedValue(undefined);

    await expect(TagService.deleteTag("tag-uuid-1", "user-uuid-1")).resolves.toBeUndefined();

    expect(TagRepository.findByIdAndUserId).toHaveBeenCalledWith("tag-uuid-1", "user-uuid-1");
    expect(TagRepository.delete).toHaveBeenCalledWith("tag-uuid-1");
  });

  it("AC-T30: delete tag — not found → throws TAG_NOT_FOUND", async () => {
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.deleteTag("nonexistent-tag-id", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NOT_FOUND });

    expect(TagRepository.delete).not.toHaveBeenCalled();
  });

  it("AC-T31: delete tag — other user's tag → throws TAG_NOT_FOUND", async () => {
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.deleteTag("tag-uuid-1", "other-user-uuid")
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NOT_FOUND });

    expect(TagRepository.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TagService.attachTag
// ---------------------------------------------------------------------------

describe("TagService.attachTag", () => {
  it("AC-T33: attach tag — happy path calls attachTagToNote and re-fetches note", async () => {
    const noteRecord = makeNoteRecord({ tags: [] });
    const tagRecord = makeTagRecord({ noteCount: 1 });
    const updatedNoteRecord = makeNoteRecord({
      tags: [{ id: tagRecord.id, userId: tagRecord.userId, name: tagRecord.name, color: tagRecord.color, noteCount: tagRecord.noteCount, createdAt: tagRecord.createdAt }],
    });

    vi.mocked(NoteRepository.findByIdAndUserId)
      .mockResolvedValueOnce(noteRecord)   // first call: ownership check
      .mockResolvedValueOnce(updatedNoteRecord); // second call: re-fetch after attach
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(tagRecord);
    vi.mocked(TagRepository.attachTagToNote).mockResolvedValue(undefined);

    const result = await TagService.attachTag("note-uuid-1", "tag-uuid-1", "user-uuid-1");

    expect(TagRepository.attachTagToNote).toHaveBeenCalledWith("note-uuid-1", "tag-uuid-1");
    expect(NoteRepository.findByIdAndUserId).toHaveBeenCalledTimes(2);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0].id).toBe("tag-uuid-1");
  });

  it("AC-T34: attach tag — idempotent (attachTagToNote called regardless of prior state)", async () => {
    const tagRecord = makeTagRecord({ noteCount: 1 });
    const noteWithTag = makeNoteRecord({
      tags: [{ id: tagRecord.id, userId: tagRecord.userId, name: tagRecord.name, color: tagRecord.color, noteCount: tagRecord.noteCount, createdAt: tagRecord.createdAt }],
    });

    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(noteWithTag);
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(tagRecord);
    vi.mocked(TagRepository.attachTagToNote).mockResolvedValue(undefined);

    const result = await TagService.attachTag("note-uuid-1", "tag-uuid-1", "user-uuid-1");

    // attachTagToNote is always called — the repository uses upsert under the hood
    expect(TagRepository.attachTagToNote).toHaveBeenCalledWith("note-uuid-1", "tag-uuid-1");
    expect(result.tags).toHaveLength(1);
  });

  it("AC-T35: attach tag — note not found → throws NOTE_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.attachTag("nonexistent-note-id", "tag-uuid-1", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(TagRepository.findByIdAndUserId).not.toHaveBeenCalled();
    expect(TagRepository.attachTagToNote).not.toHaveBeenCalled();
  });

  it("AC-T37: attach tag — tag not found → throws TAG_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.attachTag("note-uuid-1", "nonexistent-tag-id", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NOT_FOUND });

    expect(TagRepository.attachTagToNote).not.toHaveBeenCalled();
  });

  it("AC-T38: attach tag — both not found → throws NOTE_NOT_FOUND (note checked first)", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.attachTag("nonexistent-note-id", "nonexistent-tag-id", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    // Tag lookup must never be called when note lookup fails first
    expect(TagRepository.findByIdAndUserId).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// TagService.detachTag
// ---------------------------------------------------------------------------

describe("TagService.detachTag", () => {
  it("AC-T42: detach tag — happy path calls detachTagFromNote and re-fetches note", async () => {
    const tagRecord = makeTagRecord({ noteCount: 0 });
    const noteWithTag = makeNoteRecord({
      tags: [{ id: tagRecord.id, userId: tagRecord.userId, name: tagRecord.name, color: tagRecord.color, noteCount: tagRecord.noteCount, createdAt: tagRecord.createdAt }],
    });
    const noteWithoutTag = makeNoteRecord({ tags: [] });

    vi.mocked(NoteRepository.findByIdAndUserId)
      .mockResolvedValueOnce(noteWithTag)    // first call: ownership check
      .mockResolvedValueOnce(noteWithoutTag); // second call: re-fetch after detach
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(tagRecord);
    vi.mocked(TagRepository.detachTagFromNote).mockResolvedValue(undefined);

    const result = await TagService.detachTag("note-uuid-1", "tag-uuid-1", "user-uuid-1");

    expect(TagRepository.detachTagFromNote).toHaveBeenCalledWith("note-uuid-1", "tag-uuid-1");
    expect(NoteRepository.findByIdAndUserId).toHaveBeenCalledTimes(2);
    expect(result.tags).toHaveLength(0);
  });

  it("AC-T43: detach tag — idempotent (detachTagFromNote called regardless)", async () => {
    const tagRecord = makeTagRecord({ noteCount: 0 });
    const noteWithoutTag = makeNoteRecord({ tags: [] });

    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(noteWithoutTag);
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(tagRecord);
    vi.mocked(TagRepository.detachTagFromNote).mockResolvedValue(undefined);

    const result = await TagService.detachTag("note-uuid-1", "tag-uuid-1", "user-uuid-1");

    // detachTagFromNote is always called — repository uses deleteMany which is safe if not attached
    expect(TagRepository.detachTagFromNote).toHaveBeenCalledWith("note-uuid-1", "tag-uuid-1");
    expect(result.tags).toHaveLength(0);
  });

  it("AC-T44: detach tag — note not found → throws NOTE_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.detachTag("nonexistent-note-id", "tag-uuid-1", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(TagRepository.findByIdAndUserId).not.toHaveBeenCalled();
    expect(TagRepository.detachTagFromNote).not.toHaveBeenCalled();
  });

  it("AC-T46: detach tag — tag not found → throws TAG_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    vi.mocked(TagRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      TagService.detachTag("note-uuid-1", "nonexistent-tag-id", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.TAG_NOT_FOUND });

    expect(TagRepository.detachTagFromNote).not.toHaveBeenCalled();
  });
});
