import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { ISearchResult } from "@noteapp/shared";

type SearchRow = {
  id: string;
  highlight: string;
  rank: number;
};

type CountRow = {
  count: number;
};

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

type NoteWithTags = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;

function mapToSearchResult(note: NoteWithTags, highlight: string): ISearchResult {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    content: note.content,
    highlight: highlight,
    deletedAt: note.deletedAt ? note.deletedAt.toISOString() : null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    tags: note.noteTags.map((nt) => ({
      id: nt.tag.id,
      userId: nt.tag.userId,
      name: nt.tag.name,
      color: nt.tag.color,
      noteCount: nt.tag._count.noteTags,
      createdAt: nt.tag.createdAt.toISOString(),
    })),
  };
}

export const SearchRepository = {
  async search(params: {
    userId: string;
    q: string;
    page: number;
    limit: number;
    tagIds: string[];
  }): Promise<{ results: ISearchResult[]; total: number }> {
    const { userId, q, page, limit, tagIds } = params;
    const offset = (page - 1) * limit;

    const tagFilter =
      tagIds.length > 0
        ? Prisma.sql`AND n.id IN (
            SELECT nt."noteId" FROM "NoteTag" nt WHERE nt."tagId"::text = ANY(${tagIds})
          )`
        : Prisma.empty;

    const countRows = await prisma.$queryRaw<CountRow[]>(
      Prisma.sql`
        SELECT COUNT(*)::int AS count
        FROM "Note" n
        WHERE n."userId" = ${userId}
          AND n."deletedAt" IS NULL
          AND to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content, ''))
              @@ plainto_tsquery('english', ${q})
          ${tagFilter}
      `
    );

    const total = countRows[0]?.count ?? 0;

    if (total === 0) {
      return { results: [], total: 0 };
    }

    const searchRows = await prisma.$queryRaw<SearchRow[]>(
      Prisma.sql`
        SELECT
          n.id,
          ts_headline(
            'english',
            n.content,
            plainto_tsquery('english', ${q}),
            'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=30,MinWords=15'
          ) AS highlight,
          ts_rank(
            to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content, '')),
            plainto_tsquery('english', ${q})
          ) AS rank
        FROM "Note" n
        WHERE n."userId" = ${userId}
          AND n."deletedAt" IS NULL
          AND to_tsvector('english', coalesce(n.title, '') || ' ' || coalesce(n.content, ''))
              @@ plainto_tsquery('english', ${q})
          ${tagFilter}
        ORDER BY rank DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    );

    if (searchRows.length === 0) {
      return { results: [], total };
    }

    const noteIds = searchRows.map((r) => r.id);
    const notes = await prisma.note.findMany({
      where: { id: { in: noteIds }, deletedAt: null },
      include: noteInclude,
    });

    const highlightMap = new Map(searchRows.map((r) => [r.id, r.highlight ?? ""]));
    const rankIndexMap = new Map(searchRows.map((r, i) => [r.id, i]));

    const results = notes
      .sort((a, b) => (rankIndexMap.get(a.id) ?? 0) - (rankIndexMap.get(b.id) ?? 0))
      .map((note) => mapToSearchResult(note, highlightMap.get(note.id) ?? ""));

    return { results, total };
  },
};
