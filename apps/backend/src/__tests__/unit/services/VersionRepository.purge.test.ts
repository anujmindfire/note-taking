import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../lib/prisma.js", () => ({
  prisma: {
    noteVersion: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "../../../lib/prisma.js";
import { VersionRepository } from "../../../repositories/VersionRepository.js";

const mockPrismaVersion = vi.mocked(prisma.noteVersion);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// VersionRepository.purgeOldVersions — auto-purge scenarios (AB-1009)
// ---------------------------------------------------------------------------

describe("VersionRepository.purgeOldVersions", () => {
  it("AC-S19: Auto-purge — removes excess old versions; note has 55 versions, 5 oldest exceed both count and retention window", async () => {
    const maxPerNote = 50;
    const retentionDays = 90;

    // distinct noteIds
    mockPrismaVersion.findMany.mockResolvedValueOnce(
      [{ noteId: "note-uuid-1" }] as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    // top-50 keepRows (the most recent 50)
    const keepRows = Array.from({ length: 50 }, (_, i) => ({ id: `keep-${i}` }));
    mockPrismaVersion.findMany.mockResolvedValueOnce(
      keepRows as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    mockPrismaVersion.deleteMany.mockResolvedValue({ count: 5 });

    await VersionRepository.purgeOldVersions(maxPerNote, retentionDays);

    expect(mockPrismaVersion.deleteMany).toHaveBeenCalledTimes(1);
    const deleteCall = mockPrismaVersion.deleteMany.mock.calls[0]?.[0];
    expect(deleteCall).toMatchObject({
      where: {
        noteId: "note-uuid-1",
        id: { notIn: keepRows.map((r) => r.id) },
        createdAt: { lt: expect.any(Date) },
      },
    });
    // The cutoff date must be roughly 90 days in the past
    const cutoff = (deleteCall?.where?.createdAt as { lt: Date }).lt;
    const expectedCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    expect(Math.abs(cutoff.getTime() - expectedCutoff.getTime())).toBeLessThan(5000);
  });

  it("AC-S20: Auto-purge — preserves latest version when note has exactly 1 version; deleteMany NOT called", async () => {
    const maxPerNote = 50;
    const retentionDays = 90;

    mockPrismaVersion.findMany.mockResolvedValueOnce(
      [{ noteId: "note-uuid-1" }] as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    // Only 1 version exists — keepRows.length (1) < maxPerNote (50) → continue
    mockPrismaVersion.findMany.mockResolvedValueOnce(
      [{ id: "only-version" }] as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    await VersionRepository.purgeOldVersions(maxPerNote, retentionDays);

    expect(mockPrismaVersion.deleteMany).not.toHaveBeenCalled();
  });

  it("AC-S21: Auto-purge — 60 versions all within retention window; deleteMany called but createdAt filter prevents actual deletion", async () => {
    const maxPerNote = 50;
    const retentionDays = 90;

    mockPrismaVersion.findMany.mockResolvedValueOnce(
      [{ noteId: "note-uuid-1" }] as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    // 50 keepRows returned (maxPerNote exactly) — rank condition IS met so continue is NOT hit
    const keepRows = Array.from({ length: 50 }, (_, i) => ({ id: `keep-${i}` }));
    mockPrismaVersion.findMany.mockResolvedValueOnce(
      keepRows as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    mockPrismaVersion.deleteMany.mockResolvedValue({ count: 0 });

    await VersionRepository.purgeOldVersions(maxPerNote, retentionDays);

    // deleteMany IS called (keepRows.length === maxPerNote so continue is not hit)
    expect(mockPrismaVersion.deleteMany).toHaveBeenCalledTimes(1);
    const deleteCall = mockPrismaVersion.deleteMany.mock.calls[0]?.[0];
    // The notIn list contains all 50 keep IDs
    expect(deleteCall?.where?.id).toMatchObject({ notIn: keepRows.map((r) => r.id) });
    // createdAt filter is a date in the past (90 days ago); fresh versions won't match it
    const cutoff = (deleteCall?.where?.createdAt as { lt: Date }).lt;
    expect(cutoff).toBeInstanceOf(Date);
    expect(cutoff.getTime()).toBeLessThan(Date.now());
  });

  it("AC-S22: Auto-purge — note has 10 versions (below maxPerNote=50); deleteMany NOT called", async () => {
    const maxPerNote = 50;
    const retentionDays = 90;

    mockPrismaVersion.findMany.mockResolvedValueOnce(
      [{ noteId: "note-uuid-1" }] as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    // 10 keepRows — keepRows.length (10) < maxPerNote (50) → continue
    const keepRows = Array.from({ length: 10 }, (_, i) => ({ id: `keep-${i}` }));
    mockPrismaVersion.findMany.mockResolvedValueOnce(
      keepRows as unknown as Awaited<ReturnType<typeof prisma.noteVersion.findMany>>
    );

    await VersionRepository.purgeOldVersions(maxPerNote, retentionDays);

    expect(mockPrismaVersion.deleteMany).not.toHaveBeenCalled();
  });
});
