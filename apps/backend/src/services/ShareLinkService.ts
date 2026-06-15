import { randomBytes } from "node:crypto";
import { ErrorCode } from "@noteapp/shared";
import type { ISharedLinkResponse, INoteResponse, TCreateShareLinkInput } from "@noteapp/shared";
import {
  ShareLinkRepository,
  type IShareLinkRecord,
  type IShareLinkWithNote,
} from "../repositories/ShareLinkRepository.js";
import { NoteRepository } from "../repositories/NoteRepository.js";
import { createError } from "../middleware/errorHandler.js";

function mapShareLinkToResponse(link: IShareLinkRecord): ISharedLinkResponse {
  return {
    id: link.id,
    noteId: link.noteId,
    token: link.token,
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
    revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
    viewCount: link.viewCount,
    createdAt: link.createdAt.toISOString(),
  };
}

function mapNoteToResponse(note: IShareLinkWithNote["note"]): INoteResponse {
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

export const ShareLinkService = {
  async generateLink(
    noteId: string,
    userId: string,
    data: TCreateShareLinkInput
  ): Promise<ISharedLinkResponse> {
    const note = await NoteRepository.findByIdAndUserId(noteId, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }

    const token = randomBytes(32).toString("hex");
    const link = await ShareLinkRepository.create({
      noteId,
      token,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    });

    return mapShareLinkToResponse(link);
  },

  async listLinks(noteId: string, userId: string): Promise<ISharedLinkResponse[]> {
    const note = await NoteRepository.findByIdAndUserId(noteId, userId);
    if (!note) {
      throw createError(404, ErrorCode.NOTE_NOT_FOUND, "Note not found");
    }

    const links = await ShareLinkRepository.findAllByNoteId(noteId);
    return links.map(mapShareLinkToResponse);
  },

  async revokeLink(shareId: string, userId: string): Promise<ISharedLinkResponse> {
    const link = await ShareLinkRepository.findByIdForOwner(shareId, userId);
    if (!link) {
      throw createError(404, ErrorCode.SHARE_NOT_FOUND, "Share link not found");
    }

    if (link.revokedAt !== null) {
      return mapShareLinkToResponse(link);
    }

    const revoked = await ShareLinkRepository.revoke(shareId);
    return mapShareLinkToResponse(revoked);
  },

  async accessPublicLink(token: string): Promise<INoteResponse> {
    const link = await ShareLinkRepository.findByToken(token);
    if (!link) {
      throw createError(404, ErrorCode.SHARE_NOT_FOUND, "Share link not found");
    }

    if (link.revokedAt !== null) {
      throw createError(403, ErrorCode.SHARE_REVOKED, "Share link has been revoked");
    }

    if ((link.expiresAt && link.expiresAt < new Date()) || link.note.deletedAt !== null) {
      throw createError(410, ErrorCode.SHARE_EXPIRED, "Share link has expired");
    }

    await ShareLinkRepository.incrementViewCount(link.id);
    return mapNoteToResponse(link.note);
  },
};
