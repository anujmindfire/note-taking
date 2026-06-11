import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[a-z]/, "Must contain lowercase")
    .regex(/[0-9]/, "Must contain digit"),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const createNoteSchema = z.object({
  title: z.string().min(1).max(255).default("Untitled"),
  content: z.string().default(""),
});

export const updateNoteSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().optional(),
});

export const createTagSchema = z.object({
  name: z.string().min(1).max(50).trim(),
});

export type TRegisterInput = z.infer<typeof registerSchema>;
export type TLoginInput = z.infer<typeof loginSchema>;
export type TRefreshInput = z.infer<typeof refreshSchema>;
export type TCreateNoteInput = z.infer<typeof createNoteSchema>;
export type TUpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type TCreateTagInput = z.infer<typeof createTagSchema>;
