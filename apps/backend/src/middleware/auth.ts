import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/token.js";
import { createError } from "./errorHandler.js";
import { ErrorCode } from "@noteapp/shared";

export interface AuthenticatedRequest extends Request {
  user: { userId: string; email: string };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(createError(401, ErrorCode.UNAUTHORIZED, "Missing or invalid Authorization header"));
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    next(createError(401, ErrorCode.TOKEN_EXPIRED, "Access token expired or invalid"));
  }
}
