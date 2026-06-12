import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { createError } from "./errorHandler.js";
import { ErrorCode } from "@noteapp/shared";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));
      return next(
        createError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", fields)
      );
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path.join("."));
      return next(
        createError(400, ErrorCode.VALIDATION_ERROR, "Validation failed", fields)
      );
    }
    res.locals["parsedQuery"] = result.data;
    next();
  };
}
