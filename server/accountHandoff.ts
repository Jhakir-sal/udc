import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { caseEvents, connectedAccounts, notifications } from "@shared/schema";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((value) => value === "" ? null : value);

export const adminAccountUpdateSchema = z.object({
  status: z.enum(["active", "pending_action", "suspended", "closed"]).optional(),
  selectedAction: z.enum(["close", "suspend", "continue", "transfer"]).nullable().optional(),
  taskCompletionStatus: z.enum(["pending", "successful", "not_completed", "unsuccessful"]).optional(),
  notes: z.string().max(20000).nullable().optional(),
  responsibleParty: z.enum(["family", "sal_team"]).optional(),
  familyActionInstructions: optionalText(4000),
  familyContactPhone: z.string().trim().max(60).refine(
    (value) => !value || (/^[+\d()\s.x-]+$/i.test(value) && value.replace(/\D/g, "").length >= 7),
    "Enter a phone number, or leave it blank.",
  ).nullable().optional().transform((value) => value === "" ? null : value),
  familyContactEmail: z.union([z.literal(""), z.string().trim().email().max(320)])
    .nullable().optional().transform((value) => value === "" ? null : value),
}).strict().refine((data) => Object.values(data).some((value) => value !== undefined), "No changes supplied.");

export const ACCOUNT_HANDOFF_FIELDS = [
  "responsibleParty", "selectedAction", "familyActionInstructions", "familyContactPhone", "familyContactEmail",
] as const;

export function familyAccountView(account: typeof connectedAccounts.$inferSelect) {
  return {
    ...account,
    notes: null,
    familyActionInstructions: account.responsibleParty === "family" ? account.familyActionInstructions : null,
    familyContactPhone: account.responsibleParty === "family" ? account.familyContactPhone : null,
    familyContactEmail: account.responsibleParty === "family" ? account.familyContactEmail : null,
  };
}

/** Persist the edit and its in-app handoff history together. This never sends email, SMS or a provider notice. */
export async function saveAdminAccountUpdate(
  certificateId: string,
  accountId: string,
  updates: Partial<typeof connectedAccounts.$inferInsert>,
  actor: { id: string | null; name: string | null },
) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(connectedAccounts)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.certificateId, certificateId)))
      .for("update");
    if (!current) return undefined;
    const changed = ACCOUNT_HANDOFF_FIELDS.filter((field) =>
      updates[field] !== undefined && (updates[field] ?? null) !== (current[field] ?? null));
    const [updated] = await tx.update(connectedAccounts).set(updates)
      .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.certificateId, certificateId)))
      .returning();
    if (changed.length) {
      const familyResponsible = updated.responsibleParty === "family";
      const description = changed.includes("responsibleParty")
        ? `${current.accountName}: responsibility changed to ${familyResponsible ? "Family" : "SAL Team"}.`
        : `${current.accountName}: ${familyResponsible ? "family action details" : "account action details"} updated.`;
      await tx.insert(caseEvents).values({
        certificateId, actorId: actor.id, actorName: actor.name, actorRole: "admin",
        eventType: "account_handoff_updated", description,
      });
      await tx.insert(notifications).values({
        certificateId, accountId, type: "action_taken",
        message: `${description} Open the account to review the current instructions.`,
      });
    }
    return updated;
  });
}
