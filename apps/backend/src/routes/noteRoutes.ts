import { Router, type Router as ExpressRouter } from "express";
import { validate, validateQuery } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { NoteService } from "../services/NoteService.js";
import { createNoteSchema, listNotesQuerySchema, updateNoteSchema } from "@noteapp/shared";
import type { TCreateNoteInput, TListNotesQuery, TUpdateNoteInput } from "@noteapp/shared";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router: ExpressRouter = Router();

router.get("/", requireAuth, validateQuery(listNotesQuerySchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const query = res.locals["parsedQuery"] as TListNotesQuery;
    const result = await NoteService.listNotes(userId, query);
    res.json({ data: result.notes, meta: result.meta });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, validate(createNoteSchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const note = await NoteService.createNote(userId, req.body as TCreateNoteInput);
    res.status(201).json({ data: note });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const note = await NoteService.getNote(req.params.id as string, userId);
    res.json({ data: note });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAuth, validate(updateNoteSchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const note = await NoteService.updateNote(req.params.id as string, userId, req.body as TUpdateNoteInput);
    res.json({ data: note });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    await NoteService.deleteNote(req.params.id as string, userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as noteRoutes };
