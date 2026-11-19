import { z } from "zod";
import { ACCOUNT_CATEGORIES } from "./schema";

export const intakeAccountSchema = z.object({
  accountName: z.string().trim().min(1).max(160),
  accountType: z.string().trim().min(1).max(100),
  category: z.enum(ACCOUNT_CATEGORIES),
  accountNumberLast4: z.string().regex(/^\d{4}$/).nullable().default(null),
  isJoint: z.boolean().default(false),
}).strict();

export const analyzeAccountEmailSchema = z.object({
  text: z.string().trim().min(10).max(30_000),
}).strict();

export const importAccountEmailSchema = z.object({
  confirmed: z.literal(true),
  accounts: z.array(intakeAccountSchema).min(1).max(20),
}).strict();

export type IntakeAccount = z.infer<typeof intakeAccountSchema>;
export type IntakeCandidate = IntakeAccount & { duplicate: boolean; duplicateOf?: string };
