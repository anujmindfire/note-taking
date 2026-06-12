import { ErrorCode } from "@noteapp/shared";
import type { INoteResponse, TCreateNoteInput, TUpdateNoteInput } from "@noteapp/shared";
import { NoteRepository } from "../repositories/NoteRepository.js";
import { createError } from "../middleware/errorHandler.js";

function mapToResponse(note: {
  id: string;
  userId: string;
  title: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Array<{ id: string; userId: string; name: string; createdAt: Date }>;
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
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

export const NoteService = {
  async listNotes(userId: string): Promise<INoteResponse[]> {
    const notes = await NoteRepository.findAllByUserId(userId);
    return notes.map(mapToResponse);
  },

  async getNote(id: string, userId: string): Promise<INoteResponse> {
    const note = await NoteRepository.findByIdAndUserId(id, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }
    return mapToResponse(note);
  },

  async createNote(userId: string, data: TCreateNoteInput): Promise<INoteResponse> {
    const note = await NoteRepository.create({ userId, title: data.title, content: data.content });
    return mapToResponse(note);
  },

  async updateNote(id: string, userId: string, data: TUpdateNoteInput): Promise<INoteResponse> {
    const existing = await NoteRepository.findByIdAndUserId(id, userId);
    if (!existing) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }
    const updated = await NoteRepository.update(id, data);
    return mapToResponse(updated);
  },

  async deleteNote(id: string, userId: string): Promise<void> {
    const existing = await NoteRepository.findByIdAndUserId(id, userId);
    if (!existing) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }
    await NoteRepository.softDelete(id);
  },
};
