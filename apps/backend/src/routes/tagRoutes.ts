import { Router, type Router as ExpressRouter } from "express";
import { validate, validateQuery } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { TagService } from "../services/TagService.js";
import {
  createTagSchema,
  updateTagSchema,
  listTagsQuerySchema,
} from "@noteapp/shared";
import type { TCreateTagInput, TUpdateTagInput, TListTagsQuery } from "@noteapp/shared";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router: ExpressRouter = Router();

router.get("/", requireAuth, validateQuery(listTagsQuerySchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const query = res.locals["parsedQuery"] as TListTagsQuery;
    const tags = await TagService.listTags(userId, query);
    res.json({ data: tags });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireAuth, validate(createTagSchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const tag = await TagService.createTag(userId, req.body as TCreateTagInput);
    res.status(201).json({ data: tag });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireAuth, validate(updateTagSchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const tag = await TagService.updateTag(
      req.params["id"] as string,
      userId,
      req.body as TUpdateTagInput
    );
    res.json({ data: tag });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    await TagService.deleteTag(req.params["id"] as string, userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export { router as tagRoutes };
