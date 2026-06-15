import { ErrorCode } from "@noteapp/shared";
import type {
  ITagResponse,
  INoteResponse,
  TCreateTagInput,
  TUpdateTagInput,
  TListTagsQuery,
} from "@noteapp/shared";
import { TagRepository } from "../repositories/TagRepository.js";
import type { ITagRecord } from "../repositories/TagRepository.js";
import { NoteRepository } from "../repositories/NoteRepository.js";
import { createError } from "../middleware/errorHandler.js";

function mapTagToResponse(tag: ITagRecord): ITagResponse {
  return {
    id: tag.id,
    userId: tag.userId,
    name: tag.name,
    color: tag.color,
    noteCount: tag.noteCount,
    createdAt: tag.createdAt.toISOString(),
  };
}

function mapNoteToResponse(note: {
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
}): INoteResponse {
  return {
    id: note.id,
    userId: note.userId,
    title: note.title,
    content: note.content,
    deletedAt: note.deletedAt ? note.deletedAt.toISOString() : null,
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
    tags: note.tags.map((t) => ({
      id: t.id,
      userId: t.userId,
      name: t.name,
      color: t.color,
      noteCount: t.noteCount,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export const TagService = {
  async listTags(userId: string, query: TListTagsQuery): Promise<ITagResponse[]> {
    const tags = await TagRepository.findAllByUserId(userId);

    tags.sort((a, b) => {
      const dir = query.sortDir === "asc" ? 1 : -1;
      if (query.sortBy === "noteCount") {
        return (a.noteCount - b.noteCount) * dir;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) * dir;
    });

    return tags.map(mapTagToResponse);
  },

  async createTag(userId: string, data: TCreateTagInput): Promise<ITagResponse> {
    const normalizedName = data.name.trim().toLowerCase();

    const existing = await TagRepository.findByNormalizedName(userId, normalizedName);
    if (existing) {
      throw createError(422, ErrorCode.TAG_NAME_TAKEN, "Tag name already exists");
    }

    const tag = await TagRepository.create({
      userId,
      name: data.name.trim(),
      normalizedName,
      color: data.color ?? null,
    });

    return mapTagToResponse(tag);
  },

  async updateTag(id: string, userId: string, data: TUpdateTagInput): Promise<ITagResponse> {
    const existing = await TagRepository.findByIdAndUserId(id, userId);
    if (!existing) {
      throw createError(404, ErrorCode.TAG_NOT_FOUND, "Tag not found");
    }

    const payload: { name?: string; normalizedName?: string; color?: string | null } = {};

    if (data.name !== undefined) {
      const normalizedName = data.name.trim().toLowerCase();
      if (normalizedName !== existing.normalizedName) {
        const conflict = await TagRepository.findByNormalizedName(userId, normalizedName);
        if (conflict) {
          throw createError(422, ErrorCode.TAG_NAME_TAKEN, "Tag name already exists");
        }
      }
      payload.name = data.name.trim();
      payload.normalizedName = normalizedName;
    }

    if (data.color !== undefined) {
      payload.color = data.color;
    }

    if (Object.keys(payload).length === 0) {
      return mapTagToResponse(existing);
    }

    const updated = await TagRepository.update(id, payload);
    return mapTagToResponse(updated);
  },

  async deleteTag(id: string, userId: string): Promise<void> {
    const existing = await TagRepository.findByIdAndUserId(id, userId);
    if (!existing) {
      throw createError(404, ErrorCode.TAG_NOT_FOUND, "Tag not found");
    }
    await TagRepository.delete(id);
  },

  async attachTag(noteId: string, tagId: string, userId: string): Promise<INoteResponse> {
    const note = await NoteRepository.findByIdAndUserId(noteId, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }

    const tag = await TagRepository.findByIdAndUserId(tagId, userId);
    if (!tag) {
      throw createError(404, ErrorCode.TAG_NOT_FOUND, "Tag not found");
    }

    await TagRepository.attachTagToNote(noteId, tagId);

    const updated = await NoteRepository.findByIdAndUserId(noteId, userId);
    return mapNoteToResponse(updated!); // note exists — just fetched above
  },

  async detachTag(noteId: string, tagId: string, userId: string): Promise<INoteResponse> {
    const note = await NoteRepository.findByIdAndUserId(noteId, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }

    const tag = await TagRepository.findByIdAndUserId(tagId, userId);
    if (!tag) {
      throw createError(404, ErrorCode.TAG_NOT_FOUND, "Tag not found");
    }

    await TagRepository.detachTagFromNote(noteId, tagId);

    const updated = await NoteRepository.findByIdAndUserId(noteId, userId);
    return mapNoteToResponse(updated!); // note exists — just fetched above
  },
};
