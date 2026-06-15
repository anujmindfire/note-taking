import { prisma } from "../lib/prisma.js";

interface ITagRecord {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  color: string | null;
  noteCount: number;
  createdAt: Date;
}

const noteCountSelect = {
  _count: {
    select: {
      noteTags: { where: { note: { deletedAt: null } } },
    },
  },
} as const;

function mapRecord(tag: {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  color: string | null;
  createdAt: Date;
  _count: { noteTags: number };
}): ITagRecord {
  return {
    id: tag.id,
    userId: tag.userId,
    name: tag.name,
    normalizedName: tag.normalizedName,
    color: tag.color,
    noteCount: tag._count.noteTags,
    createdAt: tag.createdAt,
  };
}

export const TagRepository = {
  async findAllByUserId(userId: string): Promise<ITagRecord[]> {
    const tags = await prisma.tag.findMany({
      where: { userId },
      include: noteCountSelect,
    });
    return tags.map(mapRecord);
  },

  async findByIdAndUserId(id: string, userId: string): Promise<ITagRecord | null> {
    const tag = await prisma.tag.findFirst({
      where: { id, userId },
      include: noteCountSelect,
    });
    return tag ? mapRecord(tag) : null;
  },

  async findByNormalizedName(userId: string, normalizedName: string): Promise<ITagRecord | null> {
    const tag = await prisma.tag.findFirst({
      where: { userId, normalizedName },
      include: noteCountSelect,
    });
    return tag ? mapRecord(tag) : null;
  },

  async create(data: {
    userId: string;
    name: string;
    normalizedName: string;
    color?: string | null;
  }): Promise<ITagRecord> {
    const tag = await prisma.tag.create({
      data: {
        userId: data.userId,
        name: data.name,
        normalizedName: data.normalizedName,
        color: data.color ?? null,
      },
      include: noteCountSelect,
    });
    return mapRecord(tag);
  },

  async update(
    id: string,
    data: { name?: string; normalizedName?: string; color?: string | null }
  ): Promise<ITagRecord> {
    const tag = await prisma.tag.update({
      where: { id },
      data,
      include: noteCountSelect,
    });
    return mapRecord(tag);
  },

  async delete(id: string): Promise<void> {
    await prisma.tag.delete({ where: { id } });
  },

  async attachTagToNote(noteId: string, tagId: string): Promise<void> {
    await prisma.noteTag.upsert({
      where: { noteId_tagId: { noteId, tagId } },
      create: { noteId, tagId },
      update: {},
    });
  },

  async detachTagFromNote(noteId: string, tagId: string): Promise<void> {
    await prisma.noteTag.deleteMany({ where: { noteId, tagId } });
  },
};

export type { ITagRecord };
