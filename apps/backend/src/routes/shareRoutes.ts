import { Router, type Router as ExpressRouter } from "express";
import { requireAuth } from "../middleware/auth.js";
import { ShareLinkService } from "../services/ShareLinkService.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router: ExpressRouter = Router();

router.post("/:shareId/revoke", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const link = await ShareLinkService.revokeLink(req.params.shareId as string, userId);
    res.json({ data: link });
  } catch (err) {
    next(err);
  }
});

export { router as shareRoutes };
