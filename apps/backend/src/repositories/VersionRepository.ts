import { prisma } from "../lib/prisma.js";

interface INoteVersionRecord {
  id: string;
  noteId: string;
  version: number;
  title: string;
  content: string;
  createdAt: Date;
}

function mapRecord(v: {
  id: string;
  noteId: string;
  version: number;
  title: string;
  content: string;
  createdAt: Date;
}): INoteVersionRecord {
  return {
    id: v.id,
    noteId: v.noteId,
    version: v.version,
    title: v.title,
    content: v.content,
    createdAt: v.createdAt,
  };
}

export const VersionRepository = {
  async getMaxVersion(noteId: string): Promise<number> {
    const result = await prisma.noteVersion.aggregate({
      where: { noteId },
      _max: { version: true },
    });
    return result._max.version ?? 0;
  },

  async create(data: {
    noteId: string;
    version: number;
    title: string;
    content: string;
  }): Promise<INoteVersionRecord> {
    const row = await prisma.noteVersion.create({ data });
    return mapRecord(row);
  },

  async findAllByNoteId(noteId: string): Promise<INoteVersionRecord[]> {
    const rows = await prisma.noteVersion.findMany({
      where: { noteId },
      orderBy: { version: "desc" },
    });
    return rows.map(mapRecord);
  },

  async findByIdAndNoteId(
    id: string,
    noteId: string
  ): Promise<INoteVersionRecord | null> {
    const row = await prisma.noteVersion.findFirst({ where: { id, noteId } });
    return row ? mapRecord(row) : null;
  },

  async purgeOldVersions(maxPerNote: number, retentionDays: number): Promise<void> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    const distinctNotes = await prisma.noteVersion.findMany({
      select: { noteId: true },
      distinct: ["noteId"],
    });

    for (const { noteId } of distinctNotes) {
      const keepRows = await prisma.noteVersion.findMany({
        where: { noteId },
        orderBy: { version: "desc" },
        take: maxPerNote,
        select: { id: true },
      });

      if (keepRows.length < maxPerNote) continue;

      const keepIds = keepRows.map((r) => r.id);

      await prisma.noteVersion.deleteMany({
        where: {
          noteId,
          id: { notIn: keepIds },
          createdAt: { lt: cutoffDate },
        },
      });
    }
  },
};

export type { INoteVersionRecord };
