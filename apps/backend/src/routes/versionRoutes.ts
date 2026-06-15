import { Router, type Router as ExpressRouter } from "express";
import { requireAuth } from "../middleware/auth.js";
import { VersionService } from "../services/VersionService.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";

// mergeParams: true is required so req.params.id (noteId from parent router) is accessible
const router: ExpressRouter = Router({ mergeParams: true });

router.get("/", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const versions = await VersionService.listVersions(req.params["id"] as string, userId);
    res.json({ data: versions });
  } catch (err) {
    next(err);
  }
});

router.get("/:versionId", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const version = await VersionService.getVersion(
      req.params["id"] as string,
      req.params["versionId"] as string,
      userId
    );
    res.json({ data: version });
  } catch (err) {
    next(err);
  }
});

router.post("/:versionId/restore", requireAuth, async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    const note = await VersionService.restoreVersion(
      req.params["id"] as string,
      req.params["versionId"] as string,
      userId
    );
    res.json({ data: note });
  } catch (err) {
    next(err);
  }
});

export { router as versionRoutes };
