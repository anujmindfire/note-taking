import type { Request, Response, NextFunction } from "express";
import { ErrorCode } from "@noteapp/shared";

export interface AppError extends Error {
  statusCode: number;
  code: string;
  fields?: string[];
}

export function createError(
  statusCode: number,
  code: string,
  message: string,
  fields?: string[]
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  if (fields) err.fields = fields;
  return err;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? "INTERNAL_ERROR";
  const message = statusCode === 500 ? "Internal server error" : err.message;

  const body: { error: { code: string; message: string; fields?: string[] } } = {
    error: { code, message },
  };
  if (err.fields) body.error.fields = err.fields;

  res.status(statusCode).json(body);
}

export const notFound = (_req: Request, _res: Response, next: NextFunction): void => {
  const err = createError(404, ErrorCode.NOTE_NOT_FOUND, "Route not found");
  next(err);
};
