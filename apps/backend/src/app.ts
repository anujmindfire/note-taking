import express, { type Application } from "express";
import cors from "cors";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { authRoutes } from "./routes/authRoutes.js";
import { noteRoutes } from "./routes/noteRoutes.js";
import { tagRoutes } from "./routes/tagRoutes.js";

export function createApp(): Application {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/notes", noteRoutes);
  app.use("/api/tags", tagRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
