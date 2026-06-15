import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

vi.mock("../../../repositories/ShareLinkRepository.js", () => ({
  ShareLinkRepository: {
    create: vi.fn(),
    findAllByNoteId: vi.fn(),
    findByIdForOwner: vi.fn(),
    findByToken: vi.fn(),
    revoke: vi.fn(),
    incrementViewCount: vi.fn(),
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

import { ShareLinkRepository } from "../../../repositories/ShareLinkRepository.js";
import type { IShareLinkRecord, IShareLinkWithNote } from "../../../repositories/ShareLinkRepository.js";
import { NoteRepository } from "../../../repositories/NoteRepository.js";
import { ShareLinkService } from "../../../services/ShareLinkService.js";
import { ErrorCode } from "@noteapp/shared";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const now = new Date("2024-06-15T10:00:00.000Z");
const future = new Date("2025-01-01T00:00:00.000Z");
const past = new Date("2023-01-01T00:00:00.000Z");

function makeShareLinkRecord(overrides: Partial<IShareLinkRecord> = {}): IShareLinkRecord {
  return {
    id: "share-uuid-1",
    noteId: "note-uuid-1",
    token: "a".repeat(64),
    expiresAt: null,
    revokedAt: null,
    viewCount: 0,
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
    content: "Some content",
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

function makeShareLinkWithNote(
  linkOverrides: Partial<IShareLinkRecord> = {},
  noteOverrides: Partial<ReturnType<typeof makeNoteRecord>> = {}
): IShareLinkWithNote {
  const baseLink = makeShareLinkRecord(linkOverrides);
  const baseNote = makeNoteRecord(noteOverrides);
  return {
    ...baseLink,
    note: baseNote,
  };
}

beforeAll(() => {
  process.env["JWT_SECRET"] = "test_secret_for_tests";
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ShareLinkService.generateLink
// ---------------------------------------------------------------------------

describe("ShareLinkService.generateLink", () => {
  it("AC-S1: generate link — no expiry returns link with null expiresAt and 64-char hex token", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    const createdLink = makeShareLinkRecord({ expiresAt: null });
    vi.mocked(ShareLinkRepository.create).mockResolvedValue(createdLink);

    const result = await ShareLinkService.generateLink("note-uuid-1", "user-uuid-1", {});

    expect(result.expiresAt).toBeNull();
    expect(result.revokedAt).toBeNull();
    expect(result.viewCount).toBe(0);
    expect(result.noteId).toBe("note-uuid-1");
    expect(NoteRepository.findByIdAndUserId).toHaveBeenCalledWith("note-uuid-1", "user-uuid-1");
    expect(ShareLinkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: "note-uuid-1", expiresAt: null })
    );
  });

  it("AC-S2: generate link — valid future expiresAt returns link with expiresAt set", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    const expiresAtISO = "2025-01-01T00:00:00.000Z";
    const createdLink = makeShareLinkRecord({ expiresAt: future });
    vi.mocked(ShareLinkRepository.create).mockResolvedValue(createdLink);

    const result = await ShareLinkService.generateLink("note-uuid-1", "user-uuid-1", {
      expiresAt: expiresAtISO,
    });

    expect(result.expiresAt).toBe("2025-01-01T00:00:00.000Z");
    expect(ShareLinkRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        noteId: "note-uuid-1",
        expiresAt: new Date(expiresAtISO),
      })
    );
  });

  it("AC-S3: generate link — multiple links on same note creates independent second link", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    const firstLink = makeShareLinkRecord({ id: "share-uuid-1", token: "a".repeat(64) });
    const secondLink = makeShareLinkRecord({ id: "share-uuid-2", token: "b".repeat(64) });
    vi.mocked(ShareLinkRepository.create)
      .mockResolvedValueOnce(firstLink)
      .mockResolvedValueOnce(secondLink);

    const result1 = await ShareLinkService.generateLink("note-uuid-1", "user-uuid-1", {});
    const result2 = await ShareLinkService.generateLink("note-uuid-1", "user-uuid-1", {});

    expect(result1.id).toBe("share-uuid-1");
    expect(result2.id).toBe("share-uuid-2");
    expect(ShareLinkRepository.create).toHaveBeenCalledTimes(2);
  });

  it("AC-S6: generate link — note not found throws NOTE_NOT_FOUND", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      ShareLinkService.generateLink("nonexistent-note-id", "user-uuid-1", {})
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(ShareLinkRepository.create).not.toHaveBeenCalled();
  });

  it("AC-S7: generate link — note belongs to other user throws NOTE_NOT_FOUND", async () => {
    // Repository returns null when note belongs to a different user
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      ShareLinkService.generateLink("note-uuid-1", "other-user-uuid", {})
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(ShareLinkRepository.create).not.toHaveBeenCalled();
  });

  it("AC-S8: generate link — note is soft-deleted throws NOTE_NOT_FOUND", async () => {
    // Repository filters out soft-deleted notes and returns null
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(null);

    await expect(
      ShareLinkService.generateLink("soft-deleted-note-id", "user-uuid-1", {})
    ).rejects.toMatchObject({ code: ErrorCode.NOTE_NOT_FOUND });

    expect(ShareLinkRepository.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ShareLinkService.listLinks
// ---------------------------------------------------------------------------

describe("ShareLinkService.listLinks", () => {
  it("AC-S10: list links — note has links returns array of ISharedLinkResponse", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    const links = [
      makeShareLinkRecord({ id: "share-uuid-1" }),
      makeShareLinkRecord({ id: "share-uuid-2", viewCount: 5 }),
    ];
    vi.mocked(ShareLinkRepository.findAllByNoteId).mockResolvedValue(links);

    const result = await ShareLinkService.listLinks("note-uuid-1", "user-uuid-1");

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("share-uuid-1");
    expect(result[1].id).toBe("share-uuid-2");
    expect(result[1].viewCount).toBe(5);
    expect(ShareLinkRepository.findAllByNoteId).toHaveBeenCalledWith("note-uuid-1");
  });

  it("AC-S11: list links — no links exist returns empty array", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    vi.mocked(ShareLinkRepository.findAllByNoteId).mockResolvedValue([]);

    const result = await ShareLinkService.listLinks("note-uuid-1", "user-uuid-1");

    expect(result).toEqual([]);
  });

  it("AC-S12: list links — includes both revoked and active links", async () => {
    vi.mocked(NoteRepository.findByIdAndUserId).mockResolvedValue(makeNoteRecord());
    const activeLink = makeShareLinkRecord({ id: "share-active", revokedAt: null });
    const revokedLink = makeShareLinkRecord({ id: "share-revoked", revokedAt: now });
    vi.mocked(ShareLinkRepository.findAllByNoteId).mockResolvedValue([activeLink, revokedLink]);

    const result = await ShareLinkService.listLinks("note-uuid-1", "user-uuid-1");

    expect(result).toHaveLength(2);
    const active = result.find((l) => l.id === "share-active");
    const revoked = result.find((l) => l.id === "share-revoked");
    expect(active?.revokedAt).toBeNull();
    expect(revoked?.revokedAt).toBe(now.toISOString());
  });
});

// ---------------------------------------------------------------------------
// ShareLinkService.revokeLink
// ---------------------------------------------------------------------------

describe("ShareLinkService.revokeLink", () => {
  it("AC-S16: revoke link — happy path sets revokedAt and returns updated link", async () => {
    const activeLink = makeShareLinkRecord({ revokedAt: null });
    vi.mocked(ShareLinkRepository.findByIdForOwner).mockResolvedValue(activeLink);
    const revokedLink = makeShareLinkRecord({ revokedAt: now });
    vi.mocked(ShareLinkRepository.revoke).mockResolvedValue(revokedLink);

    const result = await ShareLinkService.revokeLink("share-uuid-1", "user-uuid-1");

    expect(ShareLinkRepository.revoke).toHaveBeenCalledWith("share-uuid-1");
    expect(result.revokedAt).toBe(now.toISOString());
  });

  it("AC-S17: revoke link — already revoked is idempotent and does NOT call ShareLinkRepository.revoke again", async () => {
    const alreadyRevokedLink = makeShareLinkRecord({ revokedAt: now });
    vi.mocked(ShareLinkRepository.findByIdForOwner).mockResolvedValue(alreadyRevokedLink);

    const result = await ShareLinkService.revokeLink("share-uuid-1", "user-uuid-1");

    // revoke must NOT be called — idempotent short-circuit
    expect(ShareLinkRepository.revoke).not.toHaveBeenCalled();
    // returns the existing link data unchanged
    expect(result.revokedAt).toBe(now.toISOString());
    expect(result.id).toBe("share-uuid-1");
  });

  it("AC-S19: revoke link — not found throws SHARE_NOT_FOUND", async () => {
    vi.mocked(ShareLinkRepository.findByIdForOwner).mockResolvedValue(null);

    await expect(
      ShareLinkService.revokeLink("nonexistent-share-id", "user-uuid-1")
    ).rejects.toMatchObject({ code: ErrorCode.SHARE_NOT_FOUND });

    expect(ShareLinkRepository.revoke).not.toHaveBeenCalled();
  });

  it("AC-S20: revoke link — belongs to other user's note throws SHARE_NOT_FOUND", async () => {
    // Repository returns null when ownership check fails
    vi.mocked(ShareLinkRepository.findByIdForOwner).mockResolvedValue(null);

    await expect(
      ShareLinkService.revokeLink("share-uuid-1", "other-user-uuid")
    ).rejects.toMatchObject({ code: ErrorCode.SHARE_NOT_FOUND });

    expect(ShareLinkRepository.revoke).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// ShareLinkService.accessPublicLink
// ---------------------------------------------------------------------------

describe("ShareLinkService.accessPublicLink", () => {
  it("AC-S22: public access — valid active link returns note response", async () => {
    const linkWithNote = makeShareLinkWithNote(
      { revokedAt: null, expiresAt: null },
      { deletedAt: null }
    );
    vi.mocked(ShareLinkRepository.findByToken).mockResolvedValue(linkWithNote);
    vi.mocked(ShareLinkRepository.incrementViewCount).mockResolvedValue(undefined);

    const result = await ShareLinkService.accessPublicLink("a".repeat(64));

    expect(result.id).toBe("note-uuid-1");
    expect(result.title).toBe("My Note");
    expect(result.tags).toBeInstanceOf(Array);
    expect(ShareLinkRepository.incrementViewCount).toHaveBeenCalledWith("share-uuid-1");
  });

  it("AC-S23: public access — viewCount increments — incrementViewCount called exactly once per access", async () => {
    const linkWithNote = makeShareLinkWithNote(
      { revokedAt: null, expiresAt: null },
      { deletedAt: null }
    );
    vi.mocked(ShareLinkRepository.findByToken).mockResolvedValue(linkWithNote);
    vi.mocked(ShareLinkRepository.incrementViewCount).mockResolvedValue(undefined);

    await ShareLinkService.accessPublicLink("a".repeat(64));

    expect(ShareLinkRepository.incrementViewCount).toHaveBeenCalledTimes(1);
    expect(ShareLinkRepository.incrementViewCount).toHaveBeenCalledWith("share-uuid-1");
  });

  it("AC-S24: public access — token not found throws SHARE_NOT_FOUND", async () => {
    vi.mocked(ShareLinkRepository.findByToken).mockResolvedValue(null);

    await expect(
      ShareLinkService.accessPublicLink("unknowntoken")
    ).rejects.toMatchObject({ code: ErrorCode.SHARE_NOT_FOUND });

    expect(ShareLinkRepository.incrementViewCount).not.toHaveBeenCalled();
  });

  it("AC-S25: public access — link revoked throws SHARE_REVOKED", async () => {
    const revokedLink = makeShareLinkWithNote(
      { revokedAt: now, expiresAt: null },
      { deletedAt: null }
    );
    vi.mocked(ShareLinkRepository.findByToken).mockResolvedValue(revokedLink);

    await expect(
      ShareLinkService.accessPublicLink("a".repeat(64))
    ).rejects.toMatchObject({ code: ErrorCode.SHARE_REVOKED });

    expect(ShareLinkRepository.incrementViewCount).not.toHaveBeenCalled();
  });

  it("AC-S26: public access — link expired throws SHARE_EXPIRED", async () => {
    const expiredLink = makeShareLinkWithNote(
      { revokedAt: null, expiresAt: past },
      { deletedAt: null }
    );
    vi.mocked(ShareLinkRepository.findByToken).mockResolvedValue(expiredLink);

    await expect(
      ShareLinkService.accessPublicLink("a".repeat(64))
    ).rejects.toMatchObject({ code: ErrorCode.SHARE_EXPIRED });

    expect(ShareLinkRepository.incrementViewCount).not.toHaveBeenCalled();
  });

  it("AC-S27: public access — note soft-deleted throws SHARE_EXPIRED", async () => {
    const linkWithDeletedNote = makeShareLinkWithNote(
      { revokedAt: null, expiresAt: null },
      { deletedAt: now }
    );
    vi.mocked(ShareLinkRepository.findByToken).mockResolvedValue(linkWithDeletedNote);

    await expect(
      ShareLinkService.accessPublicLink("a".repeat(64))
    ).rejects.toMatchObject({ code: ErrorCode.SHARE_EXPIRED });

    expect(ShareLinkRepository.incrementViewCount).not.toHaveBeenCalled();
  });

  it("AC-S29: public access — error precedence: revoked beats expired — both revokedAt and past expiresAt → throws SHARE_REVOKED", async () => {
    // Link has both revokedAt set AND expiresAt in the past
    const linkWithBoth = makeShareLinkWithNote(
      { revokedAt: now, expiresAt: past },
      { deletedAt: null }
    );
    vi.mocked(ShareLinkRepository.findByToken).mockResolvedValue(linkWithBoth);

    await expect(
      ShareLinkService.accessPublicLink("a".repeat(64))
    ).rejects.toMatchObject({ code: ErrorCode.SHARE_REVOKED });

    expect(ShareLinkRepository.incrementViewCount).not.toHaveBeenCalled();
  });
});
