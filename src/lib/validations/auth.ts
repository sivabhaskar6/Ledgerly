import { z } from "zod";
export const emailSchema = z.object({ email: z.string().trim().email("Enter a valid email address") });
export const loginSchema = emailSchema.extend({ password: z.string().min(1, "Enter your password") });
export const signupSchema = emailSchema
  .extend({ name: z.string().trim().min(1, "Enter your name").max(80, "Keep your name under 80 characters"), password: z.string().min(8, "Use at least 8 characters"), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
export const resetSchema = z
  .object({ password: z.string().min(8, "Use at least 8 characters"), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });
export const nameSchema = z.object({ name: z.string().trim().min(1, "Enter your name").max(80, "Keep your name under 80 characters") });
