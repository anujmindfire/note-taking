import { prisma } from "../lib/prisma.js";

export interface IShareLinkRecord {
  id: string;
  noteId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
}

export interface IShareLinkWithNote extends IShareLinkRecord {
  note: {
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
  };
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

function mapRecord(link: {
  id: string;
  noteId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
}): IShareLinkRecord {
  return {
    id: link.id,
    noteId: link.noteId,
    token: link.token,
    expiresAt: link.expiresAt,
    revokedAt: link.revokedAt,
    viewCount: link.viewCount,
    createdAt: link.createdAt,
  };
}

function mapWithNote(link: {
  id: string;
  noteId: string;
  token: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  viewCount: number;
  createdAt: Date;
  note: {
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
  };
}): IShareLinkWithNote {
  return {
    ...mapRecord(link),
    note: {
      id: link.note.id,
      userId: link.note.userId,
      title: link.note.title,
      content: link.note.content,
      deletedAt: link.note.deletedAt,
      createdAt: link.note.createdAt,
      updatedAt: link.note.updatedAt,
      tags: link.note.noteTags.map((nt) => ({
        id: nt.tag.id,
        userId: nt.tag.userId,
        name: nt.tag.name,
        color: nt.tag.color,
        noteCount: nt.tag._count.noteTags,
        createdAt: nt.tag.createdAt,
      })),
    },
  };
}

export const ShareLinkRepository = {
  async create(data: {
    noteId: string;
    token: string;
    expiresAt: Date | null;
  }): Promise<IShareLinkRecord> {
    const link = await prisma.sharedLink.create({
      data: { noteId: data.noteId, token: data.token, expiresAt: data.expiresAt },
    });
    return mapRecord(link);
  },

  async findAllByNoteId(noteId: string): Promise<IShareLinkRecord[]> {
    const links = await prisma.sharedLink.findMany({
      where: { noteId },
      orderBy: { createdAt: "desc" },
    });
    return links.map(mapRecord);
  },

  async findByIdForOwner(id: string, userId: string): Promise<IShareLinkRecord | null> {
    const link = await prisma.sharedLink.findFirst({
      where: { id, note: { userId } },
    });
    return link ? mapRecord(link) : null;
  },

  async findByToken(token: string): Promise<IShareLinkWithNote | null> {
    const link = await prisma.sharedLink.findFirst({
      where: { token },
      include: { note: { include: noteInclude } },
    });
    return link ? mapWithNote(link) : null;
  },

  async revoke(id: string): Promise<IShareLinkRecord> {
    const link = await prisma.sharedLink.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
    return mapRecord(link);
  },

  async incrementViewCount(id: string): Promise<void> {
    await prisma.sharedLink.update({
      where: { id },
      data: { viewCount: { increment: 1 } },
    });
  },
};
