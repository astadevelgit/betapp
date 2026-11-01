import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address.");

const password = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use no more than 72 characters.");

const dob = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter your date of birth.");

export function isAtLeast18(dateOfBirth: string): boolean {
  const parts = dateOfBirth.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  const [year, month, day] = parts;
  const today = new Date();
  const cutoff = new Date(
    Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()),
  );
  const birthDate = new Date(Date.UTC(year, month - 1, day));

  return birthDate <= cutoff;
}

export const registerSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Use at least 2 characters.")
      .max(40, "Use no more than 40 characters."),
    email,
    password,
    confirmPassword: z.string(),
    dob,
    country: z.literal("NG"),
    acceptTerms: z.literal("on", {
      error: "You must accept the terms and confirm you are 18+.",
    }),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }

    if (!isAtLeast18(values.dob)) {
      ctx.addIssue({
        code: "custom",
        path: ["dob"],
        message: "You must be at least 18 years old.",
      });
    }
  });

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  email,
});

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.password !== values.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export const waitlistSchema = z.object({
  email,
});
