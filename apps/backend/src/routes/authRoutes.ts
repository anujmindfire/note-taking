import { Router, type Router as ExpressRouter } from "express";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { AuthService } from "../services/AuthService.js";
import { registerSchema, loginSchema, refreshSchema, forgotPasswordSchema, resetPasswordSchema } from "@noteapp/shared";
import type { TForgotPasswordInput, TResetPasswordInput } from "@noteapp/shared";
import type { AuthenticatedRequest } from "../middleware/auth.js";

const router: ExpressRouter = Router();

router.post("/register", validate(registerSchema), async (req, res, next) => {
  try {
    const result = await AuthService.register(req.body as Parameters<typeof AuthService.register>[0]);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post("/login", validate(loginSchema), async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body as Parameters<typeof AuthService.login>[0]);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", requireAuth, validate(refreshSchema), async (req, res, next) => {
  try {
    const { userId } = (req as AuthenticatedRequest).user;
    await AuthService.logout({ userId, refreshToken: (req.body as { refreshToken: string }).refreshToken });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

router.post("/refresh", validate(refreshSchema), async (req, res, next) => {
  try {
    const result = await AuthService.refreshToken(req.body as Parameters<typeof AuthService.refreshToken>[0]);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post("/forgot-password", validate(forgotPasswordSchema), async (req, res, next) => {
  try {
    const result = await AuthService.forgotPassword(req.body as TForgotPasswordInput);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-password", validate(resetPasswordSchema), async (req, res, next) => {
  try {
    const result = await AuthService.resetPassword(req.body as TResetPasswordInput);
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
});

export { router as authRoutes };
