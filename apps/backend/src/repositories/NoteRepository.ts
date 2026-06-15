import { prisma } from "../lib/prisma.js";

interface INoteRecord {
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
}

const noteInclude = {
  noteTags: {
    include: {
      tag: {
        include: {
          _count: {
            select: {
              noteTags: { where: { note: { deletedAt: null } } },
            },
          },
        },
      },
    },
  },
} as const;

function mapRecord(note: {
  id: string;
  userId: string;
  title: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  noteTags: Array<{
    tag: {
      id: string;
      userId: string;
      name: string;
      color: string | null;
      createdAt: Date;
      _count: { noteTags: number };
    };
  }>;
}): INoteRecord {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    content: note.content,
    deletedAt: note.deletedAt,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    tags: note.noteTags.map((nt) => ({
      id: nt.tag.id,
      userId: nt.tag.userId,
      name: nt.tag.name,
      color: nt.tag.color,
      noteCount: nt.tag._count.noteTags,
      createdAt: nt.tag.createdAt,
    })),
  };
}

export const NoteRepository = {
  async findAllByUserId(userId: string): Promise<INoteRecord[]> {
    const notes = await prisma.note.findMany({
      where: { userId, deletedAt: null },
      include: noteInclude,
    });
    return notes.map(mapRecord);
  },

  async findByIdAndUserId(id: string, userId: string): Promise<INoteRecord | null> {
    const note = await prisma.note.findFirst({
      where: { id, userId, deletedAt: null },
      include: noteInclude,
    });
    return note ? mapRecord(note) : null;
  },

  async findByIdAndUserIdIncludeDeleted(
    id: string,
    userId: string
  ): Promise<INoteRecord | null> {
    const note = await prisma.note.findFirst({
      where: { id, userId },
      include: noteInclude,
    });
    return note ? mapRecord(note) : null;
  },

  async restore(
    id: string,
    data: { title: string; content: string }
  ): Promise<INoteRecord> {
    const note = await prisma.note.update({
      where: { id },
      data: { title: data.title, content: data.content, deletedAt: null },
      include: noteInclude,
    });
    return mapRecord(note);
  },

  async create(data: { userId: string; title: string; content: string }): Promise<INoteRecord> {
    const note = await prisma.note.create({
      data,
      include: noteInclude,
    });
    return mapRecord(note);
  },

  async update(id: string, data: { title?: string; content?: string }): Promise<INoteRecord> {
    const note = await prisma.note.update({
      where: { id },
      data,
      include: noteInclude,
    });
    return mapRecord(note);
  },

  async softDelete(id: string): Promise<void> {
    await prisma.note.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async findPaginated(
    userId: string,
    params: {
      page: number;
      limit: number;
      sortBy: "createdAt" | "updatedAt";
      sortDir: "asc" | "desc";
      tagIds: string[];
    }
  ): Promise<{ notes: INoteRecord[]; total: number }> {
    const where = {
      userId,
      deletedAt: null,
      ...(params.tagIds.length > 0
        ? { noteTags: { some: { tagId: { in: params.tagIds } } } }
        : {}),
    };

    const [rows, total] = await prisma.$transaction([
      prisma.note.findMany({
        where,
        include: noteInclude,
        orderBy: { [params.sortBy]: params.sortDir },
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.note.count({ where }),
    ]);

    return { notes: rows.map(mapRecord), total };
  },
};
