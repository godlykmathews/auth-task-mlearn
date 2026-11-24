import { z } from "zod";

const email = z.string({ error: "Enter your email address." }).trim().toLowerCase()
  .min(1, "Enter your email address.").max(254, "Email must be 254 characters or fewer.")
  .email("Enter a valid email address.");
const password = z.string({ error: "Enter your password." })
  .min(8, "Use at least 8 characters.").max(128, "Use no more than 128 characters.");

export const loginSchema = z.object({ email, password });
export const signupSchema = z.object({
  name: z.string({ error: "Enter your name." }).trim().min(1, "Enter your name.").max(80, "Use no more than 80 characters."),
  email,
  password,
  confirmPassword: z.string({ error: "Confirm your password." }).max(128),
}).refine((value) => value.password === value.confirmPassword, {
  message: "Passwords do not match.", path: ["confirmPassword"],
});

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  return fields;
}
