import { ErrorCode } from "@noteapp/shared";
import type { INoteVersion, INoteResponse } from "@noteapp/shared";
import { VersionRepository, type INoteVersionRecord } from "../repositories/VersionRepository.js";
import { NoteRepository } from "../repositories/NoteRepository.js";
import { createError } from "../middleware/errorHandler.js";

function mapToVersionResponse(v: INoteVersionRecord): INoteVersion {
  return {
    id: v.id,
    noteId: v.noteId,
    version: v.version,
    title: v.title,
    content: v.content,
    createdAt: v.createdAt.toISOString(),
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

export const VersionService = {
  async snapshot(noteId: string, title: string, content: string): Promise<void> {
    const maxVersion = await VersionRepository.getMaxVersion(noteId);
    await VersionRepository.create({ noteId, version: maxVersion + 1, title, content });
  },

  async listVersions(noteId: string, userId: string): Promise<INoteVersion[]> {
    const note = await NoteRepository.findByIdAndUserIdIncludeDeleted(noteId, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }
    const records = await VersionRepository.findAllByNoteId(noteId);
    return records.map(mapToVersionResponse);
  },

  async getVersion(
    noteId: string,
    versionId: string,
    userId: string
  ): Promise<INoteVersion> {
    const note = await NoteRepository.findByIdAndUserIdIncludeDeleted(noteId, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }
    const record = await VersionRepository.findByIdAndNoteId(versionId, noteId);
    if (!record) {
      throw createError(404, ErrorCode.VERSION_NOT_FOUND, "Version not found");
    }
    return mapToVersionResponse(record);
  },

  async restoreVersion(
    noteId: string,
    versionId: string,
    userId: string
  ): Promise<INoteResponse> {
    const note = await NoteRepository.findByIdAndUserIdIncludeDeleted(noteId, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }
    const record = await VersionRepository.findByIdAndNoteId(versionId, noteId);
    if (!record) {
      throw createError(404, ErrorCode.VERSION_NOT_FOUND, "Version not found");
    }
    const updated = await NoteRepository.restore(noteId, {
      title: record.title,
      content: record.content,
    });
    try {
      await VersionService.snapshot(noteId, record.title, record.content);
    } catch (err) {
      console.warn("[VersionService] snapshot failed after restore:", err);
    }
    return mapNoteToResponse(updated);
  },
};
