import { Router, type Router as ExpressRouter } from "express";
import { ShareLinkService } from "../services/ShareLinkService.js";

const router: ExpressRouter = Router();

router.get("/:token", async (req, res, next) => {
  try {
    const note = await ShareLinkService.accessPublicLink(req.params.token as string);
    res.json({ data: note });
  } catch (err) {
    next(err);
  }
});

export { router as publicShareRoutes };
