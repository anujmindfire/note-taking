import { Router, type Router as ExpressRouter } from "express";
import { validateQuery } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { SearchService } from "../services/SearchService.js";
import { searchQuerySchema } from "@noteapp/shared";
import type { TSearchQuery } from "@noteapp/shared";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router: ExpressRouter = Router();

router.get("/", requireAuth, validateQuery(searchQuerySchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const query = res.locals["parsedQuery"] as TSearchQuery;
    const result = await SearchService.search(userId, query);
    res.json({ data: result.results, meta: result.meta });
  } catch (err) {
    next(err);
  }
});

export { router as searchRoutes };
